from datetime import date
from typing import Self

from pydantic import BaseModel, model_validator
from optimizer.models import (
    DateRange,
    ProjectPhase,
    ProjectPriority,
    SkillRequirement,
    Squad,
)

MAX_START_CANDIDATES = 52


class ProjectBase(BaseModel):
    name: str
    description: str = ""
    skill_requirements: list[SkillRequirement] = []
    excluded_person_ids: list[str] = []
    included_person_ids: list[str] = []
    squads: list[Squad] = []
    date_ranges: list[DateRange] = []
    phases: list[ProjectPhase] = []
    priority: ProjectPriority = ProjectPriority.MEDIUM
    completed_at: date | None = None
    # Absolute earliest/latest allowed start; it bounds the start only, so the
    # project may end after start_window.end.
    start_window: DateRange | None = None

    @model_validator(mode="after")
    def _check_skill_requirements(self) -> Self:
        if self.phases:
            scopes = [(f"Phase '{p.id}'", p.skill_requirements) for p in self.phases]
        else:
            scopes = [("The project", self.skill_requirements)]
        for scope, requirements in scopes:
            if not requirements:
                raise ValueError(f"{scope} needs at least one skill requirement")
            skill_ids = [req.id for req in requirements]
            for skill_id in skill_ids:
                if skill_ids.count(skill_id) > 1:
                    raise ValueError(
                        f"{scope} requires skill '{skill_id}' more than once"
                    )
        return self

    @model_validator(mode="after")
    def _check_start_window(self) -> Self:
        window = self.start_window
        if window is None:
            return self
        if window.end < window.start:
            raise ValueError("Latest start must not be before earliest start")
        if not self.date_ranges and not any(p.date_range for p in self.phases):
            raise ValueError(
                "A flexible start needs at least one project or phase date range"
            )
        if (window.end - window.start).days // 7 + 1 > MAX_START_CANDIDATES:
            raise ValueError(
                f"A flexible start window can span at most {MAX_START_CANDIDATES} weekly starts"
            )
        return self


class Project(ProjectBase):
    id: str
    organization_id: str


class ProjectCreate(ProjectBase):
    pass
