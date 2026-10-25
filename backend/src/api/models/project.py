from datetime import date
from typing import Self

from pydantic import BaseModel, Field, model_validator
from optimizer.models import SkillRequirement, ProjectPhase, DateRange, Squad

MAX_START_CANDIDATES = 52


class ProjectBase(BaseModel):
    name: str
    description: str = ""
    n_slots: int = Field(default=1, ge=1)
    skill_requirements: list[SkillRequirement] = []
    excluded_person_ids: list[str] = []
    included_person_ids: list[str] = []
    squads: list[Squad] = []
    date_ranges: list[DateRange] = []
    phases: list[ProjectPhase] = []
    priority: str = "medium"
    completed_at: date | None = None
    # Absolute earliest/latest allowed start; it bounds the start only, so the
    # project may end after start_window.end.
    start_window: DateRange | None = None

    @model_validator(mode="after")
    def _check_start_window(self) -> Self:
        window = self.start_window
        if window is None:
            return self
        if window.end < window.start:
            raise ValueError("start_window end must not be before its start")
        if not self.date_ranges and not any(p.date_range for p in self.phases):
            raise ValueError(
                "start_window requires at least one project or phase date range"
            )
        if (window.end - window.start).days // 7 + 1 > MAX_START_CANDIDATES:
            raise ValueError(
                f"start_window allows at most {MAX_START_CANDIDATES} weekly start candidates"
            )
        return self


class Project(ProjectBase):
    id: str
    organization_id: str


class ProjectCreate(ProjectBase):
    pass
