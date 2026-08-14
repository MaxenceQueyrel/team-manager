import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.core import security
from api.core.config import get_configs
from api.core.deps import get_current_user, require_manager
from api.db.models import RefreshToken, Role, User
from api.db.session import get_db
from api.schemas.auth import (
    AccessToken,
    RoleAssignment,
    UserLogin,
    UserMeOut,
    UserOut,
    UserRegister,
)

router = APIRouter()
settings = get_configs()

REFRESH_COOKIE_NAME = "refresh_token"


def _issue_tokens(user: User, db: Session, response: Response) -> AccessToken:
    refresh_token = security.generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=security.hash_refresh_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_ttl_days),
        )
    )
    db.commit()

    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.refresh_ttl_days * 24 * 60 * 60,
    )
    return AccessToken(access_token=security.create_access_token(user.id))


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: UserRegister, db: Session = Depends(get_db)):
    existing = db.execute(
        select(User).where(User.email == data.email)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    employee_role = db.execute(
        select(Role).where(Role.name == "employee")
    ).scalar_one_or_none()
    if employee_role is None:
        raise HTTPException(status_code=500, detail="Default role not seeded")

    user = User(
        email=data.email,
        hashed_password=security.hash_password(data.password),
        person_id=data.person_id,
        roles=[employee_role],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=AccessToken)
def login(data: UserLogin, response: Response, db: Session = Depends(get_db)):
    user = db.execute(
        select(User).where(User.email == data.email)
    ).scalar_one_or_none()
    if user is None or not security.verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    return _issue_tokens(user, db, response)


@router.post("/refresh", response_model=AccessToken)
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
):
    invalid_token_error = HTTPException(status_code=401, detail="Invalid refresh token")
    if refresh_token is None:
        raise invalid_token_error

    token_hash = security.hash_refresh_token(refresh_token)
    stored = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()
    if (
        stored is None
        or stored.revoked_at is not None
        or stored.expires_at < datetime.now(UTC)
    ):
        raise invalid_token_error

    # Rotate: revoke the presented token so it can't be replayed even if leaked.
    stored.revoked_at = datetime.now(UTC)
    db.add(stored)

    user = db.get(User, stored.user_id)
    if user is None or not user.is_active:
        db.commit()
        raise invalid_token_error

    return _issue_tokens(user, db, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
):
    if refresh_token is not None:
        token_hash = security.hash_refresh_token(refresh_token)
        stored = db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        ).scalar_one_or_none()
        if stored is not None and stored.revoked_at is None:
            stored.revoked_at = datetime.now(UTC)
            db.add(stored)
            db.commit()
    response.delete_cookie(REFRESH_COOKIE_NAME)


@router.get("/me", response_model=UserMeOut)
def me(current_user: User = Depends(get_current_user)):
    return UserMeOut(
        id=current_user.id,
        email=current_user.email,
        is_active=current_user.is_active,
        person_id=current_user.person_id,
        roles=[role.name for role in current_user.roles],
        permissions=sorted(
            {
                permission.code
                for role in current_user.roles
                for permission in role.permissions
            }
        ),
    )


@router.get(
    "/users",
    response_model=list[UserOut],
    dependencies=[Depends(require_manager)],
)
def list_users(db: Session = Depends(get_db)):
    return db.execute(select(User)).scalars().all()


@router.post("/users/{user_id}/roles", response_model=UserOut)
def set_user_role(
    user_id: uuid.UUID,
    data: RoleAssignment,
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    role = db.execute(select(Role).where(Role.name == data.role)).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    if data.grant and role not in user.roles:
        user.roles.append(role)
    elif not data.grant and role in user.roles:
        user.roles.remove(role)

    db.commit()
    db.refresh(user)
    return user
