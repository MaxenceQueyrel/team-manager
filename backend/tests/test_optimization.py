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
from optimizer.adapters.pulp_solver import MIN_FTE_SHARE
from optimizer.models import Seniority


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
                "working_days_per_week": 5,
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
    assert body["best"]["created_at"] is not None
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
    assert team["coverage"] == proposal["coverage"]
    assert team["fully_covered"] == proposal["fully_covered"]
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


NOVEMBER = [{"start": "2026-11-01", "end": "2026-11-30"}]


def _busy_person_setup(client, headers):
    """Creates a person fully assigned to project A, and project B overlapping it.

    Both projects force-include the person, so they are proposed whenever they are
    a feasible candidate and left out only when the solver sees them as booked.
    """
    client.post("/api/v1/roles/", json={"id": "Backend Developer"}, headers=headers)
    person_ids = [
        client.post(
            "/api/v1/people/",
            json={
                "name": name,
                "role": "Backend Developer",
                "seniority": Seniority.SENIOR,
                "years_of_experience": 5.0,
            },
            headers=headers,
        ).json()["id"]
        for name in ("Bob", "Alice")
    ]
    bob_id = person_ids[0]
    project_ids = [
        client.post(
            "/api/v1/projects/",
            json={
                "name": name,
                "date_ranges": NOVEMBER,
                "included_person_ids": [bob_id],
            },
            headers=headers,
        ).json()["id"]
        for name in ("Project A", "Project B")
    ]
    client.post(
        "/api/v1/assignments/",
        json={
            "person_id": bob_id,
            "project_id": project_ids[0],
            "ratio": 1.0,
            **NOVEMBER[0],
        },
        headers=headers,
    )
    return bob_id, project_ids[0], project_ids[1]


def _best_member_ids(response):
    return [m["person_id"] for m in response.json()["best"]["members"]]


def test_solve_skips_person_fully_assigned_to_another_project(client, org_headers):
    bob_id, _, project_b = _busy_person_setup(client, org_headers)

    response = _solve(client, org_headers, project_b, n_alternatives=0)

    assert response.status_code == 200
    assert bob_id not in _best_member_ids(response)


def test_solve_ignores_assignments_on_the_project_being_solved(client, org_headers):
    bob_id, project_a, _ = _busy_person_setup(client, org_headers)

    response = _solve(client, org_headers, project_a, n_alternatives=0)

    assert response.status_code == 200
    assert _best_member_ids(response) == [bob_id]


def test_solve_reports_coverage_for_best_and_alternatives(
    client, org_headers, project_id
):
    body = _solve(client, org_headers, project_id, n_alternatives=2).json()

    for proposal in [body["best"], *body["alternatives"]]:
        assert proposal["fully_covered"] is True
        assert proposal["coverage"] == [
            {
                "phase_id": None,
                "required_fte": 2.0,
                "staffed_fte": 2.0,
                "available_fte": 6.0,
                "fte_met": True,
                "skills": [],
            }
        ]


def test_solve_reports_unmet_skill_and_persists_coverage(client, org_headers):
    client.post("/api/v1/roles/", json={"id": "Backend Developer"}, headers=org_headers)
    client.post(
        "/api/v1/people/",
        json={
            "name": "Ada",
            "role": "Backend Developer",
            "seniority": Seniority.SENIOR,
            "years_of_experience": 5.0,
            "skills": [{"id": "python", "level": 2}],
        },
        headers=org_headers,
    )
    project_id = client.post(
        "/api/v1/projects/",
        json={
            "name": "Project Y",
            "skill_requirements": [{"id": "python", "min_level": 4}],
        },
        headers=org_headers,
    ).json()["id"]

    best = _solve(client, org_headers, project_id, n_alternatives=0).json()["best"]

    assert best["fully_covered"] is False
    assert best["coverage"][0]["fte_met"] is True
    assert best["coverage"][0]["skills"] == [
        {
            "skill_id": "python",
            "required_level": 4.0,
            "best_level": 2.0,
            "covered_fte": 0.0,
            "met": False,
        }
    ]
    saved = client.get(f"/api/v1/teams/{best['id']}", headers=org_headers).json()
    assert saved["coverage"] == best["coverage"]
    assert saved["fully_covered"] is False


def test_solve_returns_409_with_conflicts_when_no_team_is_feasible(client, org_headers):
    client.post("/api/v1/roles/", json={"id": "Backend Developer"}, headers=org_headers)
    # Each selected person carries at least MIN_FTE_SHARE, so a squad bigger than
    # 1 / MIN_FTE_SHARE can never fit a single FTE.
    member_ids = [
        client.post(
            "/api/v1/people/",
            json={
                "name": f"Member {i}",
                "role": "Backend Developer",
                "seniority": Seniority.SENIOR,
                "years_of_experience": 5.0,
            },
            headers=org_headers,
        ).json()["id"]
        for i in range(int(1 / MIN_FTE_SHARE) + 1)
    ]
    project_id = client.post(
        "/api/v1/projects/",
        json={"name": "Project Z", "squads": [{"member_ids": member_ids}]},
        headers=org_headers,
    ).json()["id"]

    response = _solve(client, org_headers, project_id)

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["project_id"] == project_id
    assert detail["message"]
    assert detail["conflicts"] == [
        {
            "phase_id": None,
            "reason": "squad_conflict",
            "required_fte": 1.0,
            "need_fte": 1.0,
            "squad_indices": [0],
            "forced_person_ids": [],
        }
    ]
    assert client.get("/api/v1/teams/", headers=org_headers).json() == []
