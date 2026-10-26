from datetime import date, timedelta

import pytest
from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
from optimizer.domain.solver import InfeasibleAssignmentError
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
    Squad,
)
from optimizer.schedule import schedule_anchor, shift_project

WEEK_1 = DateRange(start=date(2026, 1, 5), end=date(2026, 1, 11))
WEEK_2 = DateRange(start=date(2026, 1, 12), end=date(2026, 1, 18))
WEEK_3 = DateRange(start=date(2026, 1, 19), end=date(2026, 1, 25))


@pytest.fixture
def solver():
    return PuLPTeamAssignmentSolver()


def _person(person_id, python_level=4.0, years=5.0, react_level=None, vacations=None, assignments=None):
    skills = [SkillLevel(id="python", level=python_level)]
    if react_level is not None:
        skills.append(SkillLevel(id="react", level=react_level))
    return PersonInput(
        id=person_id,
        seniority=Seniority.SENIOR,
        years_of_experience=years,
        skills=skills,
        vacations=vacations or [],
        assignments=assignments or [],
    )


def _project(**update):
    return ProjectInput(
        id="proj-test",
        skill_requirements=[SkillRequirement(id="python", min_level=4, fte=1.0)],
        date_ranges=[WEEK_1],
    ).model_copy(update=update)


def test_anchor_is_earliest_date_across_top_level_and_phase_ranges():
    project = ProjectInput(
        id="proj-test",
        date_ranges=[DateRange(start=date(2026, 2, 2), end=date(2026, 2, 20))],
        phases=[
            ProjectPhase(id="build", date_range=DateRange(start=date(2026, 2, 9), end=date(2026, 2, 27))),
            ProjectPhase(id="discovery", date_range=DateRange(start=date(2026, 1, 26), end=date(2026, 2, 6))),
            ProjectPhase(id="undated"),
        ],
    )
    assert schedule_anchor(project) == date(2026, 1, 26)


def test_anchor_of_an_undated_project_is_none():
    assert schedule_anchor(ProjectInput(id="proj-test", phases=[ProjectPhase(id="p")])) is None


def test_shift_moves_every_range_by_the_same_offset():
    project = ProjectInput(
        id="proj-test",
        date_ranges=[WEEK_1, WEEK_3],
        phases=[
            ProjectPhase(id="a", date_range=WEEK_1),
            ProjectPhase(id="b", date_range=DateRange(start=date(2026, 1, 15), end=date(2026, 2, 3))),
            ProjectPhase(id="undated"),
        ],
    )
    offset = timedelta(days=17)

    shifted = shift_project(project, offset)

    original = project.date_ranges + [p.date_range for p in project.phases if p.date_range]
    moved = shifted.date_ranges + [p.date_range for p in shifted.phases if p.date_range]
    assert [(r.start - offset, r.end - offset) for r in moved] == [(r.start, r.end) for r in original]
    assert shifted.phases[2].date_range is None
    assert schedule_anchor(shifted) == schedule_anchor(project) + offset
    assert project.date_ranges == [WEEK_1, WEEK_3]  # the input is left untouched


@pytest.mark.parametrize(
    ("window_end", "expected_starts"),
    [
        (date(2026, 1, 26), [date(2026, 1, 5), date(2026, 1, 12), date(2026, 1, 19), date(2026, 1, 26)]),
        (date(2026, 1, 25), [date(2026, 1, 5), date(2026, 1, 12), date(2026, 1, 19)]),
        (date(2026, 1, 10), [date(2026, 1, 5)]),
        (date(2026, 1, 5), [date(2026, 1, 5)]),
    ],
)
def test_candidates_are_weekly_from_the_window_start(solver, window_end, expected_starts):
    window = DateRange(start=date(2026, 1, 5), end=window_end)
    scan = solver.solve_pool_over_starts(_project(), [_person("p1")], AssignmentWeights(), window)
    assert [c.start for c in scan.candidates] == expected_starts


def test_project_may_end_after_the_window(solver):
    project = _project(date_ranges=[DateRange(start=date(2026, 3, 2), end=date(2026, 6, 30))])
    window = DateRange(start=date(2026, 1, 5), end=date(2026, 1, 10))
    scan = solver.solve_pool_over_starts(project, [_person("p1")], AssignmentWeights(), window)
    assert scan.best_start == date(2026, 1, 5)
    assert scan.candidates[0].feasible


@pytest.mark.parametrize(
    "blocked",
    [
        {"vacations": [DateRange(start=WEEK_1.start, end=WEEK_2.end)]},
        {"assignments": [AvailabilityWindow(start=WEEK_1.start, end=WEEK_2.end, ratio=1.0)]},
    ],
    ids=["vacation", "committed-assignment"],
)
def test_scan_waits_for_the_key_person(solver, blocked):
    people = [_person("star", python_level=5.0, **blocked), _person("weak", python_level=2.0)]
    window = DateRange(start=WEEK_1.start, end=WEEK_3.start)

    scan = solver.solve_pool_over_starts(_project(), people, AssignmentWeights(), window)

    assert scan.best_start == WEEK_3.start
    assert [m.person_id for m in scan.pool[0].members] == ["star"]
    early = scan.candidates[:2]
    assert all(c.feasible and c.fully_covered is False for c in early)
    assert scan.candidates[2].fully_covered is True


