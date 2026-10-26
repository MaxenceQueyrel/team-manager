from datetime import date

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

SPAN = DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25))
PERF_ONLY = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0)


def _python(fte=1.0, min_level=3, max_people=None):
    return SkillRequirement(id="python", min_level=min_level, fte=fte, max_people=max_people)


@pytest.fixture
def solver():
    return PuLPTeamAssignmentSolver()


@pytest.fixture
def project():
    return ProjectInput(id="proj-test", skill_requirements=[_python()], excluded_person_ids=[])


@pytest.fixture
def people():
    return [
        PersonInput(
            id="p1",
            seniority=Seniority.SENIOR,
            years_of_experience=8.0,
            skills=[SkillLevel(id="python", level=5)],
            growth_targets=[],
            affinities={"p2": 4.0},
        ),
        PersonInput(
            id="p2",
            seniority=Seniority.JUNIOR,
            years_of_experience=1.0,
            skills=[SkillLevel(id="python", level=3), SkillLevel(id="react", level=3)],
            growth_targets=["python"],
            affinities={"p1": 4.0},
        ),
    ]


def _allocations(result, phase_id=None):
    return {m.person_id: m.fte_allocation for m in result.members if m.phase_id == phase_id}


def test_returns_result(solver, project, people):
    result = solver.solve(project, people, AssignmentWeights())
    assert result.project_id == "proj-test"
    assert len(result.members) >= 1
    assert result.score >= 0.0
    assert result.score <= result.max_score


def test_empty_people(solver, project):
    result = solver.solve(project, [], AssignmentWeights())
    assert result.members == []
    assert result.score == 0.0
    assert result.max_score == 0.0


def test_max_score_reflects_need_and_weights(solver, project, people):
    result = solver.solve(project, people, PERF_ONLY)
    # 1 FTE needed, per-FTE max is performance weight alone (1.0) → max_score = 1.0
    assert result.max_score == pytest.approx(1.0)


def test_max_score_accounts_for_chemistry(solver, project, people):
    project.skill_requirements = [_python(fte=2.0)]
    weights = AssignmentWeights(performance=0.0, chemistry=1.0, growth=0.0, cost=0.0)
    result = solver.solve(project, people, weights)
    # 2 FTE need → at most 1 FTE shared, chemistry weight 1.0 × max affinity 5.0 = 5.0
    assert result.max_score == pytest.approx(5.0)
    assert result.score <= result.max_score


def test_respects_exclusions(solver, project, people):
    project.excluded_person_ids = ["p1"]
    result = solver.solve(project, people, AssignmentWeights(), respect_exclusions=True)
    assert all(m.person_id != "p1" for m in result.members)


def test_performance_weight_prefers_higher_level(solver, project, people):
    result = solver.solve(project, people, PERF_ONLY)
    # p1 has python level 5; p2 only 3
    assert _allocations(result) == {"p1": 1.0}


def test_growth_weight_prefers_learner(solver, project, people):
    weights = AssignmentWeights(performance=0.0, chemistry=0.0, growth=1.0, cost=0.0)
    result = solver.solve(project, people, weights)
    # p2 lists python in growth_targets → higher growth score
    assert _allocations(result) == {"p2": 1.0}


def test_preference_weight_prefers_stated_preference(solver, project, people):
    people[1].preferences = ["python"]
    weights = AssignmentWeights(performance=0.0, chemistry=0.0, growth=0.0, cost=0.0, preference=1.0)
    result = solver.solve(project, people, weights)
    # p2 lists python as a preference; p1 doesn't → higher preference score
    assert _allocations(result) == {"p2": 1.0}


def test_growth_and_preference_count_only_on_the_skill_they_name(solver, people):
    # p2 wants to grow in python but can only be placed on react here, so growth earns nothing.
    project = ProjectInput(id="proj-test", skill_requirements=[SkillRequirement(id="react", min_level=3, fte=1.0)])
    weights = AssignmentWeights(performance=0.0, chemistry=0.0, growth=1.0, cost=0.0)
    result = solver.solve(project, people, weights)
    assert _allocations(result) == {"p2": 1.0}
    assert result.score == pytest.approx(0.0)


