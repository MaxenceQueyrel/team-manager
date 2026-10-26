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
from tests.conftest import ONE_FTE_NEED, register_and_login


@pytest.fixture
def isolated_client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(people_module, "repo", FileRepository("people", Person))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    monkeypatch.setattr(teams_module, "repo", FileRepository("teams", Team))
    monkeypatch.setattr(roles_module, "repo", FileRepository("roles", RoleCatalogEntry))
    monkeypatch.setattr(skills_module, "repo", FileRepository("skills", Skill))
    monkeypatch.setattr(
        assignments_module, "repo", FileRepository("assignments", Assignment)
    )
    return TestClient(app, base_url="https://testserver")


def _create_org(client, headers, name="Acme Corp"):
    response = client.post(
        "/api/v1/organizations/", json={"name": name}, headers=headers
    )
    assert response.status_code == 201
    return response.json()


def test_create_organization_makes_creator_the_owner(client, manager_headers):
    org = _create_org(client, manager_headers)

    assert org["name"] == "Acme Corp"

    list_response = client.get("/api/v1/organizations/", headers=manager_headers)
    assert list_response.status_code == 200
    memberships = list_response.json()
    assert len(memberships) == 1
    assert memberships[0]["id"] == org["id"]
    assert memberships[0]["role"] == "owner"
    assert memberships[0]["member_count"] == 1


def test_list_organizations_only_returns_current_users_memberships(client):
    owner_headers = register_and_login(client, "owner@example.com")
    other_headers = register_and_login(client, "other@example.com")
    _create_org(client, owner_headers)

    response = client.get("/api/v1/organizations/", headers=other_headers)

    assert response.status_code == 200
    assert response.json() == []


def test_get_organization_detail_includes_members(client, manager_headers):
    org = _create_org(client, manager_headers)

    response = client.get(f"/api/v1/organizations/{org['id']}", headers=manager_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Acme Corp"
    assert [m["email"] for m in body["members"]] == ["manager@example.com"]
    assert body["members"][0]["role"] == "owner"


def test_get_organization_detail_denied_for_non_member(client):
    owner_headers = register_and_login(client, "owner@example.com")
    other_headers = register_and_login(client, "other@example.com")
    org = _create_org(client, owner_headers)

    response = client.get(f"/api/v1/organizations/{org['id']}", headers=other_headers)

    assert response.status_code == 403


def test_get_organization_detail_returns_404_for_unknown_id(client, manager_headers):
    response = client.get(
        "/api/v1/organizations/00000000-0000-0000-0000-000000000000",
        headers=manager_headers,
    )
    assert response.status_code == 404


def test_add_member_by_email_makes_them_a_contributor(client):
    owner_headers = register_and_login(client, "owner@example.com")
    register_and_login(client, "contributor@example.com")
    org = _create_org(client, owner_headers)

    response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )

    assert response.status_code == 201
    assert response.json()["role"] == "contributor"

    detail = client.get(
        f"/api/v1/organizations/{org['id']}", headers=owner_headers
    ).json()
    assert {m["email"] for m in detail["members"]} == {
        "owner@example.com",
        "contributor@example.com",
    }


def test_add_member_requires_owner_role(client):
    owner_headers = register_and_login(client, "owner@example.com")
    contributor_headers = register_and_login(client, "contributor@example.com")
    register_and_login(client, "third@example.com")
    org = _create_org(client, owner_headers)
    client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )

    response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "third@example.com"},
        headers=contributor_headers,
    )

    assert response.status_code == 403


def test_add_member_with_unknown_email_returns_404(client, manager_headers):
    org = _create_org(client, manager_headers)

    response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "nobody@example.com"},
        headers=manager_headers,
    )

    assert response.status_code == 404


def test_add_member_already_a_member_returns_409(client):
    owner_headers = register_and_login(client, "owner@example.com")
    org = _create_org(client, owner_headers)

    response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "owner@example.com"},
        headers=owner_headers,
    )

    assert response.status_code == 409


def test_remove_member_by_owner_succeeds(client):
    owner_headers = register_and_login(client, "owner@example.com")
    register_and_login(client, "contributor@example.com")
    org = _create_org(client, owner_headers)
    add_response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )
    contributor_id = add_response.json()["user_id"]

    response = client.delete(
        f"/api/v1/organizations/{org['id']}/members/{contributor_id}",
        headers=owner_headers,
    )

    assert response.status_code == 204
    detail = client.get(
        f"/api/v1/organizations/{org['id']}", headers=owner_headers
    ).json()
    assert [m["email"] for m in detail["members"]] == ["owner@example.com"]


def test_remove_member_requires_owner_role(client):
    owner_headers = register_and_login(client, "owner@example.com")
    contributor_headers = register_and_login(client, "contributor@example.com")
    org = _create_org(client, owner_headers)
    add_response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )
    contributor_id = add_response.json()["user_id"]

    response = client.delete(
        f"/api/v1/organizations/{org['id']}/members/{contributor_id}",
        headers=contributor_headers,
    )

    assert response.status_code == 403


def test_delete_organization_requires_owner_role(client):
    owner_headers = register_and_login(client, "owner@example.com")
    contributor_headers = register_and_login(client, "contributor@example.com")
    org = _create_org(client, owner_headers)
    client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )

    response = client.delete(
        f"/api/v1/organizations/{org['id']}", headers=contributor_headers
    )

    assert response.status_code == 403


