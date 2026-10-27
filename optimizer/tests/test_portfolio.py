from datetime import date, timedelta

import pytest
from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
from optimizer.availability import base_availability_ratio, daily_availability
from optimizer.domain.solver import InfeasibleAssignmentError, InfeasiblePortfolioError
from optimizer.models import (
    AssignmentWeights,
    AvailabilityWindow,
    DateRange,
    InfeasibilityReason,
    PersonInput,
    PortfolioProject,
    ProjectInput,
    ProjectPhase,
    ProjectPriority,
    Seniority,
    SkillLevel,
    SkillRequirement,
)

PERF_ONLY = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0)
SPAN = DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25))
LATER = DateRange(start=date(2026, 2, 2), end=date(2026, 2, 22))


@pytest.fixture
def solver():
    return PuLPTeamAssignmentSolver()


def _person(person_id, availability=1.0, **skills):
    # Fractional availability is a window over SPAN, so it only applies to projects running in SPAN.
    windows = [AvailabilityWindow(start=SPAN.start, end=SPAN.end, ratio=availability)] if availability < 1 else []
    return PersonInput(
        id=person_id,
        seniority=Seniority.SENIOR,
        years_of_experience=5,
        availability_windows=windows,
        skills=[SkillLevel(id=skill, level=level) for skill, level in skills.items()],
    )


def _project(project_id, skill_id, fte=1.0, date_range=SPAN, priority=ProjectPriority.MEDIUM, **kwargs):
    return PortfolioProject(
        id=project_id,
        skill_requirements=[SkillRequirement(id=skill_id, min_level=3, fte=fte)],
        date_ranges=[date_range] if date_range else [],
        priority=priority,
        **kwargs,
    )


def _scope_ranges(project, phase_id):
    if phase_id is None:
        return project.date_ranges
    phase = next(phase for phase in project.phases if phase.id == phase_id)
    return [phase.date_range] if phase.date_range else []


def _assert_within_availability(projects, people, result):
    loads = {}
    for project, team in zip(projects, result.results):
        for member in team.members:
            loads.setdefault(member.person_id, []).append(
                (_scope_ranges(project, member.phase_id), member.fte_allocation)
            )

    by_id = {p.id: p for p in people}
    for person_id, person_loads in loads.items():
        person = by_id[person_id]
        assert sum(fte for ranges, fte in person_loads if not ranges) <= base_availability_ratio(person) + 1e-6
        days = {
            r.start + timedelta(days=n)
            for ranges, _ in person_loads
            for r in ranges
            for n in range((r.end - r.start).days + 1)
        }
        for day in days:
            load = sum(
                fte for ranges, fte in person_loads if not ranges or any(r.start <= day <= r.end for r in ranges)
            )
            ((_, _, ratio),) = daily_availability(person, DateRange(start=day, end=day), person.assignments)
            assert load <= ratio + 1e-6, f"{person_id} holds {load} FTE on {day}, above {ratio}"


def _staffed(team):
    return {m.person_id: m.fte_allocation for m in team.members}


def test_joint_solve_beats_solving_one_project_after_the_other(solver):
    projects = [_project("backend", "python"), _project("systems", "rust")]
    people = [_person("expert", python=5, rust=5), _person("dev", python=3)]

    joint = solver.solve_portfolio(projects, people, PERF_ONLY)

    first = solver.solve(projects[0], people, PERF_ONLY)
    committed = {m.person_id: m.fte_allocation for m in first.members}
    people_after = [
        p.model_copy(
            update={"assignments": [AvailabilityWindow(start=SPAN.start, end=SPAN.end, ratio=committed[p.id])]}
        )
        if p.id in committed
        else p
        for p in people
    ]
    second = solver.solve(projects[1], people_after, PERF_ONLY)

    assert sum(team.score for team in joint.results) >= first.score + second.score
    assert [_staffed(team) for team in joint.results] == [{"dev": 1.0}, {"expert": 1.0}]
    assert all(team.fully_covered for team in joint.results)
    _assert_within_availability(projects, people, joint)


