from typing import Optional
from pydantic import BaseModel, Field


class RoleRequirement(BaseModel):
    role: str
    seniority: Optional[str] = None
    count: int = Field(default=1, ge=1)


class SkillRequirement(BaseModel):
    skill_id: str
    min_level: float = Field(ge=0, le=5)


class ProjectBase(BaseModel):
    name: str
    description: str = ""
    required_fte: float = Field(ge=0)
    role_requirements: list[RoleRequirement] = []
    skill_requirements: list[SkillRequirement] = []
    excluded_person_ids: list[str] = []
    priority: str = "medium"  # low | medium | high | critical


class Project(ProjectBase):
    id: str


class ProjectCreate(ProjectBase):
    pass
