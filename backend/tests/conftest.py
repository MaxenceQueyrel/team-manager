import pytest
from fastapi.testclient import TestClient

from api.db.models import RefreshToken, Role, User, UserRole
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
    db.query(RefreshToken).delete()
    db.query(UserRole).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def register_and_login(
    client, email, password="hunter2pass", *, manager=False, person_id=None
) -> dict[str, str]:
    """Registers a user (optionally promoted to manager), logs in, and returns auth headers."""
    payload = {"email": email, "password": password}
    if person_id is not None:
        payload["person_id"] = person_id
    client.post("/api/v1/auth/register", json=payload)

    if manager:
        with SessionLocal() as db:
            user = db.query(User).filter(User.email == email).first()
            manager_role = db.query(Role).filter(Role.name == "manager").first()
            user.roles.append(manager_role)
            db.commit()

    response = client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def manager_headers(client):
    return register_and_login(client, "manager@example.com", manager=True)


@pytest.fixture
def employee_headers(client):
    return register_and_login(client, "employee@example.com")
