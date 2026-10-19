from datetime import date

import pytest
from optimizer.adapters.pulp_solver import MIN_FTE_SHARE, PuLPTeamAssignmentSolver
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
            skills=[SkillLevel(id="python", level=5)],
            growth_targets=[],
            affinities={"p2": 4.0},
        ),
        PersonInput(
            id="p2",
            seniority=Seniority.JUNIOR,
            years_of_experience=1.0,
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
    assert result.score <= result.max_score


def test_empty_people(solver, project):
    result = solver.solve(project, [], AssignmentWeights())
    assert result.members == []
    assert result.score == 0.0
    assert result.max_score == 0.0


def test_max_score_reflects_slots_and_weights(solver, project, people):
    weights = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0, preference=0.0)
    result = solver.solve(project, people, weights)
    # n_slots=1, per-person max is performance weight alone (1.0) → max_score = 1.0
    assert result.max_score == pytest.approx(1.0)


def test_max_score_accounts_for_chemistry(solver, project, people):
    project.n_slots = 2
    weights = AssignmentWeights(performance=0.0, chemistry=1.0, growth=0.0, cost=0.0)
    result = solver.solve(project, people, weights)
    # 2 selected → 1 pair, chemistry weight 1.0 × max affinity 5.0 = 5.0
    assert result.max_score == pytest.approx(5.0)
    assert result.score <= result.max_score


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


def test_preference_weight_prefers_stated_preference(solver, project, people):
    people[1].preferences = ["python"]
    weights = AssignmentWeights(performance=0.0, chemistry=0.0, growth=0.0, cost=0.0, preference=1.0)
    result = solver.solve(project, people, weights)
    # p2 lists python as a preference; p1 doesn't → higher preference score
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
    # but p2 is forced in at the minimum share and p1 covers the rest.
    allocations = {m.person_id: m.fte_allocation for m in result.members}
    assert allocations == pytest.approx({"p2": MIN_FTE_SHARE, "p1": 1.0 - MIN_FTE_SHARE})


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
    # p1 is the better fit, so it gets all it can give; p2 covers the remainder.
    result = solver.solve(project, people, AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0))
    p1_member = next(m for m in result.members if m.person_id == "p1")
    assert p1_member.fte_allocation == pytest.approx(0.4)


def test_vacation_excludes_person(solver, project, people):
    project.date_ranges = [SPAN]
    project.included_person_ids = ["p1"]
    people[0].vacations = [DateRange(start=date(2026, 1, 1), end=date(2026, 1, 31))]
    result = solver.solve(project, people, AssignmentWeights())
    assert all(m.person_id != "p1" for m in result.members)


def test_fte_allocation_reflects_working_pattern(solver, project, people):
    project.included_person_ids = ["p1"]
    people[0].working_days_per_week = 3
    result = solver.solve(project, people, AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0))
    p1_member = next(m for m in result.members if m.person_id == "p1")
    assert p1_member.fte_allocation == pytest.approx(0.6)


def test_fully_assigned_person_is_not_selected(solver, project, people):
    project.date_ranges = [DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25))]
    project.included_person_ids = ["p1"]
    people[0].assignments = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=1.0)]
    result = solver.solve(project, people, AssignmentWeights())
    assert all(m.person_id != "p1" for m in result.members)


def test_fte_allocation_is_reduced_by_assignments(solver, project, people):
    project.date_ranges = [DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25))]
    project.included_person_ids = ["p1"]
    people[0].assignments = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 31), ratio=0.5)]
    result = solver.solve(project, people, AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0))
    p1_member = next(m for m in result.members if m.person_id == "p1")
    assert p1_member.fte_allocation == pytest.approx(0.5)


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

    expected_max_score = (
        solver.solve(standalone_phase1, people, weights).max_score
        + solver.solve(standalone_phase2, people, weights).max_score
    )
    assert result.max_score == pytest.approx(expected_max_score)