def test_chemistry_bonus_applied(solver, project, people):
    project.skill_requirements = [_python(fte=2.0)]
    weights = AssignmentWeights(performance=0.0, chemistry=1.0, growth=0.0, cost=0.0)
    result = solver.solve(project, people, weights)
    assert result.score > 0  # p1↔p2 affinity is +4


def test_forced_member_takes_the_only_seat(solver, project, people):
    project.included_person_ids = ["p2"]
    result = solver.solve(project, people, PERF_ONLY)
    # Performance alone would pick p1, but 1 FTE seats a single person by default.
    assert _allocations(result) == {"p2": 1.0}


def test_forced_member_split_when_max_people_allows(solver, project, people):
    project.skill_requirements = [_python(max_people=2)]
    project.included_person_ids = ["p2"]
    result = solver.solve(project, people, PERF_ONLY)
    # p2 is forced in at the minimum share and the stronger p1 covers the rest.
    assert _allocations(result) == pytest.approx({"p2": 0.2, "p1": 0.8})


def test_unavailable_window_excludes_person(solver, project, people):
    project.date_ranges = [SPAN]
    project.included_person_ids = ["p1"]
    people[0].availability_windows = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=0.0)]
    result = solver.solve(project, people, AssignmentWeights())
    assert all(m.person_id != "p1" for m in result.members)


def test_fte_allocation_reflects_windowed_availability(solver, project, people):
    project.date_ranges = [SPAN]
    project.skill_requirements = [_python(max_people=2)]
    project.included_person_ids = ["p1"]
    people[0].availability_windows = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=0.4)]
    # p1 is the better fit, so it gets all it can give; p2 covers the remainder.
    result = solver.solve(project, people, PERF_ONLY)
    assert _allocations(result) == pytest.approx({"p1": 0.4, "p2": 0.6})


def test_vacation_excludes_person(solver, project, people):
    project.date_ranges = [SPAN]
    project.included_person_ids = ["p1"]
    people[0].vacations = [DateRange(start=date(2026, 1, 1), end=date(2026, 1, 31))]
    result = solver.solve(project, people, AssignmentWeights())
    assert all(m.person_id != "p1" for m in result.members)


def test_fte_allocation_reflects_working_pattern(solver, project, people):
    project.skill_requirements = [_python(max_people=2)]
    project.included_person_ids = ["p1"]
    people[0].working_days_per_week = 3
    result = solver.solve(project, people, PERF_ONLY)
    assert _allocations(result) == pytest.approx({"p1": 0.6, "p2": 0.4})


def test_fully_assigned_person_is_not_selected(solver, project, people):
    project.date_ranges = [SPAN]
    project.included_person_ids = ["p1"]
    people[0].assignments = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=1.0)]
    result = solver.solve(project, people, AssignmentWeights())
    assert all(m.person_id != "p1" for m in result.members)


def test_availability_left_by_assignments_is_floored_to_the_grid(solver, project, people):
    project.date_ranges = [SPAN]
    project.skill_requirements = [_python(max_people=2)]
    project.included_person_ids = ["p1"]
    people[0].assignments = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=0.5)]
    result = solver.solve(project, people, PERF_ONLY)
    assert _allocations(result) == pytest.approx({"p1": 0.4, "p2": 0.6})


def test_phases_produce_tagged_members_and_summed_score(solver, people):
    phase1 = ProjectPhase(id="stage-1", skill_requirements=[_python(min_level=4)])
    phase2 = ProjectPhase(id="stage-2", skill_requirements=[SkillRequirement(id="react", min_level=3, fte=1.0)])
    project = ProjectInput(id="proj-test", phases=[phase1, phase2])

    result = solver.solve(project, people, PERF_ONLY)

    assert _allocations(result, "stage-1") == {"p1": 1.0}  # only p1 reaches python level 4
    assert _allocations(result, "stage-2") == {"p2": 1.0}  # only p2 has react

    standalone_phase1 = ProjectInput(id="proj-test", skill_requirements=phase1.skill_requirements)
    standalone_phase2 = ProjectInput(id="proj-test", skill_requirements=phase2.skill_requirements)
    expected_score = (
        solver.solve(standalone_phase1, people, PERF_ONLY).score
        + solver.solve(standalone_phase2, people, PERF_ONLY).score
    )
    assert result.score == pytest.approx(expected_score)

    expected_max_score = (
        solver.solve(standalone_phase1, people, PERF_ONLY).max_score
        + solver.solve(standalone_phase2, people, PERF_ONLY).max_score
    )
    assert result.max_score == pytest.approx(expected_max_score)


