from fastapi import APIRouter, HTTPException

from api.models.person import Person
from api.models.project import Project
from api.models.team import Team, OptimizationRequest

from api.repositories.file_repository import FileRepository

from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
from optimizer.domain.solver import AssignmentSolverPort
from optimizer.models import PersonInput, ProjectInput

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

    result = solver.solve(project_input, people_inputs, request.weights, request.respect_exclusions)

    saved = teams_repo.create(
        {
            "project_id": result.project_id,
            "members": [m.model_dump() for m in result.members],
            "is_optimized": True,
            "optimization_score": result.score,
            "optimization_max_score": result.max_score,
        }
    )
    return saved