def test_handover_keeps_same_person_across_phases(solver):
    # Each phase favours a different specialist on skill alone, but a strong
    # handover reward should make the optimizer keep one person for both phases.
    candidates = [
        PersonInput(id="a", seniority=Seniority.SENIOR, years_of_experience=8.0,
                    skills=[SkillLevel(id="python", level=5), SkillLevel(id="react", level=3)]),
        PersonInput(id="b", seniority=Seniority.SENIOR, years_of_experience=8.0,
                    skills=[SkillLevel(id="python", level=3), SkillLevel(id="react", level=5)]),
    ]
    phase1 = ProjectPhase(id="stage-1", n_slots=1, skill_requirements=[SkillRequirement(id="python", min_level=5)])
    phase2 = ProjectPhase(id="stage-2", n_slots=1, skill_requirements=[SkillRequirement(id="react", min_level=5)])
    project = ProjectInput(id="proj-test", phases=[phase1, phase2])

    perf_only = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0)
    independent = solver.solve(project, candidates, perf_only)
    stage1 = next(m for m in independent.members if m.phase_id == "stage-1")
    stage2 = next(m for m in independent.members if m.phase_id == "stage-2")
    assert stage1.person_id != stage2.person_id  # different specialists without handover

    with_handover = solver.solve(project, candidates, perf_only.model_copy(update={"handover": 0.5}))
    stage1 = next(m for m in with_handover.members if m.phase_id == "stage-1")
    stage2 = next(m for m in with_handover.members if m.phase_id == "stage-2")
    assert stage1.person_id == stage2.person_id  # team kept stable across phases


def test_squad_pulls_in_partner(solver):
    # On skill alone a DS project would pick the two best data scientists and
    # never the developer; a squad tying the developer to a selected member
    # forces the pair to move together.
    candidates = [
        PersonInput(id="ds_a", seniority=Seniority.SENIOR, years_of_experience=5, skills=[SkillLevel(id="ds", level=5.0)]),
        PersonInput(id="ds_b", seniority=Seniority.SENIOR, years_of_experience=5, skills=[SkillLevel(id="ds", level=4.5)]),
        PersonInput(id="dev", seniority=Seniority.SENIOR, years_of_experience=5, skills=[SkillLevel(id="dev", level=4.5)]),
    ]
    perf_only = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0)
    base = ProjectInput(
        id="proj-test",
        n_slots=2,
        skill_requirements=[SkillRequirement(id="ds", min_level=3.0)],
        included_person_ids=["ds_a"],
    )

    without = solver.solve(base, candidates, perf_only)
    assert {m.person_id for m in without.members} == {"ds_a", "ds_b"}  # developer skipped

    with_squad = base.model_copy(update={"squads": [Squad(member_ids=["ds_a", "dev"])]})
    result = solver.solve(with_squad, candidates, perf_only)
    allocations = {m.person_id: m.fte_allocation for m in result.members}
    # The squad drags the developer in, but only at the minimum share: the FTE
    # still goes to the better data scientists.
    assert allocations == pytest.approx({"ds_a": 1.0, "dev": MIN_FTE_SHARE, "ds_b": 1.0 - MIN_FTE_SHARE})


def test_squad_larger_than_n_slots_is_still_solved(solver):
    # n_slots=1 with a forced member whose squad partner isn't otherwise
    # accounted for used to under-size the cardinality constraint and make
    # the MILP silently infeasible. Both squad members should now be seated.
    candidates = [
        PersonInput(id="a", seniority=Seniority.SENIOR, years_of_experience=5),
        PersonInput(id="b", seniority=Seniority.SENIOR, years_of_experience=5),
    ]
    project = ProjectInput(
        id="proj-test",
        n_slots=1,
        included_person_ids=["a"],
        squads=[Squad(member_ids=["a", "b"])],
    )
    result = solver.solve(project, candidates, AssignmentWeights())
    assert {m.person_id for m in result.members} == {"a", "b"}


def _oversized_squad_project():
    # An unforced squad whose minimum shares add up to more than the 1-FTE need
    # can't be seated, and it's the only staffing option.
    size = int(1 / MIN_FTE_SHARE) + 1
    candidates = [PersonInput(id=f"m{i}", seniority=Seniority.SENIOR, years_of_experience=5) for i in range(size)]
    project = ProjectInput(id="proj-test", n_slots=1, squads=[Squad(member_ids=[p.id for p in candidates])])
    return project, candidates


def test_unsatisfiable_squad_raises(solver):
    project, candidates = _oversized_squad_project()
    with pytest.raises(InfeasibleAssignmentError):
        solver.solve(project, candidates, AssignmentWeights())


