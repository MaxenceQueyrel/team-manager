import uuid

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from api.core.security import decode_access_token
from api.db.models import OrganizationMember, Role, User
from api.db.session import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login", auto_error=False)

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str | None = Depends(oauth2_scheme), db: Session = Depends(dependency=get_db)
) -> User:
    """Decodes the access token and loads the user + roles + permissions fresh from Postgres.

    Re-reading from the database on every request (rather than trusting
    claims embedded in the JWT) keeps role/permission changes effective
    immediately, at the cost of one cheap local DB call per request.

    Raises:
        HTTPException: 401 if the token is missing, invalid, expired, or the user is gone/inactive.
    """
    if token is None:
        raise _credentials_error
    try:
        user_id = decode_access_token(token)
    except (jwt.PyJWTError, ValueError):
        raise _credentials_error from None

    user = (
        db.execute(
            select(User)
            .options(joinedload(User.roles).joinedload(Role.permissions))
            .where(User.id == user_id)
        )
        .unique()
        .scalar_one_or_none()
    )
    if user is None or not user.is_active:
        raise _credentials_error
    return user


def require_manager(user: User = Depends(get_current_user)) -> User:
    if "manager" not in {role.name for role in user.roles}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Manager role required"
        )
    return user


def require_org_member(
    x_organization_id: str = Header(
        description="Id of the organization to scope this request's data to."
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    """Validates that the caller belongs to the organization named by X-Organization-Id.

    Used on people/roles/skills/projects/assignments/teams endpoints, where
    membership (owner or contributor) implies full read/write access to that
    organization's data.

    Returns:
        The organization id, for scoping FileRepository reads and writes.

    Raises:
        HTTPException: 400 if the header isn't a valid UUID, 403 if the caller has
            no OrganizationMember row for it.
    """
    try:
        organization_id = uuid.UUID(x_organization_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header must be a valid UUID",
        ) from None

    membership = db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user.id,
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )
    return str(organization_id)


def require_permission(code: str):
    """Builds a dependency that requires the current user to hold permission `code`.

    Usable as `Depends(require_permission("people:write"))`.

    Only "optimization:run" is still wired to a route — require_org_member now
    covers people/roles/skills/projects/assignments/teams, so their `*:write`,
    `*:delete` codes (and the seeded rows granting them) are unreferenced.
    Left in place rather than migrated away, matching the pre-existing `*:read`
    codes that were never wired to a route either.
    """

    def dependency(user: User = Depends(get_current_user)) -> User:
        permission_codes = {
            permission.code for role in user.roles for permission in role.permissions
        }
        if code not in permission_codes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission: {code}",
            )
        return user

    return dependency