def test_handover_keeps_same_person_across_phases(solver):
    # Each phase favours a different specialist on skill alone, but a strong
    # handover reward should make the optimizer keep one person for both phases.
    candidates = [
        PersonInput(
            id="a",
            seniority=Seniority.SENIOR,
            years_of_experience=8.0,
            skills=[SkillLevel(id="python", level=5), SkillLevel(id="react", level=3)],
        ),
        PersonInput(
            id="b",
            seniority=Seniority.SENIOR,
            years_of_experience=8.0,
            skills=[SkillLevel(id="python", level=3), SkillLevel(id="react", level=5)],
        ),
    ]
    phase1 = ProjectPhase(id="stage-1", skill_requirements=[_python()])
    phase2 = ProjectPhase(id="stage-2", skill_requirements=[SkillRequirement(id="react", min_level=3, fte=1.0)])
    project = ProjectInput(id="proj-test", phases=[phase1, phase2])

    independent = solver.solve(project, candidates, PERF_ONLY)
    assert _allocations(independent, "stage-1") == {"a": 1.0}
    assert _allocations(independent, "stage-2") == {"b": 1.0}  # different specialists without handover

    with_handover = solver.solve(project, candidates, PERF_ONLY.model_copy(update={"handover": 0.5}))
    stage1 = _allocations(with_handover, "stage-1")
    stage2 = _allocations(with_handover, "stage-2")
    assert stage1.keys() == stage2.keys() and len(stage1) == 1  # team kept stable across phases


def test_squad_pulls_in_partner(solver):
    # On skill alone a DS project would pick the two best data scientists and
    # never the developer; a squad tying the developer to a selected member
    # forces the pair to move together.
    def person(person_id, ds_level):
        skills = [SkillLevel(id="ds", level=ds_level)]
        return PersonInput(id=person_id, seniority=Seniority.SENIOR, years_of_experience=5, skills=skills)

    candidates = [person("ds_a", 5.0), person("ds_b", 4.5), person("dev", 3.0)]
    base = ProjectInput(
        id="proj-test",
        skill_requirements=[SkillRequirement(id="ds", min_level=3.0, fte=2.0, max_people=3)],
        included_person_ids=["ds_a"],
    )

    without = solver.solve(base, candidates, PERF_ONLY)
    assert _allocations(without) == {"ds_a": 1.0, "ds_b": 1.0}  # developer skipped

    with_squad = base.model_copy(update={"squads": [Squad(member_ids=["ds_a", "dev"])]})
    result = solver.solve(with_squad, candidates, PERF_ONLY)
    # The squad drags the developer in, but only at the minimum share: the FTE
    # still goes to the better data scientists.
    assert _allocations(result) == pytest.approx({"ds_a": 1.0, "dev": 0.2, "ds_b": 0.8})


def _generalists(*ids):
    # min_level 0 requirements accept them although they list no skill.
    return [PersonInput(id=person_id, seniority=Seniority.SENIOR, years_of_experience=5) for person_id in ids]


def test_squad_seated_together_when_max_people_allows(solver):
    project = ProjectInput(
        id="proj-test",
        skill_requirements=[_python(min_level=0, max_people=2)],
        included_person_ids=["a"],
        squads=[Squad(member_ids=["a", "b"])],
    )
    result = solver.solve(project, _generalists("a", "b"), AssignmentWeights())
    assert _allocations(result).keys() == {"a", "b"}
    assert sum(_allocations(result).values()) == pytest.approx(1.0)


def _unseatable_squad_project():
    # A squad of two on a need that seats a single person, and it's the only staffing option.
    project = ProjectInput(
        id="proj-test", skill_requirements=[_python(min_level=0)], squads=[Squad(member_ids=["a", "b"])]
    )
    return project, _generalists("a", "b")


def test_unsatisfiable_squad_raises(solver):
    project, candidates = _unseatable_squad_project()
    with pytest.raises(InfeasibleAssignmentError):
        solver.solve(project, candidates, AssignmentWeights())