def test_fully_covered_start_beats_a_higher_scoring_partial_one(solver):
    # "fresh" scores higher (no experience cost) but can't fill react; "veteran" covers
    # both skills at a lower score. Each is away during the other's week.
    weights = AssignmentWeights(performance=0.5, chemistry=0.0, growth=0.0, cost=0.5)
    people = [
        _person("fresh", python_level=5.0, react_level=2.9, years=0.0, vacations=[WEEK_2]),
        _person("veteran", python_level=4.0, react_level=3.0, years=20.0, vacations=[WEEK_1]),
    ]
    project = _project(
        skill_requirements=[
            SkillRequirement(id="python", min_level=4, fte=0.4),
            SkillRequirement(id="react", min_level=3, fte=0.6),
        ]
    )

    scan = solver.solve_pool_over_starts(project, people, weights, DateRange(start=WEEK_1.start, end=WEEK_2.start))

    partial, covered = scan.candidates
    assert partial.score > covered.score
    assert not partial.fully_covered and covered.fully_covered
    assert scan.best_start == WEEK_2.start


def test_equal_scores_pick_the_earliest_start(solver):
    window = DateRange(start=WEEK_1.start, end=WEEK_3.start)
    scan = solver.solve_pool_over_starts(_project(), [_person("p1"), _person("p2")], AssignmentWeights(), window)
    assert len({c.score for c in scan.candidates}) == 1
    assert scan.best_start == WEEK_1.start


def _oversized_squad(prefix, vacation):
    # A squad of two can't be seated on a 1-FTE need, which seats a single person.
    members = [_person(f"{prefix}{i}", vacations=[vacation]) for i in range(2)]
    return Squad(member_ids=[p.id for p in members]), members


def test_infeasible_starts_are_flagged_and_skipped(solver):
    squad, members = _oversized_squad("m", vacation=WEEK_3)
    solo = _person("solo", vacations=[WEEK_1])
    project = _project(squads=[squad])
    window = DateRange(start=WEEK_1.start, end=WEEK_3.start)

    scan = solver.solve_pool_over_starts(project, members + [solo], AssignmentWeights(), window)

    first, second, third = scan.candidates
    assert first.feasible is False
    assert (first.score, first.max_score, first.fully_covered, first.team) == (None, None, None, None)
    assert second.feasible and third.feasible
    assert scan.best_start == WEEK_2.start
    assert [m.person_id for m in scan.pool[0].members] == ["solo"]


def test_all_infeasible_raises_the_earliest_candidate_conflicts(solver):
    # Each week a different oversized squad is the only option, so conflicts name a different squad.
    squad_a, members_a = _oversized_squad("a", vacation=WEEK_2)
    squad_b, members_b = _oversized_squad("b", vacation=WEEK_1)
    project = _project(squads=[squad_a, squad_b])
    people = members_a + members_b
    window = DateRange(start=WEEK_1.start, end=WEEK_2.start)

    with pytest.raises(InfeasibleAssignmentError) as raised:
        solver.solve_pool_over_starts(project, people, AssignmentWeights(), window)

    with pytest.raises(InfeasibleAssignmentError) as at_week_2:
        solver.solve(shift_project(project, timedelta(weeks=1)), people, AssignmentWeights())
    assert [c.squad_indices for c in raised.value.conflicts] == [[0]]
    assert [c.squad_indices for c in at_week_2.value.conflicts] == [[1]]


def test_pool_at_best_start_matches_solve_pool_on_the_shifted_project(solver):
    people = [_person(f"py{level}", python_level=level) for level in (5.0, 4.5, 4.0, 3.5, 3.0)]
    people[0] = _person("py5.0", python_level=5.0, vacations=[WEEK_1])
    project = _project(
        skill_requirements=[SkillRequirement(id="python", min_level=3, fte=2.0)],
        date_ranges=[DateRange(start=date(2025, 12, 1), end=date(2025, 12, 7))],
    )
    weights = AssignmentWeights()
    window = DateRange(start=WEEK_1.start, end=WEEK_2.start)

    scan = solver.solve_pool_over_starts(project, people, weights, window, n_alternatives=2, min_difference=1)

    assert scan.best_start == WEEK_2.start
    expected = solver.solve_pool(
        shift_project(project, WEEK_2.start - date(2025, 12, 1)), people, weights, n_alternatives=2, min_difference=1
    )
    assert len(scan.pool) == 3
    assert all(r.start_date == WEEK_2.start for r in scan.pool)
    assert [r.model_copy(update={"start_date": None}) for r in scan.pool] == expected
    assert scan.pool[0].score == scan.candidates[1].score


def test_each_feasible_candidate_carries_its_optimum_at_that_start(solver):
    people = [_person("star", python_level=5.0, vacations=[WEEK_1]), _person("weak", python_level=4.0)]
    window = DateRange(start=WEEK_1.start, end=WEEK_3.start)

    scan = solver.solve_pool_over_starts(_project(), people, AssignmentWeights(), window)

    for candidate in scan.candidates:
        assert candidate.team.start_date == candidate.start
        assert (candidate.team.score, candidate.team.max_score, candidate.team.fully_covered) == (
            candidate.score,
            candidate.max_score,
            candidate.fully_covered,
        )
    assert [m.person_id for m in scan.candidates[0].team.members] == ["weak"]
    best = next(c for c in scan.candidates if c.start == scan.best_start)
    assert best.team.members == scan.pool[0].members
    assert best.team.score == scan.pool[0].score


def test_plain_solve_pool_leaves_start_date_unset(solver):
    pool = solver.solve_pool(_project(), [_person("p1"), _person("p2")], AssignmentWeights())
    assert all(r.start_date is None for r in pool)


def test_undated_project_cannot_be_scanned(solver):
    with pytest.raises(ValueError, match="no date range"):
        solver.solve_pool_over_starts(
            _project(date_ranges=[]),
            [_person("p1")],
            AssignmentWeights(),
            DateRange(start=WEEK_1.start, end=WEEK_1.end),
        )
