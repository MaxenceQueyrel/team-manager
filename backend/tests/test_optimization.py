import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.person import Person
from api.models.project import Project
from api.models.role import Role as RoleCatalogEntry
from api.models.team import Team
from api.repositories.file_repository import FileRepository
from api.v1 import people as people_module
from api.v1 import projects as projects_module
from api.v1 import roles as roles_module
from api.v1 import teams as teams_module
from optimizer.models import Seniority


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(people_module, "repo", FileRepository("people", Person))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    monkeypatch.setattr(teams_module, "repo", FileRepository("teams", Team))
    monkeypatch.setattr(roles_module, "repo", FileRepository("roles", RoleCatalogEntry))
    return TestClient(app)


@pytest.fixture
def project_id(client, org_headers):
    """A 2-slot project in an organization of 6 people.

    The solver's default min_difference of 2 makes every alternative disjoint
    from earlier teams at this size, so 6 people yield exactly 3 teams.
    """
    client.post("/api/v1/roles/", json={"id": "Backend Developer"}, headers=org_headers)
    for i in range(6):
        client.post(
            "/api/v1/people/",
            json={
                "name": f"Person {i}",
                "role": "Backend Developer",
                "seniority": Seniority.SENIOR,
                "years_of_experience": float(i + 1),
                "fte_capacity": 1.0,
            },
            headers=org_headers,
        )
    project = client.post(
        "/api/v1/projects/",
        json={"name": "Project X", "n_slots": 2},
        headers=org_headers,
    ).json()
    return project["id"]


def _solve(client, headers, project_id, **overrides):
    return client.post(
        "/api/v1/optimization/solve",
        json={"project_id": project_id, **overrides},
        headers=headers,
    )


def test_solve_returns_best_team_and_requested_alternatives(
    client, org_headers, project_id
):
    response = _solve(client, org_headers, project_id, n_alternatives=2)

    assert response.status_code == 200
    body = response.json()
    assert body["best"]["id"]
    assert body["best"]["is_optimized"] is True
    assert len(body["alternatives"]) == 2
    for alternative in body["alternatives"]:
        assert "id" not in alternative
        assert len(alternative["members"]) == 2
        assert alternative["optimization_score"] <= body["best"]["optimization_score"]


def test_solve_defaults_to_two_alternatives(client, org_headers, project_id):
    response = _solve(client, org_headers, project_id)

    assert len(response.json()["alternatives"]) == 2


def test_solve_persists_only_the_best_team(client, org_headers, project_id):
    body = _solve(client, org_headers, project_id, n_alternatives=3).json()

    teams = client.get("/api/v1/teams/", headers=org_headers).json()
    assert [team["id"] for team in teams] == [body["best"]["id"]]


def test_solve_with_zero_alternatives_returns_empty_list(
    client, org_headers, project_id
):
    response = _solve(client, org_headers, project_id, n_alternatives=0)

    assert response.status_code == 200
    assert response.json()["alternatives"] == []


@pytest.mark.parametrize("n_alternatives", [-1, 6])
def test_solve_rejects_out_of_range_n_alternatives(
    client, org_headers, project_id, n_alternatives
):
    response = _solve(client, org_headers, project_id, n_alternatives=n_alternatives)

    assert response.status_code == 422


def test_promoting_a_proposal_creates_a_team(client, org_headers, project_id):
    proposal = _solve(client, org_headers, project_id).json()["alternatives"][0]

    response = client.post(
        "/api/v1/teams/",
        json={"project_id": project_id, **proposal},
        headers=org_headers,
    )

    assert response.status_code == 201
    team = response.json()
    assert team["project_id"] == project_id
    assert team["members"] == proposal["members"]
    assert team["optimization_score"] == proposal["optimization_score"]
    assert team["is_optimized"] is True
    assert (
        client.get(f"/api/v1/teams/{team['id']}", headers=org_headers).status_code
        == 200
    )


def test_create_team_requires_organization_membership(client, org_headers, project_id):
    headers = {"Authorization": org_headers["Authorization"]}

    response = client.post(
        "/api/v1/teams/",
        json={
            "project_id": project_id,
            "members": [],
            "optimization_score": 1.0,
            "optimization_max_score": 2.0,
        },
        headers=headers,
    )

    assert response.status_code == 422
