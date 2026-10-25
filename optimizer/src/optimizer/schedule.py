from datetime import date, timedelta

from optimizer.models import DateRange, ProjectInput


def schedule_anchor(project: ProjectInput) -> date | None:
    """Returns the date a project's schedule is anchored on when it is shifted.

    Args:
        project: The project whose top-level and phase date ranges are inspected.

    Returns:
        The earliest start across project.date_ranges and every phase's date_range,
        or None if the project has no dates at all.
    """
    starts = [r.start for r in project.date_ranges]
    starts += [phase.date_range.start for phase in project.phases if phase.date_range]
    return min(starts, default=None)


def shift_project(project: ProjectInput, offset: timedelta) -> ProjectInput:
    """Moves a project's whole schedule by a fixed offset, keeping durations and gaps.

    Args:
        project: The project to shift.
        offset: How far to move every top-level and phase date range.

    Returns:
        A copy of the project whose date ranges, including each phase's, are moved by
        offset. Phases without a date range are left as they are.
    """
    phases = [
        phase.model_copy(update={"date_range": _shift(phase.date_range, offset)}) if phase.date_range else phase
        for phase in project.phases
    ]
    return project.model_copy(
        update={"date_ranges": [_shift(r, offset) for r in project.date_ranges], "phases": phases}
    )


def _shift(date_range: DateRange, offset: timedelta) -> DateRange:
    return DateRange(start=date_range.start + offset, end=date_range.end + offset)