def test_results_follow_input_order_with_own_scores(solver):
    projects = [_project("b", "rust"), _project("a", "python")]
    people = [_person("x", python=5), _person("y", rust=4)]

    result = solver.solve_portfolio(projects, people, PERF_ONLY)

    assert [team.project_id for team in result.results] == ["b", "a"]
    for project, team in zip(projects, result.results):
        assert team == solver.solve(project, people, PERF_ONLY)
    _assert_within_availability(projects, people, result)


def test_higher_priority_project_is_fully_covered_when_capacity_is_short(solver):
    projects = [
        _project("nice-to-have", "python", priority=ProjectPriority.LOW),
        _project("urgent", "python", fte=0.6, priority=ProjectPriority.CRITICAL),
    ]
    people = [_person("expert", python=5)]

    result = solver.solve_portfolio(projects, people, PERF_ONLY)

    low, critical = result.results
    assert critical.fully_covered
    assert _staffed(critical) == {"expert": 0.6}
    assert not low.fully_covered
    assert _staffed(low) == {"expert": 0.4}
    _assert_within_availability(projects, people, result)


def test_higher_tier_is_not_sacrificed_for_a_better_scoring_lower_tier(solver):
    # "strong" scores far higher on the low-priority project, but only it can staff the
    # high-priority one, so the high tier keeps it.
    projects = [
        _project("low", "python", priority=ProjectPriority.LOW),
        _project("high", "rust", priority=ProjectPriority.HIGH),
    ]
    people = [_person("strong", python=5, rust=3)]

    result = solver.solve_portfolio(projects, people, PERF_ONLY)

    low, high = result.results
    assert _staffed(high) == {"strong": 1.0}
    assert low.members == []
    _assert_within_availability(projects, people, result)


def test_projects_that_do_not_overlap_share_a_person_full_time(solver):
    projects = [_project("january", "python"), _project("february", "python", date_range=LATER)]
    people = [_person("expert", python=5)]

    result = solver.solve_portfolio(projects, people, PERF_ONLY)

    assert [_staffed(team) for team in result.results] == [{"expert": 1.0}, {"expert": 1.0}]
    assert all(team.fully_covered for team in result.results)
    _assert_within_availability(projects, people, result)


def test_partial_overlaps_are_checked_per_period_not_pairwise(solver):
    # "long" overlaps both short projects, which don't overlap each other: 0.6 + 0.4 fits
    # in each half even though 0.6 + 0.4 + 0.4 would not.
    first_half = DateRange(start=SPAN.start, end=date(2026, 1, 14))
    second_half = DateRange(start=date(2026, 1, 15), end=SPAN.end)
    projects = [
        _project("long", "python", fte=0.6),
        _project("first", "python", fte=0.4, date_range=first_half),
        _project("second", "python", fte=0.4, date_range=second_half),
    ]
    people = [_person("expert", python=5)]

    result = solver.solve_portfolio(projects, people, PERF_ONLY)

    assert all(team.fully_covered for team in result.results)
    _assert_within_availability(projects, people, result)


def test_projects_without_dates_overlap_everything(solver):
    projects = [_project("a", "python", date_range=None), _project("b", "python")]
    people = [_person("expert", python=5)]

    result = solver.solve_portfolio(projects, people, PERF_ONLY)

    assert sum(m.fte_allocation for team in result.results for m in team.members) == pytest.approx(1.0)
    _assert_within_availability(projects, people, result)