def test_phase_date_range_filters_unavailable_person(solver, people):
    people[0].availability_windows = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=0.0)]
    phase1 = ProjectPhase(
        id="stage-1",
        skill_requirements=[_python()],
        date_range=DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25)),
    )
    phase2 = ProjectPhase(
        id="stage-2",
        skill_requirements=[_python()],
        date_range=DateRange(start=date(2026, 3, 2), end=date(2026, 3, 19)),
    )
    project = ProjectInput(id="proj-test", phases=[phase1, phase2], included_person_ids=["p1"])

    result = solver.solve(project, people, AssignmentWeights())

    # p1 is on leave (ratio 0) during stage-1's span, so the forced inclusion can't apply there.
    assert "p1" not in _allocations(result, "stage-1")
    # p1 is available again by stage-2's span, so the forced inclusion does apply.
    assert "p1" in _allocations(result, "stage-2")


@pytest.fixture
def pythonistas():
    return [
        PersonInput(
            id=f"py{level}",
            seniority=Seniority.SENIOR,
            years_of_experience=5,
            skills=[SkillLevel(id="python", level=level)],
        )
        for level in (5.0, 4.5, 4.0, 3.5, 3.0, 2.5)
    ]


@pytest.fixture
def python_project():
    return ProjectInput(id="proj-test", skill_requirements=[_python(fte=2.0, min_level=1)], date_ranges=[SPAN])


def _team(result):
    return {(m.phase_id, m.person_id) for m in result.members}


def test_pool_is_ordered_by_descending_score(solver, python_project, pythonistas):
    pool = solver.solve_pool(python_project, pythonistas, AssignmentWeights(), n_alternatives=3, min_difference=1)
    assert len(pool) == 4
    scores = [r.score for r in pool]
    assert scores == sorted(scores, reverse=True)
    assert {r.max_score for r in pool} == {pool[0].max_score}


def test_pool_teams_differ_by_at_least_min_difference(solver, python_project, pythonistas):
    pool = solver.solve_pool(python_project, pythonistas, AssignmentWeights(), n_alternatives=2, min_difference=2)
    teams = [_team(r) for r in pool]
    assert len(teams) == 3
    for i, a in enumerate(teams):
        for b in teams[i + 1 :]:
            assert len(a - b) >= 2  # fully disjoint for a team of two


def test_pool_alternatives_respect_squads_inclusions_and_exclusions(solver, python_project, pythonistas):
    project = python_project.model_copy(
        update={
            "skill_requirements": [_python(fte=3.0, min_level=1)],
            "included_person_ids": ["py3.0"],
            "excluded_person_ids": ["py5.0"],
            "squads": [Squad(member_ids=["py4.5", "py4.0"])],
        }
    )
    pool = solver.solve_pool(project, pythonistas, AssignmentWeights(), n_alternatives=5, min_difference=1)
    assert len(pool) > 1
    for result in pool:
        selected = {m.person_id for m in result.members}
        assert len(selected) == 3
        assert "py3.0" in selected
        assert "py5.0" not in selected
        assert ("py4.5" in selected) == ("py4.0" in selected)


def test_pool_truncates_when_candidates_run_out(solver, python_project, pythonistas):
    # 3 candidates for 2 one-person seats admit exactly 3 teams differing by one member.
    pool = solver.solve_pool(python_project, pythonistas[:3], AssignmentWeights(), n_alternatives=10, min_difference=1)
    assert len(pool) == 3
    assert len({frozenset(_team(r)) for r in pool}) == 3


def test_pool_min_difference_is_clamped_to_team_size(solver, python_project, pythonistas):
    project = python_project.model_copy(update={"skill_requirements": [_python(min_level=1)]})
    pool = solver.solve_pool(project, pythonistas[:3], AssignmentWeights(), n_alternatives=5, min_difference=4)
    assert len(pool) == 3


def test_pool_without_alternatives_matches_solve(solver, python_project, pythonistas):
    weights = AssignmentWeights()
    pool = solver.solve_pool(python_project, pythonistas, weights, n_alternatives=0)
    assert pool == [solver.solve(python_project, pythonistas, weights)]


def test_pool_first_solve_still_raises_when_infeasible(solver):
    project, candidates = _unseatable_squad_project()
    with pytest.raises(InfeasibleAssignmentError):
        solver.solve_pool(project, candidates, AssignmentWeights())


