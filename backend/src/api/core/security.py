import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from api.core.config import get_configs

settings = get_configs()
_password_hasher = PasswordHash.recommended()

JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return _password_hasher.verify(password, hashed_password)


def create_access_token(user_id: uuid.UUID) -> str:
    """Signs a short-lived JWT carrying only the user id.

    No roles/permissions in the payload: a role change takes effect on the
    next request instead of waiting out a stale token, since
    `get_current_user` re-reads them from Postgres on every call.
    """
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.jwt_access_ttl_minutes)
    payload = {"sub": str(user_id), "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> uuid.UUID:
    """Decodes and validates an access token, returning the embedded user id.

    Raises:
        jwt.PyJWTError: If the token is expired, malformed, or has a bad signature.
        ValueError: If the `sub` claim isn't a valid UUID.
    """
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
    return uuid.UUID(payload["sub"])


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    # Refresh tokens are opaque, high-entropy random strings rather than
    # user-chosen secrets, so a fast deterministic hash (unlike argon2 for
    # passwords) is sufficient — offline brute-forcing isn't a concern.
    return hashlib.sha256(token.encode()).hexdigest()
