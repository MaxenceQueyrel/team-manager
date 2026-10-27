from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from api.core.deps import require_org_member
from api.models.assignment import Assignment, AssignmentBase, AssignmentCreate
from api.models.project import Project
from api.models.team import ApplyBatchRequest, Team, TeamCreate
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module
from api.v1 import projects as projects_module
from optimizer.grid import GRID_TOLERANCE
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


def _schedule(project: Project) -> ProjectInput:
    return ProjectInput(
        id=project.id, date_ranges=project.date_ranges, phases=project.phases
    )


def _start_offset(project: Project, start: date) -> timedelta:
    anchor = schedule_anchor(_schedule(project))
    # A project without dates has nothing to shift; resolving its assignments
    # rejects the team afterwards.
    if anchor is None:
        return timedelta(0)
    return start - anchor


def _shift_schedule(project: Project, offset: timedelta) -> Project:
    shifted = shift_project(_schedule(project), offset)
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
    candidates: list[AssignmentBase], kept: list[Assignment]
) -> list[str]:
    over_allocated: list[str] = []
    for person_id in dict.fromkeys(candidate.person_id for candidate in candidates):
        own_candidates = [c for c in candidates if c.person_id == person_id]
        own = [*own_candidates, *(k for k in kept if k.person_id == person_id)]
        # The load is checked per period, as the optimizer does: the set of active
        # assignments only changes on a boundary, so checking each boundary day
        # covers every day. Two assignments that both overlap a third one but not
        # each other are never summed together.
        boundaries = {a.start for a in own} | {a.end + timedelta(days=1) for a in own}
        for day in sorted(boundaries):
            if not any(c.start <= day <= c.end for c in own_candidates):
                continue
            load = sum(a.ratio for a in own if a.start <= day <= a.end)
            if load > 1.0 + GRID_TOLERANCE:
                over_allocated.append(person_id)
                break
    return over_allocated


@router.post("/{team_id}/apply", response_model=list[Assignment], status_code=201)
def apply_team(team_id: str, organization_id: str = Depends(require_org_member)):
    """Commits a team proposal as the project's assignments for the phases it covers.

    Existing project assignments for those phases (or the unphased ones, for a
    non-phased team) are replaced. A team found at a shifted start
    (`team.start_date`) first moves the project's whole schedule so it starts
    on that date, and the project's other assignments move with it;
    `start_window` is kept. Nothing is written, neither assignments nor
    project dates, if any date cannot be resolved or any person would exceed
    1.0 FTE.

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

    offset = timedelta(0)
    if team.start_date is not None:
        offset = _start_offset(project, team.start_date)
    scheduled = _shift_schedule(project, offset) if offset else project

    new_assignments = _resolve_assignments(team, scheduled)

    covered_phase_ids = {member.phase_id for member in team.members}
    replaced: list[Assignment] = []
    moved: list[Assignment] = []
    kept: list[Assignment] = []
    for existing in assignments_module.repo.list(organization_id):
        if existing.project_id != project.id:
            kept.append(existing)
        elif existing.phase_id in covered_phase_ids:
            replaced.append(existing)
        elif offset:
            moved.append(
                existing.model_copy(
                    update={
                        "start": existing.start + offset,
                        "end": existing.end + offset,
                    }
                )
            )
        else:
            kept.append(existing)

    over_allocated = _over_allocated_person_ids([*new_assignments, *moved], kept)
    if over_allocated:
        raise HTTPException(
            status_code=400,
            detail=(
                "Applying this team would exceed 1.0 FTE for: "
                + ", ".join(over_allocated)
            ),
        )

    if offset:
        projects_module.repo.update(
            project.id,
            scheduled.model_dump(exclude={"id", "organization_id"}),
            organization_id,
        )
    for assignment in moved:
        assignments_module.repo.update(
            assignment.id,
            assignment.model_dump(exclude={"id", "organization_id"}),
            organization_id,
        )
    for existing in replaced:
        assignments_module.repo.delete(existing.id, organization_id)
    return [
        assignments_module.repo.create(assignment.model_dump(), organization_id)
        for assignment in new_assignments
    ]


@router.post("/apply-batch", response_model=list[Assignment], status_code=201)
def apply_teams(
    request: ApplyBatchRequest, organization_id: str = Depends(require_org_member)
):
    """Commits several teams, each of a different project, all at once or not at all.

    Each team replaces its project's assignments for the phases it covers, as
    `apply_team` does. The FTE check runs over every new assignment together,
    against the assignments that are kept. Nothing is written if any team
    fails.

    Args:
        request: The teams to apply.
        organization_id: The active organization.

    Returns:
        The created assignments, team by team in request order.

    Raises:
        HTTPException: 404 if a team or its project is not found; 400 if two
            teams belong to the same project, a team has a shifted start, a
            phase or project lacks dates, or a person would be over-allocated.
    """
    teams_and_projects: list[tuple[Team, Project]] = []
    for team_id in request.team_ids:
        team = repo.get(team_id, organization_id)
        if not team:
            raise HTTPException(status_code=404, detail=f"Team '{team_id}' not found")
        project = projects_module.repo.get(team.project_id, organization_id)
        if not project:
            raise HTTPException(
                status_code=404, detail=f"Project of team '{team_id}' not found"
            )
        teams_and_projects.append((team, project))

    project_ids = [project.id for _, project in teams_and_projects]
    if len(set(project_ids)) != len(project_ids):
        raise HTTPException(
            status_code=400, detail="Each team must belong to a different project"
        )
    for team, _ in teams_and_projects:
        if team.start_date is not None:
            raise HTTPException(
                status_code=400,
                detail=f"Team '{team.id}' has a shifted start; apply it on its own",
            )

    new_assignments: list[AssignmentBase] = []
    covered: set[tuple[str, str | None]] = set()
    for team, project in teams_and_projects:
        new_assignments.extend(_resolve_assignments(team, project))
        covered.update((project.id, member.phase_id) for member in team.members)

    replaced: list[Assignment] = []
    kept: list[Assignment] = []
    for existing in assignments_module.repo.list(organization_id):
        if (existing.project_id, existing.phase_id) in covered:
            replaced.append(existing)
        else:
            kept.append(existing)

    over_allocated = _over_allocated_person_ids(new_assignments, kept)
    if over_allocated:
        raise HTTPException(
            status_code=400,
            detail=(
                "Applying these teams would exceed 1.0 FTE for: "
                + ", ".join(over_allocated)
            ),
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
