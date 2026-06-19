import pytest
from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
from optimizer.models import (
    AssignmentWeights,
    PersonInput,
    ProjectInput,
    SkillLevel,
    SkillRequirement,
)


@pytest.fixture
def solver():
    return PuLPTeamAssignmentSolver()


@pytest.fixture
def project():
    return ProjectInput(
        id="proj-test",
        n_slots=1,
        skill_requirements=[SkillRequirement(skill_id="python", min_level=3)],
        excluded_person_ids=[],
    )


@pytest.fixture
def people():
    return [
        PersonInput(
            id="p1",
            years_of_experience=8.0,
            fte_capacity=1.0,
            skills=[SkillLevel(skill_id="python", level=5)],
            growth_targets=[],
            affinities={"p2": 4.0},
        ),
        PersonInput(
            id="p2",
            years_of_experience=1.0,
            fte_capacity=1.0,
            skills=[SkillLevel(skill_id="react", level=3)],
            growth_targets=["python"],
            affinities={"p1": 4.0},
        ),
    ]


def test_returns_result(solver, project, people):
    result = solver.solve(project, people, AssignmentWeights())
    assert result.project_id == "proj-test"
    assert len(result.members) >= 1
    assert result.score >= 0.0


def test_empty_people(solver, project):
    result = solver.solve(project, [], AssignmentWeights())
    assert result.members == []
    assert result.score == 0.0


def test_respects_exclusions(solver, project, people):
    project.excluded_person_ids = ["p1"]
    result = solver.solve(project, people, AssignmentWeights(), respect_exclusions=True)
    assert all(m.person_id != "p1" for m in result.members)


def test_performance_weight_prefers_skilled(solver, project, people):
    weights = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0)
    result = solver.solve(project, people, weights)
    # p1 has python level 5; p2 has no python skill
    assert result.members[0].person_id == "p1"


def test_growth_weight_prefers_learner(solver, project, people):
    weights = AssignmentWeights(performance=0.0, chemistry=0.0, growth=1.0, cost=0.0)
    result = solver.solve(project, people, weights)
    # p2 lists python in growth_targets → higher growth score
    assert result.members[0].person_id == "p2"


def test_chemistry_bonus_applied(solver, project, people):
    project.n_slots = 2
    weights = AssignmentWeights(performance=0.0, chemistry=1.0, growth=0.0, cost=0.0)
    result = solver.solve(project, people, weights)
    assert result.score > 0  # p1↔p2 affinity is +4
