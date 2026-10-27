from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException

from api.core.deps import require_org_member, require_permission
from api.models.assignment import Assignment
from api.models.person import Person
from api.models.project import Project
from api.models.team import (
    BatchInfeasibilityDetail,
    BatchOptimizationRequest,
    BatchOptimizationResponse,
    InfeasibilityDetail,
    OptimizationRequest,
    OptimizationResponse,
    StartCandidateProposal,
    Team,
    TeamProposal,
)

from api.repositories.file_repository import FileRepository

from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
from optimizer.domain.solver import (
    AssignmentSolverPort,
    InfeasibleAssignmentError,
    InfeasiblePortfolioError,
)
from optimizer.models import (
    AssignmentResult,
    AvailabilityWindow,
    PortfolioProject,
    ProjectInput,
    StartCandidate,
)

router = APIRouter()
solver: AssignmentSolverPort = PuLPTeamAssignmentSolver()


def _proposal(result: AssignmentResult) -> TeamProposal:
    return TeamProposal(
        members=result.members,
        optimization_score=result.score,
        optimization_max_score=result.max_score,
        coverage=result.coverage,
        fully_covered=result.fully_covered,
        start_date=result.start_date,
    )


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
        skill_requirements=project.skill_requirements,
        excluded_person_ids=project.excluded_person_ids,
        included_person_ids=project.included_person_ids,
        squads=project.squads,
        date_ranges=project.date_ranges,
        phases=project.phases,
    )

    people_inputs = [p.to_person_input(committed.get(p.id, [])) for p in people]

    start_candidates: list[StartCandidate] = []
    try:
        if project.start_window is None:
            pool = solver.solve_pool(
                project_input,
                people_inputs,
                request.weights,
                request.respect_exclusions,
                n_alternatives=request.n_alternatives,
            )
        else:
            scan = solver.solve_pool_over_starts(
                project_input,
                people_inputs,
                request.weights,
                project.start_window,
                request.respect_exclusions,
                n_alternatives=request.n_alternatives,
            )
            pool = scan.pool
            start_candidates = scan.candidates
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
            "start_date": best.start_date,
        },
        organization_id,
    )
    return OptimizationResponse(
        best=saved,
        alternatives=[_proposal(alternative) for alternative in alternatives],
        start_candidates=[
            StartCandidateProposal(
                start=candidate.start,
                feasible=candidate.feasible,
                score=candidate.score,
                max_score=candidate.max_score,
                fully_covered=candidate.fully_covered,
                team=_proposal(candidate.team) if candidate.team else None,
            )
            for candidate in start_candidates
        ],
    )


@router.post(
    "/solve-batch",
    response_model=BatchOptimizationResponse,
    dependencies=[Depends(require_permission("optimization:run"))],
)
def solve_batch(
    request: BatchOptimizationRequest,
    organization_id: str = Depends(require_org_member),
):
    """Finds the best teams for several projects jointly and saves one per project.

    The selected projects' own assignments are freed and re-optimized; every
    other project's assignments count as committed load. Projects with a
    `start_window` are solved at their planned dates and reported in
    `ignored_start_window_project_ids`.

    Args:
        request: The projects to staff, the weights and the exclusions toggle.
        organization_id: The active organization.

    Returns:
        The saved teams, one per project in request order, and the projects
        whose start window was ignored.

    Raises:
        HTTPException: 404 if a project is not found; 422 if a project is
            completed; 409 with a BatchInfeasibilityDetail if no set of teams
            is feasible.
    """
    projects_repo: FileRepository[Project] = FileRepository("projects", Project)
    people_repo: FileRepository[Person] = FileRepository("people", Person)
    teams_repo: FileRepository[Team] = FileRepository("teams", Team)
    assignments_repo: FileRepository[Assignment] = FileRepository(
        "assignments", Assignment
    )

    projects: list[Project] = []
    for project_id in request.project_ids:
        project = projects_repo.get(project_id, organization_id)
        if not project:
            raise HTTPException(
                status_code=404, detail=f"Project '{project_id}' not found"
            )
        if project.completed_at is not None:
            raise HTTPException(
                status_code=422,
                detail=f"Project '{project.name}' is completed and cannot be optimized",
            )
        projects.append(project)

    selected_ids = set(request.project_ids)
    committed: dict[str, list[AvailabilityWindow]] = {}
    for a in assignments_repo.list(organization_id):
        if a.project_id in selected_ids:
            continue
        committed.setdefault(a.person_id, []).append(
            AvailabilityWindow(start=a.start, end=a.end, ratio=a.ratio)
        )

    portfolio = [
        PortfolioProject(
            id=project.id,
            skill_requirements=project.skill_requirements,
            excluded_person_ids=project.excluded_person_ids,
            included_person_ids=project.included_person_ids,
            squads=project.squads,
            date_ranges=project.date_ranges,
            phases=project.phases,
            priority=project.priority,
        )
        for project in projects
    ]
    people_inputs = [
        p.to_person_input(committed.get(p.id, []))
        for p in people_repo.list(organization_id)
    ]

    try:
        result = solver.solve_portfolio(
            portfolio, people_inputs, request.weights, request.respect_exclusions
        )
    except InfeasiblePortfolioError as exc:
        raise HTTPException(
            status_code=409,
            detail=BatchInfeasibilityDetail(
                message=str(exc),
                projects=[
                    InfeasibilityDetail(
                        message=str(error),
                        project_id=error.project_id,
                        conflicts=error.conflicts,
                    )
                    for error in exc.project_errors
                ],
            ).model_dump(mode="json"),
        ) from exc

    created_at = datetime.now(UTC)
    teams = [
        teams_repo.create(
            {
                "project_id": team.project_id,
                "members": [m.model_dump() for m in team.members],
                "is_optimized": True,
                "optimization_score": team.score,
                "optimization_max_score": team.max_score,
                "coverage": [c.model_dump() for c in team.coverage],
                "fully_covered": team.fully_covered,
                "created_at": created_at,
                "start_date": None,
            },
            organization_id,
        )
        for team in result.results
    ]
    return BatchOptimizationResponse(
        teams=teams,
        ignored_start_window_project_ids=[
            project.id for project in projects if project.start_window is not None
        ],
    )
