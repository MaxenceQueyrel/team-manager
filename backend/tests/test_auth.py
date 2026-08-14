import subprocess
import sys
from pathlib import Path

from api.db.models import Role, User
from api.db.session import SessionLocal

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _run_bootstrap_manager(email):
    # sys.executable is already the venv interpreter pytest is running under,
    # which has `api` installed editable — no PYTHONPATH juggling needed.
    return subprocess.run(
        [sys.executable, "scripts/bootstrap_manager.py", email],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )


def _register(client, email="alice@example.com", password="hunter2pass", **overrides):
    payload = {"email": email, "password": password, **overrides}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    return response.json()


def _promote_to_manager(email):
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        manager_role = db.query(Role).filter(Role.name == "manager").first()
        assert user is not None
        assert manager_role is not None
        user.roles.append(manager_role)
        db.commit()


def test_register_creates_user_with_employee_role(client):
    body = _register(client)

    assert body["email"] == "alice@example.com"
    assert body["is_active"] is True
    assert "password" not in body

    with SessionLocal() as db:
        user = db.query(User).filter(User.email == "alice@example.com").first()
        assert user is not None
        assert [role.name for role in user.roles] == ["employee"]
        assert user.hashed_password != "hunter2pass"


def test_register_duplicate_email_returns_409(client):
    _register(client)
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "alice@example.com", "password": "anotherpass1"},
    )
    assert response.status_code == 409


def test_login_wrong_password_returns_401(client):
    _register(client)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "alice@example.com", "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_login_success_returns_access_token_and_refresh_cookie(client):
    _register(client)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "alice@example.com", "password": "hunter2pass"},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]
    assert client.cookies.get("refresh_token") is not None


def test_me_returns_current_user_with_roles_and_permissions(client):
    _register(client)
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "alice@example.com", "password": "hunter2pass"},
    )
    access_token = login_response.json()["access_token"]

    response = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "alice@example.com"
    assert body["roles"] == ["employee"]
    assert "people:read" in body["permissions"]


def test_me_without_token_returns_401(client):
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_refresh_rotates_token_and_revokes_the_old_one(client):
    _register(client)
    client.post(
        "/api/v1/auth/login",
        json={"email": "alice@example.com", "password": "hunter2pass"},
    )
    old_refresh_cookie = client.cookies.get("refresh_token")

    response = client.post("/api/v1/auth/refresh")

    assert response.status_code == 200
    assert response.json()["access_token"]
    new_refresh_cookie = client.cookies.get("refresh_token")
    assert new_refresh_cookie != old_refresh_cookie

    # Replaying the rotated-out cookie must fail.
    client.cookies.set("refresh_token", old_refresh_cookie)
    replay_response = client.post("/api/v1/auth/refresh")
    assert replay_response.status_code == 401


def test_refresh_without_cookie_returns_401(client):
    response = client.post("/api/v1/auth/refresh")
    assert response.status_code == 401


def test_logout_revokes_refresh_token(client):
    _register(client)
    client.post(
        "/api/v1/auth/login",
        json={"email": "alice@example.com", "password": "hunter2pass"},
    )
    issued_refresh_cookie = client.cookies.get("refresh_token")

    logout_response = client.post("/api/v1/auth/logout")
    assert logout_response.status_code == 204

    # Re-present the token that was valid at login time — logout must have
    # revoked it server-side, regardless of what the client's cookie jar did.
    client.cookies.set("refresh_token", issued_refresh_cookie)
    refresh_response = client.post("/api/v1/auth/refresh")
    assert refresh_response.status_code == 401


def test_users_list_requires_manager_role(client):
    _register(client)
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "alice@example.com", "password": "hunter2pass"},
    )
    access_token = login_response.json()["access_token"]

    response = client.get(
        "/api/v1/auth/users", headers={"Authorization": f"Bearer {access_token}"}
    )

    assert response.status_code == 403


def test_manager_can_list_users_and_grant_roles(client):
    manager = _register(client, email="manager@example.com")
    _promote_to_manager("manager@example.com")
    employee = _register(client, email="bob@example.com", password="anotherpass1")

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "manager@example.com", "password": "hunter2pass"},
    )
    access_token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    list_response = client.get("/api/v1/auth/users", headers=headers)
    assert list_response.status_code == 200
    emails = {user["email"] for user in list_response.json()}
    assert emails == {"manager@example.com", "bob@example.com"}

    grant_response = client.post(
        f"/api/v1/auth/users/{employee['id']}/roles",
        json={"role": "manager", "grant": True},
        headers=headers,
    )
    assert grant_response.status_code == 200

    with SessionLocal() as db:
        user = db.query(User).filter(User.email == "bob@example.com").first()
        assert user is not None
        assert {role.name for role in user.roles} == {"employee", "manager"}

    revoke_response = client.post(
        f"/api/v1/auth/users/{employee['id']}/roles",
        json={"role": "manager", "grant": False},
        headers=headers,
    )
    assert revoke_response.status_code == 200

    with SessionLocal() as db:
        user = db.query(User).filter(User.email == "bob@example.com").first()
        assert user is not None
        assert {role.name for role in user.roles} == {"employee"}

    assert manager["email"] == "manager@example.com"


def test_bootstrap_manager_script_promotes_registered_user(client):
    _register(client, email="first-admin@example.com")

    result = _run_bootstrap_manager("first-admin@example.com")

    assert result.returncode == 0, result.stderr
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == "first-admin@example.com").first()
        assert user is not None
        assert "manager" in {role.name for role in user.roles}


def test_bootstrap_manager_script_fails_for_unknown_email():
    result = _run_bootstrap_manager("nobody@example.com")

    assert result.returncode != 0
    assert "no user found" in result.stderr.lower()
