import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class OrganizationCreate(BaseModel):
    name: str


class OrganizationUpdate(BaseModel):
    name: str


class OrganizationOut(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class OrganizationMembershipOut(OrganizationOut):
    role: str
    member_count: int


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    role: str


class OrganizationDetail(OrganizationOut):
    members: list[MemberOut]


class MemberAdd(BaseModel):
    email: str
    role: Literal["owner", "contributor"] = "contributor"
