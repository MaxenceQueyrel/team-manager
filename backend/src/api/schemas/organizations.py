import uuid
from datetime import datetime

from pydantic import BaseModel


class OrganizationCreate(BaseModel):
    name: str


class OrganizationOut(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class OrganizationMembershipOut(OrganizationOut):
    role: str


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    role: str


class OrganizationDetail(OrganizationOut):
    members: list[MemberOut]


class MemberAdd(BaseModel):
    email: str
