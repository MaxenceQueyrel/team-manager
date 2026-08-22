import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from api.core.security import decode_access_token
from api.db.models import Role, User
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


def require_permission(code: str):
    """Builds a dependency that requires the current user to hold permission `code`.

    Usable as `Depends(require_permission("people:write"))`.
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


def require_self_or_manager(
    person_id: str, user: User = Depends(get_current_user)
) -> User:
    """Allows a request through if it targets the caller's own Person record or the caller is a manager.

    `person_id` is taken from the path parameter of the same name, so this
    can be used directly as `Depends(require_self_or_manager)` on any route
    shaped like `/{person_id}`.
    """
    is_own_record = user.person_id is not None and user.person_id == person_id
    is_manager = "manager" in {role.name for role in user.roles}
    if not (is_own_record or is_manager):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized for this person's record",
        )
    return user
