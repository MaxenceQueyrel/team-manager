from datetime import date

from pydantic import BaseModel, Field


class DateRange(BaseModel):
    start: date
    end: date


class AvailabilityWindow(DateRange):
    ratio: float = Field(ge=0, le=1)
