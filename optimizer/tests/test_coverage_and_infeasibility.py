from datetime import date

import pytest
from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
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
    SkillAllocation,
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


def _req(skill_id, min_level, fte=1.0, max_people=None):
    return SkillRequirement(id=skill_id, min_level=min_level, fte=fte, max_people=max_people)


def test_fully_covered_project(solver):
    project = ProjectInput(id="proj", skill_requirements=[_req("python", 3)])
    result = solver.solve(project, [_person("a", python=5)], PERF_ONLY)
    assert result.coverage == [
        PhaseCoverage(
            phase_id=None,
            required_fte=1.0,
            staffed_fte=1.0,
            available_fte=1.0,
            fte_met=True,
            skills=[
                SkillCoverage(
                    skill_id="python", required_level=3, required_fte=1.0, best_level=5, covered_fte=1.0, met=True
                )
            ],
        )
    ]
    assert result.fully_covered


def test_partially_covered_skills(solver):
    project = ProjectInput(
        id="proj",
        skill_requirements=[_req("python", 5), _req("rust", 4), _req("go", 2, fte=0.4)],
    )
    people = [_person("a", python=5, rust=2), _person("b", python=1, rust=4.5, go=1)]
    result = solver.solve(project, people, PERF_ONLY)

    (coverage,) = result.coverage
    assert (coverage.required_fte, coverage.staffed_fte, coverage.fte_met) == (2.4, 2.0, False)
    assert coverage.skills == [
        SkillCoverage(skill_id="python", required_level=5, required_fte=1.0, best_level=5, covered_fte=1.0, met=True),
        SkillCoverage(skill_id="rust", required_level=4, required_fte=1.0, best_level=4.5, covered_fte=1.0, met=True),
        SkillCoverage(skill_id="go", required_level=2, required_fte=0.4, best_level=1, covered_fte=0.0, met=False),
    ]
    assert not result.fully_covered


def test_skill_staffed_below_its_fte_is_not_met(solver):
    project = ProjectInput(id="proj", skill_requirements=[_req("python", 3, fte=2.0)], date_ranges=[SPAN])
    result = solver.solve(project, [_person("a", python=5), _person("b", availability=0.5, python=4)], PERF_ONLY)
    (skill,) = result.coverage[0].skills
    assert (skill.required_fte, skill.covered_fte, skill.met) == (2.0, 1.4, False)


def test_under_filled_phase_reports_staffed_and_available_fte(solver):
    phases = [
        ProjectPhase(id="build", skill_requirements=[_req("python", 0, fte=3.0)], date_range=SPAN),
        ProjectPhase(id="run", skill_requirements=[_req("python", 0)], date_range=SPAN),
    ]
    project = ProjectInput(id="proj", phases=phases)
    result = solver.solve(project, [_person("full"), _person("half", availability=0.5)], PERF_ONLY)

    build, run = result.coverage
    assert (build.phase_id, build.required_fte, build.staffed_fte, build.available_fte, build.fte_met) == (
        "build",
        3.0,
        1.4,
        1.4,
        False,
    )
    assert (run.phase_id, run.required_fte, run.staffed_fte, run.fte_met) == ("run", 1.0, 1.0, True)
    assert not result.fully_covered


def test_phase_without_candidates_is_reported_empty(solver):
    leave = AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=0.0)
    person = _person("a", python=4).model_copy(update={"availability_windows": [leave]})
    phases = [
        ProjectPhase(
            id="january",
            skill_requirements=[_req("python", 3)],
            date_range=DateRange(start=date(2026, 1, 5), end=date(2026, 1, 20)),
        ),
        ProjectPhase(
            id="march",
            skill_requirements=[_req("python", 3)],
            date_range=DateRange(start=date(2026, 3, 2), end=date(2026, 3, 20)),
        ),
    ]
    result = solver.solve(ProjectInput(id="proj", phases=phases), [person], PERF_ONLY)

    january, march = result.coverage
    assert (january.staffed_fte, january.available_fte, january.fte_met) == (0.0, 0.0, False)
    assert january.skills == [
        SkillCoverage(skill_id="python", required_level=3, required_fte=1.0, best_level=0.0, covered_fte=0.0, met=False)
    ]
    assert march.fte_met


def test_empty_pool_still_reports_coverage(solver):
    project = ProjectInput(id="proj", skill_requirements=[_req("python", 1, fte=2.0)])
    result = solver.solve(project, [], PERF_ONLY)
    assert result.coverage[0].staffed_fte == 0.0
    assert not result.coverage[0].skills[0].met
    assert not result.fully_covered


