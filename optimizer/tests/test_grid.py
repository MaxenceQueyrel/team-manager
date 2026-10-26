from datetime import date

import pytest
from pydantic import ValidationError
from optimizer.constraints import feasible_people
from optimizer.grid import floor_to_grid, floor_to_steps, is_on_grid
from optimizer.models import AvailabilityWindow, DateRange, PersonInput, ProjectInput, Seniority, SkillRequirement

SPAN = DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25))


@pytest.mark.parametrize(
    ("ratio", "steps", "floored"),
    [(1.0, 5, 1.0), (0.87, 4, 0.8), (0.5, 2, 0.4), (0.6, 3, 0.6), (0.2, 1, 0.2), (0.19, 0, 0.0), (0.0, 0, 0.0)],
)
def test_floor_to_grid(ratio, steps, floored):
    assert floor_to_steps(ratio) == steps
    assert floor_to_grid(ratio) == floored


def test_floor_absorbs_round_off_just_below_a_step():
    assert floor_to_grid(0.6 - 1e-9) == 0.6


@pytest.mark.parametrize(("ratio", "expected"), [(0.2, True), (0.6, True), (1.4, True), (5.0, True), (0.5, False)])
def test_is_on_grid(ratio, expected):
    assert is_on_grid(ratio) is expected


@pytest.mark.parametrize(("fte", "default_max_people"), [(0.2, 1), (0.8, 1), (1.0, 1), (1.2, 2), (2.0, 2), (5.0, 5)])
def test_max_people_defaults_to_ceil_fte(fte, default_max_people):
    assert SkillRequirement(id="python", min_level=3, fte=fte).max_people == default_max_people


@pytest.mark.parametrize(("fte", "max_people"), [(1.0, 1), (1.0, 5), (1.2, 2), (1.2, 6), (0.2, 1)])
def test_max_people_within_range_is_accepted(fte, max_people):
    assert SkillRequirement(id="python", min_level=3, fte=fte, max_people=max_people).max_people == max_people


@pytest.mark.parametrize(("fte", "max_people"), [(1.0, 0), (1.0, 6), (1.2, 1), (0.2, 2), (2.0, 1)])
def test_max_people_out_of_range_is_rejected(fte, max_people):
    with pytest.raises(ValidationError, match="max_people"):
        SkillRequirement(id="python", min_level=3, fte=fte, max_people=max_people)


@pytest.mark.parametrize("fte", [0.0, 0.1, 0.5, 1.1, 5.2])
def test_fte_off_the_grid_or_out_of_range_is_rejected(fte):
    with pytest.raises(ValidationError):
        SkillRequirement(id="python", min_level=3, fte=fte)


def test_feasible_people_drops_anyone_below_one_step():
    def person(person_id, ratio):
        window = AvailabilityWindow(start=SPAN.start, end=SPAN.end, ratio=ratio)
        return PersonInput(
            id=person_id, seniority=Seniority.SENIOR, years_of_experience=5, availability_windows=[window]
        )

    project = ProjectInput(id="proj", date_ranges=[SPAN])
    people = [person("tiny", 0.15), person("one_day", 0.2), person("part", 0.55)]
    assert [p.id for p in feasible_people(project, people, respect_exclusions=True)] == ["one_day", "part"]