def test_overlapping_phases_share_capacity(solver):
    early = DateRange(start=SPAN.start, end=date(2026, 1, 18))
    late = DateRange(start=date(2026, 1, 12), end=SPAN.end)
    phase_req = [SkillRequirement(id="python", min_level=3, fte=1.0)]
    projects = [
        PortfolioProject(
            id="phased",
            phases=[
                ProjectPhase(id="build", skill_requirements=phase_req, date_range=early),
                ProjectPhase(id="run", skill_requirements=phase_req, date_range=late),
            ],
        ),
        _project("other", "python", date_range=late),
    ]
    people = [_person("expert", python=5), _person("dev", python=3)]

    result = solver.solve_portfolio(projects, people, PERF_ONLY)

    _assert_within_availability(projects, people, result)


def test_single_project_matches_solve(solver):
    weights = AssignmentWeights(performance=0.5, chemistry=0.2, growth=0.2, cost=0.1, handover=0.3)
    project = ProjectInput(
        id="phased",
        phases=[
            ProjectPhase(
                id="build",
                skill_requirements=[
                    SkillRequirement(id="python", min_level=3, fte=1.4, max_people=2),
                    SkillRequirement(id="react", min_level=2, fte=0.6),
                ],
                date_range=DateRange(start=SPAN.start, end=date(2026, 1, 14)),
            ),
            ProjectPhase(
                id="run",
                skill_requirements=[SkillRequirement(id="python", min_level=3, fte=1.0)],
                date_range=DateRange(start=date(2026, 1, 15), end=SPAN.end),
            ),
        ],
        included_person_ids=["c"],
    )
    people = [
        _person("a", python=5, react=2).model_copy(update={"affinities": {"b": 3.0}}),
        _person("b", python=4, react=4).model_copy(update={"affinities": {"a": 3.0}}),
        _person("c", python=3),
        _person("d", react=5, python=1),
    ]

    (team,) = solver.solve_portfolio([PortfolioProject(**project.model_dump())], people, weights).results

    assert team == solver.solve(project, people, weights)


def test_forced_person_in_overlapping_projects_that_cannot_fit(solver):
    projects = [
        _project("a", "python", included_person_ids=["expert"]),
        _project("b", "python", included_person_ids=["expert"]),
    ]
    people = [_person("expert", availability=0.2, python=5), _person("dev", python=3)]

    with pytest.raises(InfeasibleAssignmentError) as exc_info:
        solver.solve_portfolio(projects, people, PERF_ONLY)

    error = exc_info.value
    assert isinstance(error, InfeasiblePortfolioError)
    assert [e.project_id for e in error.project_errors] == ["a", "b"]
    for project_error in error.project_errors:
        (conflict,) = project_error.conflicts
        assert conflict.reason == InfeasibilityReason.CROSS_PROJECT_FORCED_CONFLICT
        assert conflict.person_id == "expert"
        assert conflict.project_ids == ["a", "b"]
        assert conflict.forced_person_ids == ["expert"]
        assert conflict.period == SPAN
    assert (error.project_id, error.conflicts) == ("a", error.project_errors[0].conflicts)


def test_forced_person_in_overlapping_projects_that_fit(solver):
    projects = [
        _project("a", "python", included_person_ids=["expert"]),
        _project("b", "python", included_person_ids=["expert"]),
    ]
    people = [_person("expert", availability=0.4, python=5), _person("dev", python=3)]

    result = solver.solve_portfolio(projects, people, PERF_ONLY)

    assert all("expert" in _staffed(team) for team in result.results)
    _assert_within_availability(projects, people, result)


def test_project_infeasible_on_its_own_is_reported_alone(solver):
    projects = [
        _project("fine", "python"),
        _project("broken", "python", included_person_ids=["designer"]),
    ]
    people = [_person("expert", python=5), _person("designer", figma=5)]

    with pytest.raises(InfeasiblePortfolioError) as exc_info:
        solver.solve_portfolio(projects, people, PERF_ONLY)

    (project_error,) = exc_info.value.project_errors
    assert project_error.project_id == "broken"
    assert [c.reason for c in project_error.conflicts] == [InfeasibilityReason.FORCED_MEMBER_CONFLICT]
    assert project_error.conflicts[0].forced_person_ids == ["designer"]