@pytest.mark.parametrize("handover", [0.0, 0.5])
def test_pool_cut_spans_all_phases(solver, pythonistas, handover):
    # Two single-seat phases: a cut of 2 must be met across the whole project, so
    # an alternative may keep one phase's pick and change only the other.
    phases = [ProjectPhase(id=f"stage-{k}", skill_requirements=[_python(min_level=1)]) for k in (1, 2)]
    project = ProjectInput(id="proj-test", phases=phases)
    weights = AssignmentWeights(handover=handover)

    pool = solver.solve_pool(project, pythonistas[:2], weights, n_alternatives=5, min_difference=2)

    # 2 people x 2 phases = 4 teams; after the optimum, a 2-swap cut leaves only its mirror.
    assert len(pool) == 2
    assert _team(pool[0]).isdisjoint(_team(pool[1]))
    assert pool[0].score >= pool[1].score
    assert pool[0] == solver.solve(project, pythonistas[:2], weights)


def test_phase_date_range_evaluates_assignments_per_phase(solver, people):
    people[0].assignments = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=1.0)]
    phase1 = ProjectPhase(
        id="stage-1",
        skill_requirements=[_python()],
        date_range=DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25)),
    )
    phase2 = ProjectPhase(
        id="stage-2",
        skill_requirements=[_python()],
        date_range=DateRange(start=date(2026, 3, 2), end=date(2026, 3, 19)),
    )
    project = ProjectInput(id="proj-test", phases=[phase1, phase2], included_person_ids=["p1"])

    result = solver.solve(project, people, PERF_ONLY)

    assert "p1" not in _allocations(result, "stage-1")
    assert _allocations(result, "stage-2") == {"p1": 1.0}


def _person(person_id, availability=1.0, python_level=4.0, react_level=None):
    # Fractional availability is a window over SPAN, so it only applies to projects running in SPAN.
    skills = [SkillLevel(id="python", level=python_level)]
    if react_level is not None:
        skills.append(SkillLevel(id="react", level=react_level))
    return PersonInput(
        id=person_id,
        seniority=Seniority.SENIOR,
        years_of_experience=5,
        availability_windows=[AvailabilityWindow(start=SPAN.start, end=SPAN.end, ratio=availability)],
        skills=skills,
    )


def _dated(*requirements):
    return ProjectInput(id="proj-test", skill_requirements=list(requirements), date_ranges=[SPAN])


def test_part_time_people_combine_to_cover_the_need(solver):
    candidates = [_person(f"part{i}", availability=0.4) for i in range(6)]
    result = solver.solve(_dated(_python(fte=2.0, min_level=1, max_people=5)), candidates, AssignmentWeights())
    assert len(result.members) == 5
    assert all(m.fte_allocation == pytest.approx(0.4) for m in result.members)


def test_full_time_people_preferred_over_small_allocations_at_equal_quality(solver):
    candidates = [_person("full_a"), _person("full_b")] + [_person(f"part{i}", availability=0.3) for i in range(4)]
    project = _dated(_python(fte=2.0, min_level=1, max_people=6))
    result = solver.solve(project, candidates, AssignmentWeights())
    assert _allocations(result) == pytest.approx({"full_a": 1.0, "full_b": 1.0})


def test_better_part_timers_beat_a_weaker_full_timer(solver):
    candidates = [_person("weak", python_level=1.5), _person("strong_a", 0.6, 5.0), _person("strong_b", 0.6, 5.0)]
    result = solver.solve(_dated(_python(min_level=1, max_people=2)), candidates, PERF_ONLY)
    assert _allocations(result).keys() == {"strong_a", "strong_b"}


def test_chemistry_does_not_reward_adding_people(solver):
    # Four mutual friends could all be seated on a 2-FTE need, but chemistry is
    # capped by shared FTE, so the two full-timers alone score just as well.
    ids = ["a", "b", "c", "d"]
    candidates = [
        PersonInput(
            id=person_id,
            seniority=Seniority.SENIOR,
            years_of_experience=5,
            availability_windows=[
                AvailabilityWindow(start=SPAN.start, end=SPAN.end, ratio=1.0 if person_id in ("a", "b") else 0.4)
            ],
            affinities={other: 5.0 for other in ids if other != person_id},
        )
        for person_id in ids
    ]
    project = _dated(_python(fte=2.0, min_level=0, max_people=4))
    weights = AssignmentWeights(performance=0.0, growth=0.0, cost=0.0, chemistry=1.0)
    result = solver.solve(project, candidates, weights)
    assert _allocations(result).keys() == {"a", "b"}
    assert result.score == pytest.approx(result.max_score)


