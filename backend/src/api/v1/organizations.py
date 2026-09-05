import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from api.core.deps import get_current_user
from api.db.models import Organization, OrganizationMember, User
from api.db.session import get_db
from api.schemas.organizations import (
    MemberAdd,
    MemberOut,
    OrganizationCreate,
    OrganizationDetail,
    OrganizationMembershipOut,
    OrganizationOut,
)

router = APIRouter()

OWNER = "owner"
CONTRIBUTOR = "contributor"


def _get_membership(
    organization_id: uuid.UUID, user_id: uuid.UUID, db: Session
) -> OrganizationMember | None:
    return db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user_id,
        )
    ).scalar_one_or_none()


def require_org_member(
    organization_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Organization:
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    if _get_membership(organization_id, current_user.id, db) is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )
    return organization


def require_org_owner(
    organization_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Organization:
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    membership = _get_membership(organization_id, current_user.id, db)
    if membership is None or membership.role != OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Owner role required"
        )
    return organization


@router.post("/", response_model=OrganizationOut, status_code=status.HTTP_201_CREATED)
def create_organization(
    data: OrganizationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organization = Organization(name=data.name)
    db.add(organization)
    db.flush()
    db.add(
        OrganizationMember(
            organization_id=organization.id, user_id=current_user.id, role=OWNER
        )
    )
    db.commit()
    db.refresh(organization)
    return organization


@router.get("/", response_model=list[OrganizationMembershipOut])
def list_organizations(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    rows = db.execute(
        select(Organization, OrganizationMember.role)
        .join(
            OrganizationMember, OrganizationMember.organization_id == Organization.id
        )
        .where(OrganizationMember.user_id == current_user.id)
    ).all()
    return [
        OrganizationMembershipOut(
            id=organization.id,
            name=organization.name,
            created_at=organization.created_at,
            role=role,
        )
        for organization, role in rows
    ]


@router.get("/{organization_id}", response_model=OrganizationDetail)
def get_organization(
    organization: Organization = Depends(require_org_member),
    db: Session = Depends(get_db),
):
    members = (
        db.execute(
            select(OrganizationMember)
            .options(joinedload(OrganizationMember.user))
            .where(OrganizationMember.organization_id == organization.id)
        )
        .scalars()
        .all()
    )
    return OrganizationDetail(
        id=organization.id,
        name=organization.name,
        created_at=organization.created_at,
        members=[
            MemberOut(user_id=m.user_id, email=m.user.email, role=m.role)
            for m in members
        ],
    )


@router.delete("/{organization_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization(
    organization: Organization = Depends(require_org_owner),
    db: Session = Depends(get_db),
):
    db.execute(
        delete(OrganizationMember).where(
            OrganizationMember.organization_id == organization.id
        )
    )
    db.delete(organization)
    db.commit()


@router.post(
    "/{organization_id}/members",
    response_model=MemberOut,
    status_code=status.HTTP_201_CREATED,
)
def add_member(
    data: MemberAdd,
    organization: Organization = Depends(require_org_owner),
    db: Session = Depends(get_db),
):
    user = db.execute(
        select(User).where(User.email == data.email)
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if _get_membership(organization.id, user.id, db) is not None:
        raise HTTPException(status_code=409, detail="User is already a member")

    db.add(
        OrganizationMember(
            organization_id=organization.id, user_id=user.id, role=CONTRIBUTOR
        )
    )
    db.commit()
    return MemberOut(user_id=user.id, email=user.email, role=CONTRIBUTOR)


@router.delete(
    "/{organization_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_member(
    user_id: uuid.UUID,
    organization: Organization = Depends(require_org_owner),
    db: Session = Depends(get_db),
):
    membership = _get_membership(organization.id, user_id, db)
    if membership is None:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(membership)
    db.commit()
