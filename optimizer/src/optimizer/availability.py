from optimizer.models import AvailabilityWindow, DateRange, PersonInput, ProjectInput


def effective_availability(person: PersonInput, project: ProjectInput) -> float:
    """Computes the person's availability ratio for the project's calendar.

    Args:
        person: The candidate person, with an optional set of availability windows.
        project: The project, with an optional set of date ranges it runs during.

    Returns:
        The day-weighted average of person.availability_windows across project.date_ranges,
        falling back to person.fte_capacity for any day not covered by a window. If the
        project has no date ranges, returns person.fte_capacity directly.
    """
    if not project.date_ranges:
        return person.fte_capacity

    weighted_days = 0.0
    total_days = 0
    for date_range in project.date_ranges:
        weighted_days += _weighted_ratio_sum(date_range, person.availability_windows, person.fte_capacity)
        total_days += _days_in(date_range)

    return weighted_days / total_days


def _days_in(date_range: DateRange) -> int:
    return (date_range.end - date_range.start).days + 1


def _overlap_days(a: DateRange, b: DateRange) -> int:
    start = max(a.start, b.start)
    end = min(a.end, b.end)
    return max((end - start).days + 1, 0)


def _weighted_ratio_sum(date_range: DateRange, windows: list[AvailabilityWindow], default_ratio: float) -> float:
    total_days = _days_in(date_range)
    covered_days = 0
    weighted_sum = 0.0
    for window in windows:
        overlap = _overlap_days(date_range, window)
        weighted_sum += overlap * window.ratio
        covered_days += overlap
    weighted_sum += (total_days - covered_days) * default_ratio
    return weighted_sum