def test_squad_splits_a_single_fte(solver):
    candidates = [
        PersonInput(id="a", seniority=Seniority.SENIOR, years_of_experience=5),
        PersonInput(id="b", seniority=Seniority.SENIOR, years_of_experience=5),
    ]
    project = ProjectInput(id="proj-test", n_slots=1, squads=[Squad(member_ids=["a", "b"])])
    result = solver.solve(project, candidates, AssignmentWeights())
    assert {m.person_id for m in result.members} == {"a", "b"}
    assert sum(m.fte_allocation for m in result.members) == pytest.approx(1.0)


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


@pytest.fixture
def pythonistas():
    return [
        PersonInput(id=f"py{level}", seniority=Seniority.SENIOR, years_of_experience=5,
                    skills=[SkillLevel(id="python", level=level)])
        for level in (5.0, 4.5, 4.0, 3.5, 3.0, 2.5)
    ]


@pytest.fixture
def python_project():
    return ProjectInput(
        id="proj-test",
        n_slots=2,
        skill_requirements=[SkillRequirement(id="python", min_level=1)],
        date_ranges=[SPAN],
    )


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
            "n_slots": 3,
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
    # 3 candidates for 2 slots admit exactly 3 teams differing by one member.
    pool = solver.solve_pool(python_project, pythonistas[:3], AssignmentWeights(), n_alternatives=10, min_difference=1)
    assert len(pool) == 3
    assert len({frozenset(_team(r)) for r in pool}) == 3


def test_pool_min_difference_is_clamped_to_team_size(solver, python_project, pythonistas):
    project = python_project.model_copy(update={"n_slots": 1})
    pool = solver.solve_pool(project, pythonistas[:3], AssignmentWeights(), n_alternatives=5, min_difference=4)
    assert len(pool) == 3


def test_pool_without_alternatives_matches_solve(solver, python_project, pythonistas):
    weights = AssignmentWeights()
    pool = solver.solve_pool(python_project, pythonistas, weights, n_alternatives=0)
    assert pool == [solver.solve(python_project, pythonistas, weights)]


def test_pool_first_solve_still_raises_when_infeasible(solver):
    project, candidates = _oversized_squad_project()
    with pytest.raises(InfeasibleAssignmentError):
        solver.solve_pool(project, candidates, AssignmentWeights())


@pytest.mark.parametrize("handover", [0.0, 0.5])
def test_pool_cut_spans_all_phases(solver, pythonistas, handover):
    # Two single-seat phases: a cut of 2 must be met across the whole project, so
    # an alternative may keep one phase's pick and change only the other.
    phases = [
        ProjectPhase(id=f"stage-{k}", n_slots=1, skill_requirements=[SkillRequirement(id="python", min_level=1)])
        for k in (1, 2)
    ]
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
        n_slots=1,
        date_range=DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25)),
    )
    phase2 = ProjectPhase(
        id="stage-2",
        n_slots=1,
        date_range=DateRange(start=date(2026, 3, 2), end=date(2026, 3, 19)),
    )
    project = ProjectInput(id="proj-test", phases=[phase1, phase2], included_person_ids=["p1"])

    result = solver.solve(project, people, AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0))

    stage1_ids = [m.person_id for m in result.members if m.phase_id == "stage-1"]
    stage2_members = [m for m in result.members if m.phase_id == "stage-2"]
    assert "p1" not in stage1_ids
    p1_stage2 = next(m for m in stage2_members if m.person_id == "p1")
    assert p1_stage2.fte_allocation == pytest.approx(1.0)


def _person(person_id, availability=1.0, python_level=4.0):
    # Fractional availability is a window over SPAN, so it only applies to projects running in SPAN.
    return PersonInput(
        id=person_id,
        seniority=Seniority.SENIOR,
        years_of_experience=5,
        availability_windows=[AvailabilityWindow(start=SPAN.start, end=SPAN.end, ratio=availability)],
        skills=[SkillLevel(id="python", level=python_level)],
    )


def test_part_time_people_combine_to_cover_the_need(solver, python_project):
    candidates = [_person(f"half{i}", availability=0.5) for i in range(5)]
    result = solver.solve(python_project, candidates, AssignmentWeights())
    assert len(result.members) == 4
    assert all(m.fte_allocation == pytest.approx(0.5) for m in result.members)
    assert sum(m.fte_allocation for m in result.members) == pytest.approx(2.0)


