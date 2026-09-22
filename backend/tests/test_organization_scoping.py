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
from tests.conftest import create_org, register_and_login


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
def two_orgs(client):
    """Two managers, each owning their own organization."""
    a_headers = register_and_login(client, "a-owner@example.com")
    b_headers = register_and_login(client, "b-owner@example.com")
    a_org_id = create_org(client, a_headers, name="Org A")
    b_org_id = create_org(client, b_headers, name="Org B")
    orgs = {
        "a": {**a_headers, "X-Organization-Id": a_org_id},
        "b": {**b_headers, "X-Organization-Id": b_org_id},
    }
    # Person.role must reference an existing Role catalog entry, and
    # _person_payload()'s default role is used in both organizations below.
    for headers in orgs.values():
        client.post("/api/v1/roles/", json={"id": "Backend Developer"}, headers=headers)
    return orgs


# ── Non-member rejection ──────────────────────────────────────────────────────


def test_non_member_cannot_list_another_orgs_people(client, two_orgs):
    client.post("/api/v1/people/", json=_person_payload(), headers=two_orgs["a"])

    outsider_headers = {
        **two_orgs["b"],
        "X-Organization-Id": two_orgs["a"]["X-Organization-Id"],
    }
    response = client.get("/api/v1/people/", headers=outsider_headers)

    assert response.status_code == 403


def test_non_member_cannot_get_another_orgs_person(client, two_orgs):
    person = client.post(
        "/api/v1/people/", json=_person_payload(), headers=two_orgs["a"]
    ).json()

    outsider_headers = {
        **two_orgs["b"],
        "X-Organization-Id": two_orgs["a"]["X-Organization-Id"],
    }
    response = client.get(f"/api/v1/people/{person['id']}", headers=outsider_headers)

    assert response.status_code == 403


def test_unknown_organization_id_is_rejected_as_non_member(client, manager_headers):
    headers = {
        **manager_headers,
        "X-Organization-Id": "00000000-0000-0000-0000-000000000000",
    }
    response = client.get("/api/v1/people/", headers=headers)
    assert response.status_code == 403


# ── Cross-organization data isolation ─────────────────────────────────────────


def test_person_created_in_one_org_is_invisible_from_another(client, two_orgs):
    client.post("/api/v1/people/", json=_person_payload(), headers=two_orgs["a"])

    response = client.get("/api/v1/people/", headers=two_orgs["b"])

    assert response.status_code == 200
    assert response.json() == []


def test_get_person_by_id_scoped_to_organization_returns_404_across_orgs(
    client, two_orgs
):
    person = client.post(
        "/api/v1/people/", json=_person_payload(), headers=two_orgs["a"]
    ).json()

    response = client.get(f"/api/v1/people/{person['id']}", headers=two_orgs["b"])

    assert response.status_code == 404


def test_update_person_scoped_to_organization_returns_404_across_orgs(client, two_orgs):
    person = client.post(
        "/api/v1/people/", json=_person_payload(), headers=two_orgs["a"]
    ).json()

    response = client.put(
        f"/api/v1/people/{person['id']}",
        json=_person_payload(name="Hijacked"),
        headers=two_orgs["b"],
    )

    assert response.status_code == 404


def test_delete_person_scoped_to_organization_returns_404_across_orgs(client, two_orgs):
    person = client.post(
        "/api/v1/people/", json=_person_payload(), headers=two_orgs["a"]
    ).json()

    response = client.delete(f"/api/v1/people/{person['id']}", headers=two_orgs["b"])

    assert response.status_code == 404
    # Still visible/intact from the owning organization.
    assert (
        client.get(f"/api/v1/people/{person['id']}", headers=two_orgs["a"]).status_code
        == 200
    )


def test_role_ids_can_collide_across_organizations(client, two_orgs):
    response_a = client.post(
        "/api/v1/roles/", json={"id": "designer"}, headers=two_orgs["a"]
    )
    response_b = client.post(
        "/api/v1/roles/", json={"id": "designer"}, headers=two_orgs["b"]
    )

    assert response_a.status_code == 201
    assert response_b.status_code == 201


def test_project_created_in_one_org_is_invisible_from_another(client, two_orgs):
    client.post("/api/v1/projects/", json={"name": "Project X"}, headers=two_orgs["a"])

    response = client.get("/api/v1/projects/", headers=two_orgs["b"])

    assert response.status_code == 200
    assert response.json() == []


def test_assignment_created_in_one_org_is_invisible_from_another(client, two_orgs):
    client.post(
        "/api/v1/assignments/",
        json={
            "person_id": "person-1",
            "project_id": "project-1",
            "ratio": 1.0,
            "start": "2026-01-01",
            "end": "2026-01-31",
        },
        headers=two_orgs["a"],
    )

    response = client.get("/api/v1/assignments/", headers=two_orgs["b"])

    assert response.status_code == 200
    assert response.json() == []


def test_optimization_solve_cannot_see_another_orgs_project(client, two_orgs):
    project = client.post(
        "/api/v1/projects/", json={"name": "Project X"}, headers=two_orgs["a"]
    ).json()

    response = client.post(
        "/api/v1/optimization/solve",
        json={"project_id": project["id"]},
        headers=two_orgs["b"],
    )

    assert response.status_code == 404


def test_optimization_solve_only_draws_people_from_the_active_organization(
    client, two_orgs
):
    client.post("/api/v1/people/", json=_person_payload(), headers=two_orgs["b"])
    project = client.post(
        "/api/v1/projects/",
        json={"name": "Project X", "n_slots": 1},
        headers=two_orgs["a"],
    ).json()

    response = client.post(
        "/api/v1/optimization/solve",
        json={"project_id": project["id"]},
        headers=two_orgs["a"],
    )

    assert response.status_code == 200
    assert response.json()["members"] == []
