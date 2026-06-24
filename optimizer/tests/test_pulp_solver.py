from datetime import date

import pytest
from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
from optimizer.models import (
    AssignmentWeights,
    AvailabilityWindow,
    DateRange,
    PersonInput,
    ProjectInput,
    ProjectPhase,
    Seniority,
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
        skill_requirements=[SkillRequirement(id="python", min_level=3)],
        excluded_person_ids=[],
    )


@pytest.fixture
def people():
    return [
        PersonInput(
            id="p1",
            seniority=Seniority.SENIOR,
            years_of_experience=8.0,
            fte_capacity=1.0,
            skills=[SkillLevel(id="python", level=5)],
            growth_targets=[],
            affinities={"p2": 4.0},
        ),
        PersonInput(
            id="p2",
            seniority=Seniority.JUNIOR,
            years_of_experience=1.0,
            fte_capacity=1.0,
            skills=[SkillLevel(id="react", level=3)],
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


def test_forced_inclusion(solver, project, people):
    project.included_person_ids = ["p2"]
    weights = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0)
    result = solver.solve(project, people, weights)
    # p2 has no python skill, so performance weight alone would pick p1,
    # but p2 is forced in and n_slots=1 expands to fit it.
    assert any(m.person_id == "p2" for m in result.members)


def test_unavailable_window_excludes_person(solver, project, people):
    project.date_ranges = [DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25))]
    project.included_person_ids = ["p1"]
    people[0].availability_windows = [
        AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=0.0)
    ]
    result = solver.solve(project, people, AssignmentWeights())
    assert all(m.person_id != "p1" for m in result.members)


def test_fte_allocation_reflects_windowed_availability(solver, project, people):
    project.date_ranges = [DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25))]
    project.included_person_ids = ["p1"]
    people[0].availability_windows = [
        AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=0.4)
    ]
    result = solver.solve(project, people, AssignmentWeights())
    p1_member = next(m for m in result.members if m.person_id == "p1")
    assert p1_member.fte_allocation == pytest.approx(0.4)


def test_phases_produce_tagged_members_and_summed_score(solver, people):
    phase1 = ProjectPhase(id="stage-1", n_slots=1, skill_requirements=[SkillRequirement(id="python", min_level=3)])
    phase2 = ProjectPhase(id="stage-2", n_slots=1, skill_requirements=[SkillRequirement(id="react", min_level=3)])
    project = ProjectInput(id="proj-test", phases=[phase1, phase2])
    weights = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0)

    result = solver.solve(project, people, weights)

    stage1_members = [m for m in result.members if m.phase_id == "stage-1"]
    stage2_members = [m for m in result.members if m.phase_id == "stage-2"]
    assert stage1_members[0].person_id == "p1"  # p1 has the python skill
    assert stage2_members[0].person_id == "p2"  # p2 has the react skill

    standalone_phase1 = ProjectInput(id="proj-test", n_slots=1, skill_requirements=phase1.skill_requirements)
    standalone_phase2 = ProjectInput(id="proj-test", n_slots=1, skill_requirements=phase2.skill_requirements)
    expected_score = (
        solver.solve(standalone_phase1, people, weights).score
        + solver.solve(standalone_phase2, people, weights).score
    )
    assert result.score == pytest.approx(expected_score)


def test_phase_date_range_filters_unavailable_person(solver, people):
    people[0].availability_windows = [
        AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=0.0)
    ]
    phase1 = ProjectPhase(
        id="stage-1",
        n_slots=1,
        skill_requirements=[SkillRequirement(id="python", min_level=3)],
        date_range=DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25)),
    )
    phase2 = ProjectPhase(
        id="stage-2",
        n_slots=1,
        date_range=DateRange(start=date(2026, 3, 2), end=date(2026, 3, 19)),
    )
    project = ProjectInput(id="proj-test", phases=[phase1, phase2], included_person_ids=["p1"])

    result = solver.solve(project, people, AssignmentWeights())

    stage1_members = [m for m in result.members if m.phase_id == "stage-1"]
    stage2_members = [m for m in result.members if m.phase_id == "stage-2"]
    # p1 is on leave (ratio 0) during stage-1's span, so the forced inclusion can't apply there.
    assert all(m.person_id != "p1" for m in stage1_members)
    # p1 is available again by stage-2's span, so the forced inclusion does apply.
    assert any(m.person_id == "p1" for m in stage2_members)
