"""
Domain types for the OR solver.
No HTTP, no database, no framework — plain Pydantic models only.
"""
from pydantic import BaseModel, Field


class SkillLevel(BaseModel):
    skill_id: str
    level: float = Field(ge=0, le=5)


class SkillRequirement(BaseModel):
    skill_id: str
    min_level: float = Field(ge=0, le=5)


class PersonInput(BaseModel):
    id: str
    years_of_experience: float = Field(ge=0)
    fte_capacity: float = Field(default=1.0, ge=0, le=1)
    skills: list[SkillLevel] = []
    growth_targets: list[str] = []           # skill_ids the person wants to learn
    affinities: dict[str, float] = {}        # person_id → score in [-5, +5]


class ProjectInput(BaseModel):
    id: str
    n_slots: int = Field(default=1, ge=1)    # how many people to assign
    skill_requirements: list[SkillRequirement] = []
    excluded_person_ids: list[str] = []


class AssignmentWeights(BaseModel):
    performance: float = Field(default=0.25, ge=0, le=1)  # skill fit + seniority
    chemistry: float = Field(default=0.25, ge=0, le=1)    # pairwise affinity
    growth: float = Field(default=0.25, ge=0, le=1)       # learning opportunities
    cost: float = Field(default=0.25, ge=0, le=1)         # avoid over-qualification


class AssignedMember(BaseModel):
    person_id: str
    fte_allocation: float = Field(ge=0, le=1)


class AssignmentResult(BaseModel):
    project_id: str
    members: list[AssignedMember]
    score: float