def test_single_fte_is_not_split_between_friends(solver, people):
    project = ProjectInput(id="proj-test", skill_requirements=[_python(max_people=2)])
    result = solver.solve(project, people, AssignmentWeights(performance=0.0, growth=0.0, cost=0.0, chemistry=1.0))
    assert len(result.members) == 1
    assert result.members[0].fte_allocation == pytest.approx(1.0)


def test_under_capacity_pool_is_capped(solver):
    candidates = [_person("full"), _person("half", availability=0.5)]
    result = solver.solve(_dated(_python(fte=3.0, min_level=1)), candidates, PERF_ONLY)
    assert _allocations(result) == pytest.approx({"full": 1.0, "half": 0.4})
    # max_score is sized for the 1.4 FTE the pool can supply, not the 3 requested.
    assert result.max_score == pytest.approx(1.4)


def test_forced_members_exceeding_the_need_split_it_by_score(solver):
    project = _dated(_python(min_level=1, max_people=2)).model_copy(update={"included_person_ids": ["strong", "weak"]})
    candidates = [_person("strong", python_level=5.0), _person("weak", python_level=1.0), _person("other")]
    result = solver.solve(project, candidates, PERF_ONLY)
    assert _allocations(result) == pytest.approx({"strong": 0.8, "weak": 0.2})


def test_handover_rewards_retained_fte(solver):
    phases = [ProjectPhase(id=f"stage-{k}", skill_requirements=[_python(min_level=1)]) for k in (1, 2)]
    project = ProjectInput(id="proj-test", phases=phases)
    candidates = [_person("a", python_level=5.0), _person("b", python_level=5.0)]
    weights = PERF_ONLY.model_copy(update={"handover": 1.0})
    result = solver.solve(project, candidates, weights)
    assert len({m.person_id for m in result.members}) == 1  # same person kept, not split across both
    assert result.score == pytest.approx(result.max_score)


def test_pool_alternatives_with_part_timers_differ_in_people(solver):
    candidates = [_person(f"part{i}", availability=0.4, python_level=5.0 - i * 0.5) for i in range(8)]
    project = _dated(_python(fte=2.0, min_level=1, max_people=5))
    pool = solver.solve_pool(project, candidates, AssignmentWeights(), n_alternatives=2, min_difference=2)
    teams = [{m.person_id for m in r.members} for r in pool]
    assert len(teams) == 3
    for i, a in enumerate(teams):
        assert sum(m.fte_allocation for m in pool[i].members) == pytest.approx(2.0)
        for b in teams[i + 1 :]:
            assert len(a - b) >= 2


# --- Allocation grid and per-skill needs ---------------------------------------------------


def test_every_allocation_is_on_the_grid(solver):
    candidates = [
        _person("a", availability=0.87, python_level=5.0, react_level=4.0),
        _person("b", availability=0.55, python_level=3.0, react_level=5.0),
        _person("c", availability=0.33, python_level=4.0),
        _person("d", availability=0.71, react_level=3.5),
    ]
    project = _dated(
        _python(fte=1.4, min_level=3, max_people=4), SkillRequirement(id="react", min_level=3, fte=1.0, max_people=3)
    )
    pool = solver.solve_pool(project, candidates, AssignmentWeights(), n_alternatives=2, min_difference=1)
    for result in pool:
        for member in result.members:
            assert round(member.fte_allocation * 5, 9) == round(member.fte_allocation * 5)
            assert sum(a.fte for a in member.skill_allocations) == pytest.approx(member.fte_allocation)
            for allocation in member.skill_allocations:
                assert round(allocation.fte * 5, 9) == round(allocation.fte * 5)


def test_one_fte_seats_one_full_time_person_by_default(solver):
    candidates = [_person(f"p{i}") for i in range(4)]
    result = solver.solve(_dated(_python(min_level=1)), candidates, AssignmentWeights(chemistry=0.0))
    assert list(_allocations(result).values()) == [1.0]


