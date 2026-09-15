from pydantic import BaseModel, Field


class SkillBase(BaseModel):
    id: str = Field(description="Identifier of the skill.")
    description: str = Field(default="", description="Description of the skill.")


class Skill(SkillBase):
    organization_id: str


class SkillCreate(SkillBase):
    pass
