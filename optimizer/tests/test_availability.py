from datetime import date

import pytest
from pydantic import ValidationError

from optimizer.availability import base_availability_ratio, daily_availability, effective_availability
from optimizer.models import AvailabilityWindow, DateRange, PersonInput, ProjectInput, Seniority


def _person(working_days_per_week=5, availability_windows=None, vacations=None):
    return PersonInput(
        id="p1",
        seniority=Seniority.SENIOR,
        years_of_experience=5.0,
        working_days_per_week=working_days_per_week,
        availability_windows=availability_windows or [],
        vacations=vacations or [],
    )


def _project(date_ranges=None):
    return ProjectInput(id="proj", date_ranges=date_ranges or [])


@pytest.mark.parametrize(("days", "ratio"), [(1, 0.2), (3, 0.6), (4, 0.8), (5, 1.0), (6, 1.0), (7, 1.0)])
def test_base_ratio_derives_from_working_days_capped_at_full_time(days, ratio):
    assert base_availability_ratio(_person(working_days_per_week=days)) == pytest.approx(ratio)


def test_working_days_per_week_defaults_to_full_week():
    assert PersonInput(id="p1", seniority=Seniority.SENIOR, years_of_experience=5.0).working_days_per_week == 5


@pytest.mark.parametrize("days", [0, 8])
def test_working_days_per_week_outside_one_to_seven_is_rejected(days):
    with pytest.raises(ValidationError):
        _person(working_days_per_week=days)


def test_no_date_ranges_falls_back_to_working_pattern():
    person = _person(working_days_per_week=4)
    project = _project()
    assert effective_availability(person, project) == 0.8


def test_window_fully_covering_range_overrides_capacity():
    person = _person(
        availability_windows=[AvailabilityWindow(start=date(2026, 1, 5), end=date(2026, 1, 25), ratio=0.4)],
    )
    project = _project([DateRange(start=date(2026, 1, 5), end=date(2026, 1, 25))])
    assert effective_availability(person, project) == 0.4


def test_uncovered_days_fall_back_to_working_pattern():
    person = _person(
        working_days_per_week=3,
        availability_windows=[AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 10), ratio=1.0)],
    )
    project = _project([DateRange(start=date(2026, 1, 11), end=date(2026, 1, 20))])
    assert effective_availability(person, project) == 0.6


def test_overlapping_windows_use_minimum_ratio():
    # Jan 1-3: window A only  (ratio=0.8) → 3 days
    # Jan 4-6: both windows   (min ratio=0.6) → 3 days
    # Jan 7-10: window B only (ratio=0.6) → 4 days
    # expected: (3*0.8 + 3*0.6 + 4*0.6) / 10 = 6.6 / 10 = 0.66
    person = _person(
        availability_windows=[
            AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 6), ratio=0.8),
            AvailabilityWindow(start=date(2026, 1, 4), end=date(2026, 1, 10), ratio=0.6),
        ],
    )
    project = _project([DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))])
    assert effective_availability(person, project) == pytest.approx(0.66)


def test_day_weighted_average_across_spans_and_windows():
    person = _person(
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


def test_daily_availability_no_windows_falls_back_to_working_pattern():
    person = _person(working_days_per_week=4)
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))
    assert daily_availability(person, date_range) == [(date(2026, 1, 1), date(2026, 1, 10), 0.8)]


def test_daily_availability_gap_falls_back_to_working_pattern_segment():
    person = _person(
        working_days_per_week=3,
        availability_windows=[AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 5), ratio=1.0)],
    )
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))
    assert daily_availability(person, date_range) == [
        (date(2026, 1, 1), date(2026, 1, 5), 1.0),
        (date(2026, 1, 6), date(2026, 1, 10), 0.6),
    ]


def test_daily_availability_overlapping_windows_use_minimum_ratio():
    person = _person(
        availability_windows=[
            AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 6), ratio=0.8),
            AvailabilityWindow(start=date(2026, 1, 4), end=date(2026, 1, 10), ratio=0.6),
        ],
    )
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))
    assert daily_availability(person, date_range) == [
        (date(2026, 1, 1), date(2026, 1, 3), 0.8),
        (date(2026, 1, 4), date(2026, 1, 6), 0.6),
        (date(2026, 1, 7), date(2026, 1, 10), 0.6),
    ]


def test_daily_availability_partial_day_edges_clip_to_date_range():
    person = _person(
        availability_windows=[AvailabilityWindow(start=date(2025, 12, 20), end=date(2026, 1, 5), ratio=0.3)],
    )
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))
    assert daily_availability(person, date_range) == [
        (date(2026, 1, 1), date(2026, 1, 5), 0.3),
        (date(2026, 1, 6), date(2026, 1, 10), 1.0),
    ]


