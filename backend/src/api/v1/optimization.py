from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException

from api.core.deps import require_org_member, require_permission
from api.models.assignment import Assignment
from api.models.person import Person
from api.models.project import Project
from api.models.team import (
    InfeasibilityDetail,
    OptimizationRequest,
    OptimizationResponse,
    Team,
    TeamProposal,
)

from api.repositories.file_repository import FileRepository

from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
from optimizer.domain.solver import AssignmentSolverPort, InfeasibleAssignmentError
from optimizer.models import AvailabilityWindow, ProjectInput

router = APIRouter()
solver: AssignmentSolverPort = PuLPTeamAssignmentSolver()


@router.post(
    "/solve",
    response_model=OptimizationResponse,
    dependencies=[Depends(require_permission("optimization:run"))],
)
def solve_assignment(
    request: OptimizationRequest, organization_id: str = Depends(require_org_member)
):
    projects_repo: FileRepository[Project] = FileRepository("projects", Project)
    people_repo: FileRepository[Person] = FileRepository("people", Person)
    teams_repo: FileRepository[Team] = FileRepository("teams", Team)
    assignments_repo: FileRepository[Assignment] = FileRepository(
        "assignments", Assignment
    )

    project = projects_repo.get(request.project_id, organization_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    people = people_repo.list(organization_id)

    # The solved project's own assignments are left out so re-optimizing a staffed
    # project doesn't treat its current members as busy and never re-propose them.
    committed: dict[str, list[AvailabilityWindow]] = {}
    for a in assignments_repo.list(organization_id):
        if a.project_id == project.id:
            continue
        committed.setdefault(a.person_id, []).append(
            AvailabilityWindow(start=a.start, end=a.end, ratio=a.ratio)
        )

    project_input = ProjectInput(
        id=project.id,
        n_slots=project.n_slots,
        skill_requirements=project.skill_requirements,
        excluded_person_ids=project.excluded_person_ids,
        included_person_ids=project.included_person_ids,
        squads=project.squads,
        date_ranges=project.date_ranges,
        phases=project.phases,
    )

    people_inputs = [p.to_person_input(committed.get(p.id, [])) for p in people]

    try:
        pool = solver.solve_pool(
            project_input,
            people_inputs,
            request.weights,
            request.respect_exclusions,
            n_alternatives=request.n_alternatives,
        )
    except InfeasibleAssignmentError as exc:
        raise HTTPException(
            status_code=409,
            detail=InfeasibilityDetail(
                message=str(exc), project_id=exc.project_id, conflicts=exc.conflicts
            ).model_dump(mode="json"),
        ) from exc
    best, alternatives = pool[0], pool[1:]

    saved = teams_repo.create(
        {
            "project_id": best.project_id,
            "members": [m.model_dump() for m in best.members],
            "is_optimized": True,
            "optimization_score": best.score,
            "optimization_max_score": best.max_score,
            "coverage": [c.model_dump() for c in best.coverage],
            "fully_covered": best.fully_covered,
            "created_at": datetime.now(UTC),
        },
        organization_id,
    )
    return OptimizationResponse(
        best=saved,
        alternatives=[
            TeamProposal(
                members=alternative.members,
                optimization_score=alternative.score,
                optimization_max_score=alternative.max_score,
                coverage=alternative.coverage,
                fully_covered=alternative.fully_covered,
            )
            for alternative in alternatives
        ],
    )
