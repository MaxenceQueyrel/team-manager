from datetime import date

import pytest

from optimizer.availability import effective_availability
from optimizer.models import AvailabilityWindow, DateRange, PersonInput, ProjectInput


def _person(fte_capacity=1.0, availability_windows=None):
    return PersonInput(
        id="p1",
        seniority="senior",
        years_of_experience=5.0,
        fte_capacity=fte_capacity,
        availability_windows=availability_windows or [],
    )


def _project(date_ranges=None):
    return ProjectInput(id="proj", date_ranges=date_ranges or [])


def test_no_date_ranges_falls_back_to_flat_capacity():
    person = _person(fte_capacity=0.7)
    project = _project()
    assert effective_availability(person, project) == 0.7


def test_window_fully_covering_range_overrides_capacity():
    person = _person(
        fte_capacity=1.0,
        availability_windows=[AvailabilityWindow(start=date(2026, 1, 5), end=date(2026, 1, 25), ratio=0.4)],
    )
    project = _project([DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25))])
    assert effective_availability(person, project) == 0.4


def test_uncovered_days_fall_back_to_flat_capacity():
    person = _person(
        fte_capacity=0.5,
        availability_windows=[AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 10), ratio=1.0)],
    )
    project = _project([DateRange(start=date(2026, 1, 11), end=date(2026, 1, 20))])
    assert effective_availability(person, project) == 0.5


def test_day_weighted_average_across_spans_and_windows():
    person = _person(
        fte_capacity=1.0,
        availability_windows=[
            AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 15), ratio=1.0),
            AvailabilityWindow(start=date(2026, 1, 16), end=date(2026, 1, 31), ratio=0.5),
            AvailabilityWindow(start=date(2026, 3, 1), end=date(2026, 3, 31), ratio=0.8),
        ],
    )
    project = _project(
        [
            DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25)),
            DateRange(start=date(2026, 3, 2), end=date(2026, 3, 19)),
        ]
    )
    assert effective_availability(person, project) == pytest.approx(0.779, abs=0.01)
