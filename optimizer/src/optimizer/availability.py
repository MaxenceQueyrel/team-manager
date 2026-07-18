from datetime import date, timedelta

from optimizer.models import AvailabilityWindow, DateRange, PersonInput, ProjectInput


def effective_availability(
    person: PersonInput, project: ProjectInput, assignments: list[AvailabilityWindow] | None = None
) -> float:
    """Computes the person's availability ratio for the project's calendar.

    Args:
        person: The candidate person, with an optional set of availability windows.
        project: The project, with an optional set of date ranges it runs during.
        assignments: The person's active project commitments, as date-ranged ratios of
            FTE. Wherever no explicit availability_windows apply, their ratios are summed
            and subtracted from fte_capacity (floored at 0); availability_windows always
            take precedence over assignments, e.g. for leave.

    Returns:
        The day-weighted average of person.availability_windows across project.date_ranges,
        falling back to fte_capacity reduced by overlapping assignments for any day not
        covered by a window. If the project has no date ranges, returns person.fte_capacity
        directly.
    """
    if not project.date_ranges:
        return person.fte_capacity

    weighted_days = 0.0
    total_days = 0
    for date_range in project.date_ranges:
        weighted_days += _weighted_ratio_sum(
            date_range, person.availability_windows, person.fte_capacity, assignments
        )
        total_days += _days_in(date_range)

    return weighted_days / total_days


def daily_availability(
    person: PersonInput, date_range: DateRange, assignments: list[AvailabilityWindow] | None = None
) -> list[tuple[date, date, float]]:
    """Breaks a date range down into contiguous segments of constant availability ratio.

    Args:
        person: The candidate person, with an optional set of availability windows.
        date_range: The date range to break down (e.g. one of a project's date_ranges).
        assignments: The person's active project commitments, as date-ranged ratios of
            FTE. Wherever no explicit availability_windows apply, their ratios are summed
            and subtracted from fte_capacity (floored at 0); availability_windows always
            take precedence over assignments, e.g. for leave.

    Returns:
        A list of (segment_start, segment_end, ratio) tuples, both bounds inclusive, that
        partition date_range with no gaps or overlaps, ordered chronologically. Days not
        covered by any availability window use fte_capacity minus overlapping assignments
        as the ratio.
    """
    return _segments(date_range, person.availability_windows, person.fte_capacity, assignments)


def _days_in(date_range: DateRange) -> int:
    return (date_range.end - date_range.start).days + 1


def _weighted_ratio_sum(
    date_range: DateRange,
    windows: list[AvailabilityWindow],
    default_ratio: float,
    assignments: list[AvailabilityWindow] | None = None,
) -> float:
    return sum(
        ((seg_end - seg_start).days + 1) * ratio
        for seg_start, seg_end, ratio in _segments(date_range, windows, default_ratio, assignments)
    )


def _clip_to_range(date_range: DateRange, windows: list[AvailabilityWindow]) -> list[tuple[date, date, float]]:
    clipped = []
    for w in windows:
        start = max(date_range.start, w.start)
        end = min(date_range.end, w.end)
        if start <= end:
            clipped.append((start, end, w.ratio))
    return clipped


def _segments(
    date_range: DateRange,
    windows: list[AvailabilityWindow],
    default_ratio: float,
    assignments: list[AvailabilityWindow] | None = None,
) -> list[tuple[date, date, float]]:
    clipped_windows = _clip_to_range(date_range, windows)
    clipped_assignments = _clip_to_range(date_range, assignments or [])

    if not clipped_windows and not clipped_assignments:
        return [(date_range.start, date_range.end, default_ratio)]

    # Sweep line: collect exclusive upper boundaries so every segment between
    # consecutive boundaries is fully inside or fully outside each window/assignment.
    boundaries = {date_range.start, date_range.end + timedelta(days=1)}
    for start, end, _ in clipped_windows + clipped_assignments:
        boundaries.add(start)
        boundaries.add(end + timedelta(days=1))

    sorted_bounds = sorted(boundaries)
    segments = []
    for seg_start, seg_end_excl in zip(sorted_bounds, sorted_bounds[1:]):
        seg_end = seg_end_excl - timedelta(days=1)
        # Explicit windows override; use the minimum ratio of all windows that fully
        # cover this segment. Otherwise, subtract overlapping assignment ratios from
        # default_ratio, floored at 0.
        active_windows = [ratio for s, e, ratio in clipped_windows if s <= seg_start and e >= seg_end]
        if active_windows:
            ratio = min(active_windows)
        else:
            active_assignments = [ratio for s, e, ratio in clipped_assignments if s <= seg_start and e >= seg_end]
            ratio = max(default_ratio - sum(active_assignments), 0.0)
        segments.append((seg_start, seg_end, ratio))

    return segments
