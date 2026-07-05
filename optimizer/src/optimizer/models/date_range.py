from datetime import date

from pydantic import BaseModel, Field


class DateRange(BaseModel):
    start: date = Field(description="Start date of the range, inclusive.")
    end: date = Field(description="End date of the range, inclusive.")


class AvailabilityWindow(DateRange):
    ratio: float = Field(
        ge=0, le=1, description="Fraction of FTE available during this window, overriding fte_capacity."
    )