def test_every_alternative_carries_its_own_coverage(solver):
    project = ProjectInput(id="proj", skill_requirements=[_req("python", 2)])
    people = [_person("strong", python=5), _person("weak", python=2)]
    best, alternative = solver.solve_pool(project, people, PERF_ONLY, n_alternatives=1, min_difference=1)
    assert best.coverage[0].skills[0].best_level == 5
    assert alternative.coverage[0].skills[0] == SkillCoverage(
        skill_id="python", required_level=2, required_fte=1.0, best_level=2, covered_fte=1.0, met=True
    )


def test_member_skill_allocations_add_up_to_their_total(solver):
    project = ProjectInput(id="proj", skill_requirements=[_req("python", 3, fte=0.6), _req("react", 3, fte=0.4)])
    result = solver.solve(project, [_person("a", python=4, react=4)], PERF_ONLY)
    (member,) = result.members
    assert member.fte_allocation == 1.0
    assert member.skill_allocations == [
        SkillAllocation(skill_id="python", fte=0.6),
        SkillAllocation(skill_id="react", fte=0.4),
    ]


def _infeasibility(solver, project, people):
    with pytest.raises(InfeasibleAssignmentError) as exc_info:
        solver.solve(project, people, PERF_ONLY)
    assert exc_info.value.project_id == project.id
    return exc_info.value.conflicts


def test_squad_conflict_names_the_blocking_squad(solver):
    members = [_person("m0"), _person("m1")]
    # The first squad has a single member in the pool, so it constrains nothing.
    squads = [Squad(member_ids=["ghost", "m0"]), Squad(member_ids=["m0", "m1"])]
    project = ProjectInput(id="proj", skill_requirements=[_req("python", 0)], squads=squads)
    assert _infeasibility(solver, project, members) == [
        PhaseConflict(
            phase_id=None,
            reason=InfeasibilityReason.SQUAD_CONFLICT,
            required_fte=1.0,
            need_fte=1.0,
            squad_indices=[1],
            forced_person_ids=[],
        )
    ]


def test_squad_conflict_is_attributed_to_its_phase(solver):
    members = [_person("m0"), _person("m1")]
    phases = [
        ProjectPhase(id="build", skill_requirements=[_req("python", 0, fte=2.0)]),
        ProjectPhase(id="run", skill_requirements=[_req("python", 0)]),
    ]
    project = ProjectInput(id="proj", phases=phases, squads=[Squad(member_ids=["m0", "m1"])])
    conflicts = _infeasibility(solver, project, members)
    assert [(c.phase_id, c.reason, c.squad_indices) for c in conflicts] == [
        ("run", InfeasibilityReason.SQUAD_CONFLICT, [0])
    ]


def test_forced_member_qualifying_for_no_skill_conflicts(solver):
    people = [_person("forced", python=2), _person("other", python=4)]
    project = ProjectInput(id="proj", skill_requirements=[_req("python", 3)], included_person_ids=["forced"])
    assert _infeasibility(solver, project, people) == [
        PhaseConflict(
            phase_id=None,
            reason=InfeasibilityReason.FORCED_MEMBER_CONFLICT,
            required_fte=1.0,
            need_fte=1.0,
            squad_indices=[],
            forced_person_ids=["forced"],
        )
    ]


def test_forced_part_timer_on_a_single_seat_conflicts(solver):
    # The 1-FTE need seats one person, and the forced one can only give 0.4 of it.
    people = [_person("forced", availability=0.4, python=4), _person("other", python=4)]
    project = ProjectInput(
        id="proj", skill_requirements=[_req("python", 3)], included_person_ids=["forced"], date_ranges=[SPAN]
    )
    conflicts = _infeasibility(solver, project, people)
    assert [(c.reason, c.forced_person_ids) for c in conflicts] == [
        (InfeasibilityReason.FORCED_MEMBER_CONFLICT, ["forced"])
    ]


def test_squad_and_forced_member_conflict(solver):
    # One full-time seat: the forced part-timer can't fill it, and "t", who could, is
    # tied to "u", who can't share the seat. Only lifting both frees "t" for it.
    people = [_person("forced", availability=0.4), _person("t"), _person("u")]
    project = ProjectInput(
        id="proj",
        skill_requirements=[_req("python", 0)],
        included_person_ids=["forced"],
        squads=[Squad(member_ids=["t", "u"])],
        date_ranges=[SPAN],
    )
    conflicts = _infeasibility(solver, project, people)
    assert [(c.reason, c.squad_indices, c.forced_person_ids) for c in conflicts] == [
        (InfeasibilityReason.SQUAD_AND_FORCED_MEMBER_CONFLICT, [0], ["forced"])
    ]


def test_infeasibility_is_still_a_value_error_with_a_readable_message(solver):
    members = [_person("m0"), _person("m1")]
    project = ProjectInput(id="proj", skill_requirements=[_req("python", 0)], squads=[Squad(member_ids=["m0", "m1"])])
    with pytest.raises(ValueError, match="squad_conflict"):
        solver.solve_pool(project, members, PERF_ONLY)
