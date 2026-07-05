from pydantic import BaseModel, Field


class Role(BaseModel):
    id: str = Field(description="Identifier of the role.")
    description: str = Field(default="", description="Description of the role.")


class RoleCreate(Role):
    pass
