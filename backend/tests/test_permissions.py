import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.assignment import Assignment
from api.models.person import Person
from api.models.project import Project
from api.models.role import Role as RoleCatalogEntry
from api.models.skill import Skill
from api.models.team import Team
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module
from api.v1 import people as people_module
from api.v1 import projects as projects_module
from api.v1 import roles as roles_module
from api.v1 import skills as skills_module
from api.v1 import teams as teams_module
from optimizer.models import Seniority


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(people_module, "repo", FileRepository("people", Person))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    monkeypatch.setattr(teams_module, "repo", FileRepository("teams", Team))
    monkeypatch.setattr(roles_module, "repo", FileRepository("roles", RoleCatalogEntry))
    monkeypatch.setattr(skills_module, "repo", FileRepository("skills", Skill))
    monkeypatch.setattr(
        assignments_module, "repo", FileRepository("assignments", Assignment)
    )
    return TestClient(app)


def _person_payload(**overrides):
    return {
        "name": "Alice Martin",
        "role": "Backend Developer",
        "seniority": Seniority.SENIOR,
        "years_of_experience": 8.0,
        "fte_capacity": 1.0,
        **overrides,
    }


@pytest.fixture
def org_headers(client, org_headers):
    """Person.role must reference an existing Role catalog entry."""
    client.post("/api/v1/roles/", json={"id": "Backend Developer"}, headers=org_headers)
    return org_headers


# ── require_org_member (membership, not RBAC, gates people/roles/skills/…) ──


def test_create_person_without_auth_returns_401(client):
    response = client.post("/api/v1/people/", json=_person_payload())
    assert response.status_code == 401


def test_create_person_without_organization_header_returns_422(client, org_headers):
    headers = {"Authorization": org_headers["Authorization"]}
    response = client.post("/api/v1/people/", json=_person_payload(), headers=headers)
    assert response.status_code == 422


def test_delete_person_by_org_member_succeeds(client, org_headers):
    created = client.post(
        "/api/v1/people/", json=_person_payload(), headers=org_headers
    ).json()

    response = client.delete(f"/api/v1/people/{created['id']}", headers=org_headers)
    assert response.status_code == 204


# ── Person.role must reference an existing Role catalog entry ─────────────────


def test_create_person_with_unknown_role_returns_400(client, org_headers):
    response = client.post(
        "/api/v1/people/",
        json=_person_payload(role="Ghost Role"),
        headers=org_headers,
    )
    assert response.status_code == 400
    assert "Ghost Role" in response.json()["detail"]


def test_update_person_with_unknown_role_returns_400(client, org_headers):
    created = client.post(
        "/api/v1/people/", json=_person_payload(), headers=org_headers
    ).json()

    response = client.put(
        f"/api/v1/people/{created['id']}",
        json=_person_payload(role="Ghost Role"),
        headers=org_headers,
    )
    assert response.status_code == 400
    assert "Ghost Role" in response.json()["detail"]


# ── Person.manager_id ─────────────────────────────────────────────────────────


def test_person_manager_id_defaults_to_none(client, org_headers):
    response = client.post(
        "/api/v1/people/", json=_person_payload(), headers=org_headers
    )
    assert response.json()["manager_id"] is None


def test_person_manager_id_round_trips(client, org_headers):
    manager_person = client.post(
        "/api/v1/people/",
        json=_person_payload(name="Manager Person"),
        headers=org_headers,
    ).json()

    report = client.post(
        "/api/v1/people/",
        json=_person_payload(name="Report", manager_id=manager_person["id"]),
        headers=org_headers,
    ).json()

    assert report["manager_id"] == manager_person["id"]


# ── Wiring smoke tests on other routers ──────────────────────────────────────


def test_project_create_requires_organization_membership(client, org_headers):
    outsider_headers = {"Authorization": org_headers["Authorization"]}
    response = client.post(
        "/api/v1/projects/", json={"name": "Project X"}, headers=outsider_headers
    )
    assert response.status_code == 422


def test_project_create_allowed_for_org_member(client, org_headers):
    response = client.post(
        "/api/v1/projects/", json={"name": "Project X"}, headers=org_headers
    )
    assert response.status_code == 201


def test_team_delete_requires_organization_membership(client, org_headers):
    headers = {"Authorization": org_headers["Authorization"]}
    response = client.delete("/api/v1/teams/does-not-exist", headers=headers)
    assert response.status_code == 422


def test_role_create_allowed_for_org_member(client, org_headers):
    response = client.post(
        "/api/v1/roles/", json={"id": "designer"}, headers=org_headers
    )
    assert response.status_code == 201


def test_skill_create_allowed_for_org_member(client, org_headers):
    response = client.post(
        "/api/v1/skills/", json={"id": "python"}, headers=org_headers
    )
    assert response.status_code == 201


def test_optimization_solve_requires_optimization_run_permission(
    client, org_headers, unprivileged_headers
):
    # unprivileged_headers's user needs org membership too, so the 403 below
    # is proven to come from the missing RBAC permission, not from being a
    # non-member of the organization.
    client.post(
        f"/api/v1/organizations/{org_headers['X-Organization-Id']}/members",
        json={"email": "unprivileged@example.com"},
        headers=org_headers,
    )
    headers = {
        **unprivileged_headers,
        "X-Organization-Id": org_headers["X-Organization-Id"],
    }
    response = client.post(
        "/api/v1/optimization/solve",
        json={"project_id": "does-not-exist"},
        headers=headers,
    )
    assert response.status_code == 403


def test_optimization_solve_requires_organization_membership(client, manager_headers):
    response = client.post(
        "/api/v1/optimization/solve",
        json={"project_id": "does-not-exist"},
        headers=manager_headers,
    )
    assert response.status_code == 422


def test_assignment_delete_requires_organization_membership(client, org_headers):
    headers = {"Authorization": org_headers["Authorization"]}
    response = client.delete("/api/v1/assignments/does-not-exist", headers=headers)
    assert response.status_code == 422
