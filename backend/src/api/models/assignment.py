from datetime import date

from pydantic import BaseModel, Field, field_validator
from optimizer.grid import ALLOCATION_STEP, GRID_TOLERANCE, STEPS_PER_FTE, is_on_grid


class AssignmentBase(BaseModel):
    person_id: str
    project_id: str
    ratio: float = Field(
        le=1,
        description="Fraction of FTE committed to the project, a multiple of 0.2 (one day per week).",
    )
    start: date
    end: date
    phase_id: str | None = None

    @field_validator("ratio")
    @classmethod
    def _check_ratio_on_grid(cls, ratio: float) -> float:
        if ratio < ALLOCATION_STEP - GRID_TOLERANCE or not is_on_grid(ratio):
            raise ValueError(
                "Allocation must be a multiple of 20% (one day per week), from 20% to 100%"
            )
        return round(ratio * STEPS_PER_FTE) / STEPS_PER_FTE


class Assignment(AssignmentBase):
    id: str
    organization_id: str


class AssignmentCreate(AssignmentBase):
    pass
