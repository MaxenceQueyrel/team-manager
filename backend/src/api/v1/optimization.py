from fastapi import APIRouter, HTTPException

from api.models.person import Person
from api.models.project import Project
from api.models.team import Team, OptimizationRequest

from api.repositories.file_repository import FileRepository

from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
from optimizer.domain.solver import AssignmentSolverPort
from optimizer.models import AssignmentWeights, PersonInput, ProjectInput

router = APIRouter()
solver: AssignmentSolverPort = PuLPTeamAssignmentSolver()


@router.post("/solve", response_model=Team)
def solve_assignment(request: OptimizationRequest):
    projects_repo: FileRepository[Project] = FileRepository("projects", Project)
    people_repo: FileRepository[Person] = FileRepository("people", Person)
    teams_repo: FileRepository[Team] = FileRepository("teams", Team)

    project = projects_repo.get(request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    people = people_repo.list()

    project_input = ProjectInput(
        id=project.id,
        n_slots=sum(r.count for r in project.role_requirements) or 1,
        skill_requirements=project.skill_requirements,
        excluded_person_ids=project.excluded_person_ids,
        included_person_ids=project.included_person_ids,
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
            growth_targets=p.growth_targets,
            affinities=p.affinities,
        )
        for p in people
    ]

    weights = AssignmentWeights(
        performance=request.weights.performance_weight,
        chemistry=request.weights.chemistry_weight,
        growth=request.weights.growth_weight,
        cost=request.weights.cost_weight,
    )

    result = solver.solve(project_input, people_inputs, weights, request.respect_exclusions)

    saved = teams_repo.create(
        {
            "project_id": result.project_id,
            "members": [m.model_dump() for m in result.members],
            "is_optimized": True,
            "optimization_score": result.score,
        }
    )
    return saved
