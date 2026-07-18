from datetime import date

from pydantic import BaseModel, Field


class AssignmentBase(BaseModel):
    person_id: str
    project_id: str
    ratio: float = Field(ge=0, le=1, description="Fraction of FTE committed to the project.")
    start: date
    end: date
    phase_id: str | None = None


class Assignment(AssignmentBase):
    id: str


class AssignmentCreate(AssignmentBase):
    pass
