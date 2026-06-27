from pydantic import BaseModel, Field
from optimizer.models import Seniority, SkillRequirement, ProjectPhase, DateRange, Squad


class RoleRequirement(BaseModel):
    role: str
    seniority: Seniority | None = None
    count: int = Field(default=1, ge=1)


class ProjectBase(BaseModel):
    name: str
    description: str = ""
    required_fte: float = Field(ge=0)
    role_requirements: list[RoleRequirement] = []
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