def test_full_time_people_preferred_over_small_allocations_at_equal_quality(solver, python_project):
    candidates = [_person("full_a"), _person("full_b")] + [_person(f"part{i}", availability=0.3) for i in range(4)]
    result = solver.solve(python_project, candidates, AssignmentWeights())
    assert {m.person_id: m.fte_allocation for m in result.members} == pytest.approx({"full_a": 1.0, "full_b": 1.0})


def test_better_part_timers_beat_a_weaker_full_timer(solver, project):
    project.date_ranges = [SPAN]
    candidates = [_person("weak", python_level=1.5), _person("strong_a", 0.5, 5.0), _person("strong_b", 0.5, 5.0)]
    weights = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0)
    result = solver.solve(project, candidates, weights)
    assert {m.person_id for m in result.members} == {"strong_a", "strong_b"}


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
                AvailabilityWindow(start=SPAN.start, end=SPAN.end, ratio=1.0 if person_id in ("a", "b") else 0.5)
            ],
            affinities={other: 5.0 for other in ids if other != person_id},
        )
        for person_id in ids
    ]
    project = ProjectInput(id="proj-test", n_slots=2, date_ranges=[SPAN])
    weights = AssignmentWeights(performance=0.0, growth=0.0, cost=0.0, chemistry=1.0)
    result = solver.solve(project, candidates, weights)
    assert {m.person_id for m in result.members} == {"a", "b"}
    assert result.score == pytest.approx(result.max_score)


def test_single_fte_is_not_split_between_friends(solver, people):
    project = ProjectInput(id="proj-test", n_slots=1)
    result = solver.solve(project, people, AssignmentWeights(performance=0.0, growth=0.0, cost=0.0, chemistry=1.0))
    assert len(result.members) == 1
    assert result.members[0].fte_allocation == pytest.approx(1.0)


def test_under_capacity_pool_is_capped(solver, python_project):
    project = python_project.model_copy(update={"n_slots": 3})
    candidates = [_person("full"), _person("half", availability=0.5)]
    weights = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0)
    result = solver.solve(project, candidates, weights)
    assert {m.person_id: m.fte_allocation for m in result.members} == pytest.approx({"full": 1.0, "half": 0.5})
    # max_score is sized for the 1.5 FTE the pool can supply, not the 3 requested.
    assert result.max_score == pytest.approx(1.5)


def test_forced_members_exceeding_the_need_split_it_by_score(solver, python_project):
    project = python_project.model_copy(update={"n_slots": 1, "included_person_ids": ["strong", "weak"]})
    candidates = [_person("strong", python_level=5.0), _person("weak", python_level=1.0), _person("other")]
    weights = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0)
    result = solver.solve(project, candidates, weights)
    allocations = {m.person_id: m.fte_allocation for m in result.members}
    assert allocations == pytest.approx({"strong": 1.0 - MIN_FTE_SHARE, "weak": MIN_FTE_SHARE})


def test_handover_rewards_retained_fte(solver):
    phases = [ProjectPhase(id=f"stage-{k}", n_slots=1) for k in (1, 2)]
    project = ProjectInput(id="proj-test", phases=phases)
    candidates = [_person("a"), _person("b")]
    weights = AssignmentWeights(performance=1.0, chemistry=0.0, growth=0.0, cost=0.0, handover=1.0)
    result = solver.solve(project, candidates, weights)
    assert len({m.person_id for m in result.members}) == 1  # same person kept, not split across both
    assert result.score == pytest.approx(result.max_score)


def test_pool_alternatives_with_part_timers_differ_in_people(solver, python_project):
    candidates = [_person(f"half{i}", availability=0.5, python_level=5.0 - i * 0.5) for i in range(8)]
    pool = solver.solve_pool(python_project, candidates, AssignmentWeights(), n_alternatives=2, min_difference=2)
    teams = [{m.person_id for m in r.members} for r in pool]
    assert len(teams) == 3
    for i, a in enumerate(teams):
        assert sum(m.fte_allocation for m in pool[i].members) == pytest.approx(2.0)
        for b in teams[i + 1 :]:
            assert len(a - b) >= 2
