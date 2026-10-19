from datetime import date

import pytest
from optimizer.adapters.pulp_solver import MIN_FTE_SHARE, PuLPTeamAssignmentSolver
from optimizer.domain.solver import InfeasibleAssignmentError
from optimizer.models import (
    AssignmentWeights,
    AvailabilityWindow,
    DateRange,
    InfeasibilityReason,
    PersonInput,
    PhaseConflict,
    PhaseCoverage,
    ProjectInput,
    ProjectPhase,
    Seniority,
    SkillCoverage,
    SkillLevel,
    SkillRequirement,
    Squad,
)

PERF_ONLY = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0)
SPAN = DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25))


@pytest.fixture
def solver():
    return PuLPTeamAssignmentSolver()


def _person(person_id, availability=1.0, **skills):
    # Fractional availability is a window over SPAN, so it only applies to projects running in SPAN.
    return PersonInput(
        id=person_id,
        seniority=Seniority.SENIOR,
        years_of_experience=5,
        availability_windows=[AvailabilityWindow(start=SPAN.start, end=SPAN.end, ratio=availability)],
        skills=[SkillLevel(id=skill, level=level) for skill, level in skills.items()],
    )


def test_fully_covered_project(solver):
    project = ProjectInput(id="proj", n_slots=1, skill_requirements=[SkillRequirement(id="python", min_level=3)])
    result = solver.solve(project, [_person("a", python=5)], PERF_ONLY)
    assert result.coverage == [
        PhaseCoverage(
            phase_id=None,
            required_fte=1,
            staffed_fte=1.0,
            available_fte=1.0,
            fte_met=True,
            skills=[SkillCoverage(skill_id="python", required_level=3, best_level=5, covered_fte=1.0, met=True)],
        )
    ]
    assert result.fully_covered


def test_partially_covered_skills(solver):
    project = ProjectInput(
        id="proj",
        n_slots=2,
        skill_requirements=[
            SkillRequirement(id="python", min_level=5),
            SkillRequirement(id="rust", min_level=4),
            SkillRequirement(id="go", min_level=2),
        ],
    )
    people = [_person("a", python=5, rust=2), _person("b", python=1, rust=4.5, go=1)]
    result = solver.solve(project, people, PERF_ONLY)

    (coverage,) = result.coverage
    assert coverage.fte_met
    assert coverage.skills == [
        SkillCoverage(skill_id="python", required_level=5, best_level=5, covered_fte=1.0, met=True),
        SkillCoverage(skill_id="rust", required_level=4, best_level=4.5, covered_fte=1.0, met=True),
        SkillCoverage(skill_id="go", required_level=2, best_level=1, covered_fte=0.0, met=False),
    ]
    assert not result.fully_covered


def test_under_filled_phase_reports_staffed_and_available_fte(solver):
    phases = [ProjectPhase(id="build", n_slots=3, date_range=SPAN), ProjectPhase(id="run", n_slots=1, date_range=SPAN)]
    project = ProjectInput(id="proj", phases=phases)
    result = solver.solve(project, [_person("full"), _person("half", availability=0.5)], PERF_ONLY)

    build, run = result.coverage
    assert (build.phase_id, build.required_fte, build.staffed_fte, build.available_fte, build.fte_met) == (
        "build",
        3,
        1.5,
        1.5,
        False,
    )
    assert (run.phase_id, run.required_fte, run.staffed_fte, run.fte_met) == ("run", 1, 1.0, True)
    assert not result.fully_covered


def test_phase_without_candidates_is_reported_empty(solver):
    leave = AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=0.0)
    person = _person("a", python=4).model_copy(update={"availability_windows": [leave]})
    phases = [
        ProjectPhase(
            id="january",
            skill_requirements=[SkillRequirement(id="python", min_level=3)],
            date_range=DateRange(start=date(2026, 1, 5), end=date(2026, 1, 20)),
        ),
        ProjectPhase(id="march", date_range=DateRange(start=date(2026, 3, 2), end=date(2026, 3, 20))),
    ]
    result = solver.solve(ProjectInput(id="proj", phases=phases), [person], PERF_ONLY)

    january, march = result.coverage
    assert (january.staffed_fte, january.available_fte, january.fte_met) == (0.0, 0.0, False)
    assert january.skills == [
        SkillCoverage(skill_id="python", required_level=3, best_level=0.0, covered_fte=0.0, met=False)
    ]
    assert march.fte_met


def test_empty_pool_still_reports_coverage(solver):
    project = ProjectInput(id="proj", n_slots=2, skill_requirements=[SkillRequirement(id="python", min_level=1)])
    result = solver.solve(project, [], PERF_ONLY)
    assert result.coverage[0].staffed_fte == 0.0
    assert not result.coverage[0].skills[0].met
    assert not result.fully_covered


