import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.assignment import Assignment
from api.models.person import Person
from api.models.project import Project
from api.models.role import Role as RoleCatalogEntry
from api.models.team import Team
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module
from api.v1 import people as people_module
from api.v1 import projects as projects_module
from api.v1 import roles as roles_module
from api.v1 import teams as teams_module
from optimizer.models import Seniority
from tests.conftest import register_and_login


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(people_module, "repo", FileRepository("people", Person))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    monkeypatch.setattr(teams_module, "repo", FileRepository("teams", Team))
    monkeypatch.setattr(roles_module, "repo", FileRepository("roles", RoleCatalogEntry))
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


# ── require_permission ───────────────────────────────────────────────────────


def test_create_person_without_auth_returns_401(client):
    response = client.post("/api/v1/people/", json=_person_payload())
    assert response.status_code == 401


def test_create_person_with_people_write_permission_succeeds(client, employee_headers):
    # Employees hold people:write per the seeded permission set.
    response = client.post(
        "/api/v1/people/", json=_person_payload(), headers=employee_headers
    )
    assert response.status_code == 201


def test_delete_person_without_people_delete_permission_returns_403(
    client, manager_headers, employee_headers
):
    created = client.post(
        "/api/v1/people/", json=_person_payload(), headers=manager_headers
    ).json()

    response = client.delete(
        f"/api/v1/people/{created['id']}", headers=employee_headers
    )
    assert response.status_code == 403


def test_delete_person_with_people_delete_permission_succeeds(client, manager_headers):
    created = client.post(
        "/api/v1/people/", json=_person_payload(), headers=manager_headers
    ).json()

    response = client.delete(f"/api/v1/people/{created['id']}", headers=manager_headers)
    assert response.status_code == 204


# ── require_self_or_manager ──────────────────────────────────────────────────


def test_employee_can_update_own_person_record(client, manager_headers):
    person = client.post(
        "/api/v1/people/", json=_person_payload(), headers=manager_headers
    ).json()
    owner_headers = register_and_login(
        client, "owner@example.com", person_id=person["id"]
    )

    response = client.put(
        f"/api/v1/people/{person['id']}",
        json=_person_payload(name="Alice M."),
        headers=owner_headers,
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Alice M."


def test_employee_cannot_update_someone_elses_person_record(client, manager_headers):
    person = client.post(
        "/api/v1/people/", json=_person_payload(), headers=manager_headers
    ).json()
    other_headers = register_and_login(
        client, "other@example.com", person_id="not-alice"
    )

    response = client.put(
        f"/api/v1/people/{person['id']}",
        json=_person_payload(name="Someone Else"),
        headers=other_headers,
    )

    assert response.status_code == 403


def test_manager_can_update_anyones_person_record(client, manager_headers):
    person = client.post(
        "/api/v1/people/", json=_person_payload(), headers=manager_headers
    ).json()

    response = client.put(
        f"/api/v1/people/{person['id']}",
        json=_person_payload(name="Updated By Manager"),
        headers=manager_headers,
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Updated By Manager"


# ── Person.manager_id ─────────────────────────────────────────────────────────


def test_person_manager_id_defaults_to_none(client, manager_headers):
    response = client.post(
        "/api/v1/people/", json=_person_payload(), headers=manager_headers
    )
    assert response.json()["manager_id"] is None


def test_person_manager_id_round_trips(client, manager_headers):
    manager_person = client.post(
        "/api/v1/people/",
        json=_person_payload(name="Manager Person"),
        headers=manager_headers,
    ).json()

    report = client.post(
        "/api/v1/people/",
        json=_person_payload(name="Report", manager_id=manager_person["id"]),
        headers=manager_headers,
    ).json()

    assert report["manager_id"] == manager_person["id"]


# ── Wiring smoke tests on other routers ──────────────────────────────────────


def test_project_create_requires_projects_write_permission(client, employee_headers):
    response = client.post(
        "/api/v1/projects/", json={"name": "Project X"}, headers=employee_headers
    )
    assert response.status_code == 403


def test_project_create_allowed_for_manager(client, manager_headers):
    response = client.post(
        "/api/v1/projects/", json={"name": "Project X"}, headers=manager_headers
    )
    assert response.status_code == 201


def test_team_delete_requires_teams_delete_permission(client, employee_headers):
    response = client.delete("/api/v1/teams/does-not-exist", headers=employee_headers)
    assert response.status_code == 403


def test_role_create_requires_roles_write_permission(client, employee_headers):
    response = client.post(
        "/api/v1/roles/", json={"id": "designer"}, headers=employee_headers
    )
    assert response.status_code == 403


def test_skill_create_requires_skills_write_permission(client, employee_headers):
    response = client.post(
        "/api/v1/skills/", json={"id": "python"}, headers=employee_headers
    )
    assert response.status_code == 403


def test_optimization_solve_requires_optimization_run_permission(
    client, employee_headers
):
    response = client.post(
        "/api/v1/optimization/solve",
        json={"project_id": "does-not-exist"},
        headers=employee_headers,
    )
    assert response.status_code == 403


def test_assignment_delete_requires_assignments_delete_permission(
    client, employee_headers
):
    response = client.delete(
        "/api/v1/assignments/does-not-exist", headers=employee_headers
    )
    assert response.status_code == 403
