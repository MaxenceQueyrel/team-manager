from pydantic import BaseModel, Field
from .skill import Skill


class SkillLevel(Skill):
    level: float = Field(ge=0, le=5, description="Proficiency level in the skill, from 0 to 5.")


class PersonBase(BaseModel):
    name: str
    role: str
    seniority: str  # junior | mid | senior | lead
    years_of_experience: float = Field(ge=0)
    fte_capacity: float = Field(default=1.0, ge=0, le=1)
    skills: list[SkillLevel] = []
    growth_targets: list[str] = []
    affinities: dict[str, float] = {}  # person_id → score (-5 to +5)


class Person(PersonBase):
    id: str


class PersonCreate(PersonBase):
    pass