def test_every_alternative_carries_its_own_coverage(solver):
    project = ProjectInput(id="proj", n_slots=1, skill_requirements=[SkillRequirement(id="python", min_level=4)])
    people = [_person("strong", python=5), _person("weak", python=2)]
    best, alternative = solver.solve_pool(project, people, PERF_ONLY, n_alternatives=1, min_difference=1)
    assert best.coverage[0].skills[0].met
    assert best.fully_covered
    assert alternative.coverage[0].skills[0] == SkillCoverage(
        skill_id="python", required_level=4, best_level=2, covered_fte=0.0, met=False
    )
    assert not alternative.fully_covered


def _infeasibility(solver, project, people):
    with pytest.raises(InfeasibleAssignmentError) as exc_info:
        solver.solve(project, people, PERF_ONLY)
    assert exc_info.value.project_id == project.id
    return exc_info.value.conflicts


def _oversized_squad():
    return [_person(f"m{i}") for i in range(int(1 / MIN_FTE_SHARE) + 1)]


def test_squad_conflict_names_the_blocking_squad(solver):
    members = _oversized_squad()
    # The first squad has a single member in the pool, so it constrains nothing.
    squads = [Squad(member_ids=["ghost", "m0"]), Squad(member_ids=[p.id for p in members])]
    project = ProjectInput(id="proj", n_slots=1, squads=squads)
    assert _infeasibility(solver, project, members) == [
        PhaseConflict(
            phase_id=None,
            reason=InfeasibilityReason.SQUAD_CONFLICT,
            required_fte=1,
            need_fte=1.0,
            squad_indices=[1],
            forced_person_ids=[],
        )
    ]


def test_squad_conflict_is_attributed_to_its_phase(solver):
    members = _oversized_squad()
    phases = [ProjectPhase(id="build", n_slots=2), ProjectPhase(id="run", n_slots=1)]
    project = ProjectInput(id="proj", phases=phases, squads=[Squad(member_ids=[p.id for p in members])])
    conflicts = _infeasibility(solver, project, members)
    assert [(c.phase_id, c.reason, c.squad_indices) for c in conflicts] == [
        ("run", InfeasibilityReason.SQUAD_CONFLICT, [0])
    ]


def test_forced_member_conflict(solver):
    # Below the minimum share, allocations are fixed at the person's availability: the
    # ten 0.1-FTE people fill the 1 FTE exactly, and forcing the 0.05-FTE person in
    # leaves no combination that adds up to it.
    people = [_person("forced", availability=0.05)] + [_person(f"t{i}", availability=0.1) for i in range(10)]
    project = ProjectInput(id="proj", n_slots=1, included_person_ids=["forced"], date_ranges=[SPAN])
    assert _infeasibility(solver, project, people) == [
        PhaseConflict(
            phase_id=None,
            reason=InfeasibilityReason.FORCED_MEMBER_CONFLICT,
            required_fte=1,
            need_fte=1.0,
            squad_indices=[],
            forced_person_ids=["forced"],
        )
    ]


def test_squad_and_forced_member_conflict(solver):
    # Only "s2" plus all twelve 0.08-FTE people add up to 1 FTE, which needs both the
    # forced person left out and the squad split.
    people = [
        _person("forced", availability=0.01),
        _person("s1", availability=0.01),
        _person("s2", availability=0.04),
    ] + [_person(f"t{i}", availability=0.08) for i in range(12)]
    project = ProjectInput(
        id="proj",
        n_slots=1,
        included_person_ids=["forced"],
        squads=[Squad(member_ids=["s1", "s2"])],
        date_ranges=[SPAN],
    )
    conflicts = _infeasibility(solver, project, people)
    assert [(c.reason, c.squad_indices, c.forced_person_ids) for c in conflicts] == [
        (InfeasibilityReason.SQUAD_AND_FORCED_MEMBER_CONFLICT, [0], ["forced"])
    ]


def test_fte_not_reachable(solver):
    # Eleven people fixed at 0.095 FTE each can sum to 0.95 or 1.045, never to 1.
    people = [_person(f"t{i}", availability=0.095) for i in range(11)]
    conflicts = _infeasibility(solver, ProjectInput(id="proj", n_slots=1, date_ranges=[SPAN]), people)
    assert [(c.reason, c.need_fte) for c in conflicts] == [(InfeasibilityReason.FTE_NOT_REACHABLE, 1.0)]


def test_infeasibility_is_still_a_value_error_with_a_readable_message(solver):
    members = _oversized_squad()
    project = ProjectInput(id="proj", n_slots=1, squads=[Squad(member_ids=[p.id for p in members])])
    with pytest.raises(ValueError, match="squad_conflict"):
        solver.solve_pool(project, members, PERF_ONLY)
