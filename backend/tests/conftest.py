import pytest
from fastapi.testclient import TestClient

from api.db.models import RefreshToken, User, UserRole
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
