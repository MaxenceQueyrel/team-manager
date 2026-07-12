from datetime import date, timedelta

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


def daily_availability(person: PersonInput, date_range: DateRange) -> list[tuple[date, date, float]]:
    """Breaks a date range down into contiguous segments of constant availability ratio.

    Args:
        person: The candidate person, with an optional set of availability windows.
        date_range: The date range to break down (e.g. one of a project's date_ranges).

    Returns:
        A list of (segment_start, segment_end, ratio) tuples, both bounds inclusive, that
        partition date_range with no gaps or overlaps, ordered chronologically. Days not
        covered by any availability window use person.fte_capacity as the ratio.
    """
    return _segments(date_range, person.availability_windows, person.fte_capacity)


def _days_in(date_range: DateRange) -> int:
    return (date_range.end - date_range.start).days + 1


def _weighted_ratio_sum(date_range: DateRange, windows: list[AvailabilityWindow], default_ratio: float) -> float:
    return sum(
        ((seg_end - seg_start).days + 1) * ratio
        for seg_start, seg_end, ratio in _segments(date_range, windows, default_ratio)
    )


def _segments(
    date_range: DateRange, windows: list[AvailabilityWindow], default_ratio: float
) -> list[tuple[date, date, float]]:
    # Clip windows to the date_range; discard those that don't intersect.
    clipped = []
    for w in windows:
        start = max(date_range.start, w.start)
        end = min(date_range.end, w.end)
        if start <= end:
            clipped.append((start, end, w.ratio))

    if not clipped:
        return [(date_range.start, date_range.end, default_ratio)]

    # Sweep line: collect exclusive upper boundaries so every segment between
    # consecutive boundaries is fully inside or fully outside each window.
    boundaries = {date_range.start, date_range.end + timedelta(days=1)}
    for start, end, _ in clipped:
        boundaries.add(start)
        boundaries.add(end + timedelta(days=1))

    sorted_bounds = sorted(boundaries)
    segments = []
    for seg_start, seg_end_excl in zip(sorted_bounds, sorted_bounds[1:]):
        seg_end = seg_end_excl - timedelta(days=1)
        # Use the minimum ratio of all windows that fully cover this segment;
        # fall back to default_ratio when no window applies.
        active = [ratio for s, e, ratio in clipped if s <= seg_start and e >= seg_end]
        segments.append((seg_start, seg_end, min(active) if active else default_ratio))

    return segments
