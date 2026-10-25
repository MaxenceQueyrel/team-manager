from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException

from api.core.deps import require_org_member
from api.models.assignment import Assignment, AssignmentCreate
from api.models.project import Project
from api.models.team import Team, TeamCreate
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module
from api.v1 import projects as projects_module
from optimizer.models import ProjectInput
from optimizer.schedule import schedule_anchor, shift_project

router = APIRouter()
repo: FileRepository[Team] = FileRepository("teams", Team)


@router.get("/", response_model=list[Team])
def list_teams(organization_id: str = Depends(require_org_member)):
    return repo.list(organization_id)


@router.get("/{team_id}", response_model=Team)
def get_team(team_id: str, organization_id: str = Depends(require_org_member)):
    team = repo.get(team_id, organization_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.post("/", response_model=Team, status_code=201)
def create_team(data: TeamCreate, organization_id: str = Depends(require_org_member)):
    return repo.create(
        {**data.model_dump(), "is_optimized": True, "created_at": datetime.now(UTC)},
        organization_id,
    )


def _shift_to_start(project: Project, start: date) -> Project:
    schedule = ProjectInput(
        id=project.id, date_ranges=project.date_ranges, phases=project.phases
    )
    anchor = schedule_anchor(schedule)
    # A project without dates has nothing to shift; resolving its assignments
    # rejects the team afterwards.
    if anchor is None or anchor == start:
        return project
    shifted = shift_project(schedule, start - anchor)
    return project.model_copy(
        update={"date_ranges": shifted.date_ranges, "phases": shifted.phases}
    )


def _resolve_assignments(team: Team, project: Project) -> list[AssignmentCreate]:
    phases_by_id = {phase.id: phase for phase in project.phases}
    resolved: list[AssignmentCreate] = []
    for member in team.members:
        if member.phase_id is not None:
            phase = phases_by_id.get(member.phase_id)
            if phase is None or phase.date_range is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Phase '{member.phase_id}' has no date range",
                )
            date_ranges = [phase.date_range]
        else:
            if not project.date_ranges:
                raise HTTPException(
                    status_code=400, detail="Project has no date ranges"
                )
            date_ranges = project.date_ranges
        for date_range in date_ranges:
            resolved.append(
                AssignmentCreate(
                    person_id=member.person_id,
                    project_id=project.id,
                    ratio=member.fte_allocation,
                    start=date_range.start,
                    end=date_range.end,
                    phase_id=member.phase_id,
                )
            )
    return resolved


def _over_allocated_person_ids(
    new_assignments: list[AssignmentCreate], kept: list[Assignment]
) -> list[str]:
    over_allocated: list[str] = []
    for i, candidate in enumerate(new_assignments):
        others = [*kept, *new_assignments[:i], *new_assignments[i + 1 :]]
        overlapping_ratio = sum(
            other.ratio
            for other in others
            if other.person_id == candidate.person_id
            and assignments_module._overlaps(
                other.start, other.end, candidate.start, candidate.end
            )
        )
        if (
            overlapping_ratio + candidate.ratio > 1.0
            and candidate.person_id not in over_allocated
        ):
            over_allocated.append(candidate.person_id)
    return over_allocated


@router.post("/{team_id}/apply", response_model=list[Assignment], status_code=201)
def apply_team(team_id: str, organization_id: str = Depends(require_org_member)):
    """Commits a team proposal as the project's assignments for the phases it covers.

    Existing project assignments for those phases (or the unphased ones, for a
    non-phased team) are replaced. A team found at a shifted start
    (`team.start_date`) first moves the project's whole schedule so it starts
    on that date; `start_window` is kept. Nothing is written, neither
    assignments nor project dates, if any date cannot be resolved or any
    person would exceed 1.0 FTE.

    Args:
        team_id: The team to apply.
        organization_id: The active organization.

    Returns:
        The created assignments.

    Raises:
        HTTPException: 404 if the team or its project is not found; 400 if a
            phase or the project lacks dates, or if a person would be
            over-allocated.
    """
    team = repo.get(team_id, organization_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    project = projects_module.repo.get(team.project_id, organization_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    scheduled = project
    if team.start_date is not None:
        scheduled = _shift_to_start(project, team.start_date)

    new_assignments = _resolve_assignments(team, scheduled)

    covered_phase_ids = {member.phase_id for member in team.members}
    replaced: list[Assignment] = []
    kept: list[Assignment] = []
    for existing in assignments_module.repo.list(organization_id):
        if existing.project_id == project.id and existing.phase_id in covered_phase_ids:
            replaced.append(existing)
        else:
            kept.append(existing)

    over_allocated = _over_allocated_person_ids(new_assignments, kept)
    if over_allocated:
        raise HTTPException(
            status_code=400,
            detail=(
                "Applying this team would exceed 1.0 FTE for: "
                + ", ".join(over_allocated)
            ),
        )

    if scheduled != project:
        projects_module.repo.update(
            project.id,
            scheduled.model_dump(exclude={"id", "organization_id"}),
            organization_id,
        )
    for existing in replaced:
        assignments_module.repo.delete(existing.id, organization_id)
    return [
        assignments_module.repo.create(assignment.model_dump(), organization_id)
        for assignment in new_assignments
    ]


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: str, organization_id: str = Depends(require_org_member)):
    if not repo.delete(team_id, organization_id):
        raise HTTPException(status_code=404, detail="Team not found")
