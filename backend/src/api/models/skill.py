from pydantic import BaseModel, Field


class Skill(BaseModel):
    id: str = Field(description="Identifier of the skill.")
    description: str = Field(default="", description="Description of the skill.")
