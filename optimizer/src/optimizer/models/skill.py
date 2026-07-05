from pydantic import BaseModel, Field


class Skill(BaseModel):
    id: str = Field(description="Identifier of the skill.")
    description: str = Field(default="", description="Description of the skill.")


class SkillLevel(Skill):
    level: float = Field(ge=0, le=5, description="Proficiency level in the skill, from 0 to 5.")


class SkillRequirement(Skill):
    min_level: float = Field(ge=0, le=5, description="Minimum proficiency level required, from 0 to 5.")
