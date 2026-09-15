from pydantic import BaseModel, Field


class RoleBase(BaseModel):
    id: str = Field(description="Identifier of the role.")
    description: str = Field(default="", description="Description of the role.")


class Role(RoleBase):
    organization_id: str


class RoleCreate(RoleBase):
    pass