def test_part_fte_seats_one_person_at_that_share_by_default(solver):
    candidates = [_person(f"p{i}") for i in range(4)]
    result = solver.solve(_dated(_python(fte=0.8, min_level=1)), candidates, AssignmentWeights())
    assert list(_allocations(result).values()) == [0.8]


def test_split_follows_the_grid_not_an_even_share(solver):
    # Three people at 0.6 each can cover 1 FTE over at most two people only as 0.6 + 0.4.
    candidates = [_person(f"p{i}", availability=0.6) for i in range(3)]
    result = solver.solve(_dated(_python(min_level=1, max_people=2)), candidates, AssignmentWeights())
    assert sorted(_allocations(result).values()) == pytest.approx([0.4, 0.6])


def test_max_people_caps_the_people_on_a_skill(solver):
    candidates = [_person(f"p{i}", availability=0.4) for i in range(6)]
    result = solver.solve(_dated(_python(fte=2.0, min_level=1, max_people=3)), candidates, AssignmentWeights())
    assert len(result.members) == 3
    (coverage,) = result.coverage
    assert coverage.skills[0].covered_fte == pytest.approx(1.2)
    assert not coverage.skills[0].met


def test_availability_is_floored_to_the_grid(solver):
    result = solver.solve(_dated(_python(min_level=1)), [_person("a", availability=0.87)], AssignmentWeights())
    assert _allocations(result) == {"a": 0.8}


def test_person_below_one_step_is_never_selected(solver):
    project = _dated(_python(min_level=1, max_people=2)).model_copy(update={"included_person_ids": ["tiny"]})
    candidates = [_person("tiny", availability=0.19), _person("full")]
    result = solver.solve(project, candidates, AssignmentWeights())
    assert _allocations(result) == {"full": 1.0}


def test_person_below_min_level_is_never_allocated_to_that_skill(solver):
    candidates = [_person("pythonista", python_level=5.0, react_level=2.0), _person("reactor", 1.0, 1.0, 4.0)]
    project = _dated(_python(min_level=3), SkillRequirement(id="react", min_level=3, fte=1.0))
    # Performance alone would put the strong pythonista on both skills if levels didn't gate them.
    result = solver.solve(project, candidates, PERF_ONLY)
    by_person = {m.person_id: {a.skill_id: a.fte for a in m.skill_allocations} for m in result.members}
    assert by_person == {"pythonista": {"python": 1.0}, "reactor": {"react": 1.0}}


def test_one_person_can_fill_two_skills_within_floored_availability(solver):
    project = _dated(_python(fte=0.4, min_level=1), SkillRequirement(id="react", min_level=1, fte=0.6))
    result = solver.solve(project, [_person("both", availability=0.87, react_level=3.0)], AssignmentWeights())
    (member,) = result.members
    assert member.fte_allocation == pytest.approx(0.8)
    assert sum(a.fte for a in member.skill_allocations) == pytest.approx(0.8)
    assert {a.skill_id for a in member.skill_allocations} == {"python", "react"}


def test_short_qualified_supply_gives_partial_skill_coverage(solver):
    project = _dated(_python(fte=2.0, min_level=4), SkillRequirement(id="react", min_level=3, fte=1.0))
    candidates = [_person("py", python_level=5.0), _person("weak", python_level=2.0), _person("re", 1.0, 1.0, 4.0)]
    result = solver.solve(project, candidates, AssignmentWeights())
    python, react = result.coverage[0].skills
    assert (python.required_fte, python.covered_fte, python.met) == (2.0, 1.0, False)
    assert (react.required_fte, react.covered_fte, react.met) == (1.0, 1.0, True)
    assert not result.fully_covered


def test_people_shared_by_two_skills_give_partial_coverage_not_an_error(solver):
    # Each skill alone could be filled, but the same two people would have to fill both.
    candidates = [_person("a", react_level=4.0), _person("b", react_level=4.0)]
    project = _dated(_python(fte=2.0, min_level=1), SkillRequirement(id="react", min_level=1, fte=1.0))
    result = solver.solve(project, candidates, AssignmentWeights())
    (coverage,) = result.coverage
    assert (coverage.required_fte, coverage.staffed_fte) == (3.0, 2.0)
    assert not result.fully_covered
