import uuid

from pydantic import BaseModel, Field


class UserRegister(BaseModel):
    email: str
    password: str = Field(min_length=8)
    person_id: str | None = None


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    is_active: bool
    person_id: str | None

    model_config = {"from_attributes": True}


class UserMeOut(UserOut):
    roles: list[str]
    permissions: list[str]


class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RoleAssignment(BaseModel):
    role: str
    grant: bool = True
