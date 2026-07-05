from pydantic import BaseModel, Field
from optimizer.models import SkillRequirement, ProjectPhase, DateRange, Squad


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


class Project(ProjectBase):
    id: str


class ProjectCreate(ProjectBase):
    pass
