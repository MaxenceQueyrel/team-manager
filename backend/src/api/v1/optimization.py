from fastapi import APIRouter, Depends, HTTPException

from api.core.deps import require_org_member, require_permission
from api.models.person import Person
from api.models.project import Project
from api.models.team import (
    OptimizationRequest,
    OptimizationResponse,
    Team,
    TeamProposal,
)

from api.repositories.file_repository import FileRepository

from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
from optimizer.domain.solver import AssignmentSolverPort
from optimizer.models import PersonInput, ProjectInput

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

    project = projects_repo.get(request.project_id, organization_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    people = people_repo.list(organization_id)

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

    people_inputs = [
        PersonInput(
            id=p.id,
            seniority=p.seniority,
            years_of_experience=p.years_of_experience,
            fte_capacity=p.fte_capacity,
            skills=p.skills,
            availability_windows=p.availability_windows,
            preferences=p.preferences,
            growth_targets=p.growth_targets,
            affinities=p.affinities,
        )
        for p in people
    ]

    pool = solver.solve_pool(
        project_input,
        people_inputs,
        request.weights,
        request.respect_exclusions,
        n_alternatives=request.n_alternatives,
    )
    best, alternatives = pool[0], pool[1:]

    saved = teams_repo.create(
        {
            "project_id": best.project_id,
            "members": [m.model_dump() for m in best.members],
            "is_optimized": True,
            "optimization_score": best.score,
            "optimization_max_score": best.max_score,
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
            )
            for alternative in alternatives
        ],
    )
