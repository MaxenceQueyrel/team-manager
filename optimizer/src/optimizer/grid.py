import math

STEPS_PER_FTE = 5  # one step is one working day per week
ALLOCATION_STEP = 1 / STEPS_PER_FTE
GRID_TOLERANCE = 1e-6  # absorbs float round-off, e.g. 3 * 0.2 == 0.6000000000000001


def floor_to_steps(ratio: float) -> int:
    """Converts an FTE ratio to the whole number of allocation steps it holds.

    Args:
        ratio: FTE ratio, e.g. a person's availability.

    Returns:
        The number of ALLOCATION_STEP increments (days per week) that fit in ratio,
        rounded down: 0.87 gives 4, 0.19 gives 0.
    """
    return math.floor(ratio * STEPS_PER_FTE + GRID_TOLERANCE)


def floor_to_grid(ratio: float) -> float:
    """Rounds an FTE ratio down to the allocation grid.

    Args:
        ratio: FTE ratio, e.g. a person's availability.

    Returns:
        The largest multiple of ALLOCATION_STEP not above ratio: 0.87 gives 0.8, 0.5 gives 0.4.
    """
    return floor_to_steps(ratio) / STEPS_PER_FTE


def is_on_grid(ratio: float) -> bool:
    """Tells whether an FTE ratio is a whole number of allocation steps.

    Args:
        ratio: FTE ratio to check, e.g. a skill need or a stored allocation.

    Returns:
        True if ratio is a multiple of ALLOCATION_STEP, up to float round-off.
    """
    steps = ratio * STEPS_PER_FTE
    return abs(steps - round(steps)) < GRID_TOLERANCE