def test_delete_organization_by_owner_succeeds(client, manager_headers):
    org = _create_org(client, manager_headers)

    response = client.delete(
        f"/api/v1/organizations/{org['id']}", headers=manager_headers
    )
    assert response.status_code == 204

    get_response = client.get(
        f"/api/v1/organizations/{org['id']}", headers=manager_headers
    )
    assert get_response.status_code == 404


def test_organizations_require_authentication(client):
    response = client.get("/api/v1/organizations/")
    assert response.status_code == 401


def test_list_organizations_reports_member_count(client):
    owner_headers = register_and_login(client, "owner@example.com")
    contributor_headers = register_and_login(client, "contributor@example.com")
    shared = _create_org(client, owner_headers, name="Shared")
    _create_org(client, owner_headers, name="Solo")
    client.post(
        f"/api/v1/organizations/{shared['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )

    owner_view = client.get("/api/v1/organizations/", headers=owner_headers).json()
    contributor_view = client.get(
        "/api/v1/organizations/", headers=contributor_headers
    ).json()

    assert {m["name"]: m["member_count"] for m in owner_view} == {
        "Shared": 2,
        "Solo": 1,
    }
    assert [(m["name"], m["member_count"]) for m in contributor_view] == [("Shared", 2)]


def test_rename_organization_by_owner(client, manager_headers):
    org = _create_org(client, manager_headers)

    response = client.patch(
        f"/api/v1/organizations/{org['id']}",
        json={"name": "Acme Labs"},
        headers=manager_headers,
    )

    assert response.status_code == 200
    assert response.json()["id"] == org["id"]
    assert response.json()["name"] == "Acme Labs"
    detail = client.get(
        f"/api/v1/organizations/{org['id']}", headers=manager_headers
    ).json()
    assert detail["name"] == "Acme Labs"


def test_rename_organization_requires_owner_role(client):
    owner_headers = register_and_login(client, "owner@example.com")
    contributor_headers = register_and_login(client, "contributor@example.com")
    org = _create_org(client, owner_headers)
    client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )

    response = client.patch(
        f"/api/v1/organizations/{org['id']}",
        json={"name": "Hijacked"},
        headers=contributor_headers,
    )

    assert response.status_code == 403
    detail = client.get(
        f"/api/v1/organizations/{org['id']}", headers=owner_headers
    ).json()
    assert detail["name"] == "Acme Corp"


def test_add_member_with_owner_role(client):
    owner_headers = register_and_login(client, "owner@example.com")
    co_owner_headers = register_and_login(client, "co-owner@example.com")
    org = _create_org(client, owner_headers)

    response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "co-owner@example.com", "role": "owner"},
        headers=owner_headers,
    )

    assert response.status_code == 201
    assert response.json()["role"] == "owner"
    rename = client.patch(
        f"/api/v1/organizations/{org['id']}",
        json={"name": "Renamed by co-owner"},
        headers=co_owner_headers,
    )
    assert rename.status_code == 200


def test_add_member_with_unknown_role_returns_422(client):
    owner_headers = register_and_login(client, "owner@example.com")
    register_and_login(client, "someone@example.com")
    org = _create_org(client, owner_headers)

    response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "someone@example.com", "role": "admin"},
        headers=owner_headers,
    )

    assert response.status_code == 422


def _seed_org_data(client, headers):
    client.post("/api/v1/roles/", json={"id": "Backend Developer"}, headers=headers)
    client.post("/api/v1/skills/", json={"id": "python"}, headers=headers)
    person = client.post(
        "/api/v1/people/",
        json={
            "name": "Alice Martin",
            "role": "Backend Developer",
            "seniority": Seniority.SENIOR,
            "years_of_experience": 8.0,
            "working_days_per_week": 5,
        },
        headers=headers,
    ).json()
    project = client.post(
        "/api/v1/projects/",
        json={"name": "Project X", "skill_requirements": [ONE_FTE_NEED]},
        headers=headers,
    ).json()
    client.post(
        "/api/v1/assignments/",
        json={
            "person_id": person["id"],
            "project_id": project["id"],
            "ratio": 1.0,
            "start": "2026-01-01",
            "end": "2026-01-31",
        },
        headers=headers,
    )
    client.post(
        "/api/v1/teams/",
        json={
            "project_id": project["id"],
            "optimization_score": 1.0,
            "optimization_max_score": 1.0,
        },
        headers=headers,
    )


def test_delete_organization_removes_its_file_repository_data(isolated_client):
    client = isolated_client
    doomed_headers = register_and_login(client, "doomed@example.com")
    kept_headers = register_and_login(client, "kept@example.com")
    doomed_id = _create_org(client, doomed_headers, name="Doomed")["id"]
    kept_id = _create_org(client, kept_headers, name="Kept")["id"]
    doomed = {**doomed_headers, "X-Organization-Id": doomed_id}
    kept = {**kept_headers, "X-Organization-Id": kept_id}
    _seed_org_data(client, doomed)
    _seed_org_data(client, kept)
    repos = {
        "people": people_module.repo,
        "projects": projects_module.repo,
        "teams": teams_module.repo,
        "assignments": assignments_module.repo,
        "roles": roles_module.repo,
        "skills": skills_module.repo,
    }
    for repo in repos.values():
        assert len(repo.list(doomed_id)) == 1

    response = client.delete(f"/api/v1/organizations/{doomed_id}", headers=doomed)

    assert response.status_code == 204
    for collection, repo in repos.items():
        assert repo.list(doomed_id) == []
        assert len(client.get(f"/api/v1/{collection}/", headers=kept).json()) == 1
