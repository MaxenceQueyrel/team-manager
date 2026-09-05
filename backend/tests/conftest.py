import pytest
from fastapi.testclient import TestClient

from api.db.models import (
    Organization,
    OrganizationMember,
    RefreshToken,
    User,
    UserRole,
)
from api.db.session import SessionLocal
from api.main import app


@pytest.fixture
def client():
    # https base_url so Secure cookies (refresh token) round-trip in httpx's jar.
    return TestClient(app, base_url="https://testserver")


@pytest.fixture(autouse=True)
def _cleanup_users():
    yield
    db = SessionLocal()
    db.query(OrganizationMember).delete()
    db.query(Organization).delete()
    db.query(RefreshToken).delete()
    db.query(UserRole).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def register_and_login(client, email, password="hunter2pass") -> dict[str, str]:
    """Registers a user (accounts are managers by default) and returns auth headers."""
    client.post(
        "/api/v1/auth/register", json={"email": email, "password": password}
    )
    response = client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _strip_roles(email):
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        user.roles.clear()
        db.commit()


@pytest.fixture
def manager_headers(client):
    return register_and_login(client, "manager@example.com")


@pytest.fixture
def unprivileged_headers(client):
    """Headers for a logged-in account holding no roles, to exercise permission-denied paths."""
    email = "unprivileged@example.com"
    headers = register_and_login(client, email)
    _strip_roles(email)
    return headers
