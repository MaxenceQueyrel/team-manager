from datetime import date, timedelta

from optimizer.models import AvailabilityWindow, DateRange, PersonInput, ProjectInput


def base_availability_ratio(person: PersonInput) -> float:
    """Derives a person's base availability ratio from their weekly working pattern.

    Args:
        person: The person whose working_days_per_week sets the ratio.

    Returns:
        working_days_per_week / 5, capped at 1.0 so a pattern beyond a standard week
        never yields more than one full-time equivalent.
    """
    return min(person.working_days_per_week / 5, 1.0)


def effective_availability(
    person: PersonInput, project: ProjectInput, assignments: list[AvailabilityWindow] | None = None
) -> float:
    """Computes the person's availability ratio for the project's calendar.

    Each day's ratio is resolved in precedence order: a day inside person.vacations is
    0; otherwise the minimum ratio of the person.availability_windows covering it;
    otherwise the base ratio from the working pattern minus the summed ratios of the
    overlapping assignments, floored at 0.

    Args:
        person: The candidate person, with their working pattern, vacations and
            availability windows.
        project: The project, with an optional set of date ranges it runs during.
        assignments: The person's active project commitments, as date-ranged ratios of
            FTE, subtracted from the base ratio on days no vacation or window covers.

    Returns:
        The day-weighted average of the daily ratios across project.date_ranges. If the
        project has no date ranges, returns the base ratio from the working pattern.
    """
    if not project.date_ranges:
        return base_availability_ratio(person)

    weighted_days = 0.0
    total_days = 0
    for date_range in project.date_ranges:
        weighted_days += _weighted_ratio_sum(person, date_range, assignments)
        total_days += _days_in(date_range)

    return weighted_days / total_days


def daily_availability(
    person: PersonInput, date_range: DateRange, assignments: list[AvailabilityWindow] | None = None
) -> list[tuple[date, date, float]]:
    """Breaks a date range down into contiguous segments of constant availability ratio.

    Each day's ratio is resolved in precedence order: a day inside person.vacations is
    0; otherwise the minimum ratio of the person.availability_windows covering it;
    otherwise the base ratio from the working pattern minus the summed ratios of the
    overlapping assignments, floored at 0.

    Args:
        person: The candidate person, with their working pattern, vacations and
            availability windows.
        date_range: The date range to break down (e.g. one of a project's date_ranges).
        assignments: The person's active project commitments, as date-ranged ratios of
            FTE, subtracted from the base ratio on days no vacation or window covers.

    Returns:
        A list of (segment_start, segment_end, ratio) tuples, both bounds inclusive, that
        partition date_range with no gaps or overlaps, ordered chronologically.
    """
    return _segments(person, date_range, assignments)


def _days_in(date_range: DateRange) -> int:
    return (date_range.end - date_range.start).days + 1


def _weighted_ratio_sum(
    person: PersonInput, date_range: DateRange, assignments: list[AvailabilityWindow] | None = None
) -> float:
    return sum(
        ((seg_end - seg_start).days + 1) * ratio
        for seg_start, seg_end, ratio in _segments(person, date_range, assignments)
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
    person: PersonInput, date_range: DateRange, assignments: list[AvailabilityWindow] | None = None
) -> list[tuple[date, date, float]]:
    base_ratio = base_availability_ratio(person)
    vacation_windows = [AvailabilityWindow(start=v.start, end=v.end, ratio=0.0) for v in person.vacations]
    clipped_vacations = _clip_to_range(date_range, vacation_windows)
    clipped_windows = _clip_to_range(date_range, person.availability_windows)
    clipped_assignments = _clip_to_range(date_range, assignments or [])

    if not clipped_vacations and not clipped_windows and not clipped_assignments:
        return [(date_range.start, date_range.end, base_ratio)]

    # Sweep line: collect exclusive upper boundaries so every segment between
    # consecutive boundaries is fully inside or fully outside each range.
    boundaries = {date_range.start, date_range.end + timedelta(days=1)}
    for start, end, _ in clipped_vacations + clipped_windows + clipped_assignments:
        boundaries.add(start)
        boundaries.add(end + timedelta(days=1))

    sorted_bounds = sorted(boundaries)
    segments = []
    for seg_start, seg_end_excl in zip(sorted_bounds, sorted_bounds[1:]):
        seg_end = seg_end_excl - timedelta(days=1)
        on_vacation = any(s <= seg_start and e >= seg_end for s, e, _ in clipped_vacations)
        active_windows = [ratio for s, e, ratio in clipped_windows if s <= seg_start and e >= seg_end]
        if on_vacation:
            ratio = 0.0
        elif active_windows:
            ratio = min(active_windows)
        else:
            active_assignments = [ratio for s, e, ratio in clipped_assignments if s <= seg_start and e >= seg_end]
            ratio = max(base_ratio - sum(active_assignments), 0.0)
        segments.append((seg_start, seg_end, ratio))

    return segments