def test_daily_availability_agrees_with_effective_availability_weighted_average():
    person = _person(
        availability_windows=[
            AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 6), ratio=0.8),
            AvailabilityWindow(start=date(2026, 1, 4), end=date(2026, 1, 10), ratio=0.6),
        ],
    )
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))
    segments = daily_availability(person, date_range)
    total_days = (date_range.end - date_range.start).days + 1
    weighted_average = sum(((end - start).days + 1) * ratio for start, end, ratio in segments) / total_days

    project = _project([date_range])
    assert weighted_average == pytest.approx(effective_availability(person, project))


def test_daily_availability_assignment_reduces_default_ratio():
    person = _person()
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))
    assignments = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 10), ratio=0.4)]

    assert daily_availability(person, date_range, assignments) == [
        (date(2026, 1, 1), date(2026, 1, 10), 0.6)
    ]


def test_daily_availability_sums_overlapping_assignments():
    person = _person()
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))
    assignments = [
        AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 10), ratio=0.3),
        AvailabilityWindow(start=date(2026, 1, 5), end=date(2026, 1, 10), ratio=0.4),
    ]

    segments = daily_availability(person, date_range, assignments)
    assert [(seg_start, seg_end) for seg_start, seg_end, _ in segments] == [
        (date(2026, 1, 1), date(2026, 1, 4)),
        (date(2026, 1, 5), date(2026, 1, 10)),
    ]
    assert [ratio for _, _, ratio in segments] == pytest.approx([0.7, 0.3])


def test_daily_availability_assignment_reduction_floors_at_zero():
    person = _person(working_days_per_week=3)
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))
    assignments = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 10), ratio=0.8)]

    assert daily_availability(person, date_range, assignments) == [
        (date(2026, 1, 1), date(2026, 1, 10), 0.0)
    ]


def test_daily_availability_window_overrides_assignment_reduction():
    person = _person(
        availability_windows=[AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 5), ratio=0.0)],
    )
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))
    assignments = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 10), ratio=0.4)]

    assert daily_availability(person, date_range, assignments) == [
        (date(2026, 1, 1), date(2026, 1, 5), 0.0),
        (date(2026, 1, 6), date(2026, 1, 10), 0.6),
    ]


def test_daily_availability_no_assignments_is_unchanged():
    person = _person(working_days_per_week=4)
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))

    assert daily_availability(person, date_range) == daily_availability(person, date_range, [])


def test_effective_availability_assignment_reduces_ratio():
    person = _person()
    project = _project([DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))])
    assignments = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 10), ratio=0.4)]

    assert effective_availability(person, project, assignments) == pytest.approx(0.6)


def test_assignment_reduces_working_pattern_ratio():
    person = _person(working_days_per_week=4)
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))
    assignments = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 10), ratio=0.3)]

    ((_, _, ratio),) = daily_availability(person, date_range, assignments)
    assert ratio == pytest.approx(0.5)


def test_daily_availability_vacation_zeroes_its_days():
    person = _person(vacations=[DateRange(start=date(2026, 1, 4), end=date(2026, 1, 6))])
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))

    assert daily_availability(person, date_range) == [
        (date(2026, 1, 1), date(2026, 1, 3), 1.0),
        (date(2026, 1, 4), date(2026, 1, 6), 0.0),
        (date(2026, 1, 7), date(2026, 1, 10), 1.0),
    ]


def test_daily_availability_vacation_overrides_availability_window():
    person = _person(
        availability_windows=[AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 10), ratio=0.5)],
        vacations=[DateRange(start=date(2026, 1, 9), end=date(2026, 1, 20))],
    )
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))

    assert daily_availability(person, date_range) == [
        (date(2026, 1, 1), date(2026, 1, 8), 0.5),
        (date(2026, 1, 9), date(2026, 1, 10), 0.0),
    ]


def test_daily_availability_vacation_overrides_assignment_reduction():
    person = _person(vacations=[DateRange(start=date(2026, 1, 1), end=date(2026, 1, 5))])
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))
    assignments = [AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 10), ratio=0.4)]

    assert daily_availability(person, date_range, assignments) == [
        (date(2026, 1, 1), date(2026, 1, 5), 0.0),
        (date(2026, 1, 6), date(2026, 1, 10), 0.6),
    ]


def test_vacation_outside_range_is_ignored():
    person = _person(working_days_per_week=4, vacations=[DateRange(start=date(2026, 2, 1), end=date(2026, 2, 14))])
    date_range = DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))

    assert daily_availability(person, date_range) == [(date(2026, 1, 1), date(2026, 1, 10), 0.8)]


def test_effective_availability_combines_working_pattern_and_vacation():
    # 8 working days at 4/5 and 2 vacation days: (8 * 0.8 + 2 * 0) / 10 = 0.64
    person = _person(working_days_per_week=4, vacations=[DateRange(start=date(2026, 1, 9), end=date(2026, 1, 10))])
    project = _project([DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))])

    assert effective_availability(person, project) == pytest.approx(0.64)


def test_vacations_do_not_apply_without_project_date_ranges():
    person = _person(working_days_per_week=4, vacations=[DateRange(start=date(2026, 1, 1), end=date(2026, 1, 10))])

    assert effective_availability(person, _project()) == 0.8
