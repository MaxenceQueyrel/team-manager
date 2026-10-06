import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.assignment import Assignment
from api.models.project import Project
from api.models.team import Team
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module
from api.v1 import projects as projects_module
from api.v1 import teams as teams_module
from tests.conftest import create_org, register_and_login


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    monkeypatch.setattr(teams_module, "repo", FileRepository("teams", Team))
    monkeypatch.setattr(
        assignments_module, "repo", FileRepository("assignments", Assignment)
    )
    return TestClient(app)


PHASES = [
    {
        "id": "design",
        "date_range": {"start": "2026-01-01", "end": "2026-01-31"},
    },
    {
        "id": "build",
        "date_range": {"start": "2026-02-01", "end": "2026-03-31"},
    },
    {"id": "undated"},
]


def _create_project(client, headers, **overrides) -> str:
    payload = {"name": "Apollo", "phases": PHASES, **overrides}
    response = client.post("/api/v1/projects/", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()["id"]


def _create_team(client, headers, project_id, members) -> str:
    payload = {
        "project_id": project_id,
        "members": members,
        "optimization_score": 1.0,
        "optimization_max_score": 1.0,
    }
    response = client.post("/api/v1/teams/", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()["id"]


def _apply(client, headers, team_id):
    return client.post(f"/api/v1/teams/{team_id}/apply", headers=headers)


def _list_assignments(client, headers):
    return client.get("/api/v1/assignments/", headers=headers).json()


def test_phased_team_creates_one_assignment_per_member_with_phase_dates(
    client, org_headers
):
    project_id = _create_project(client, org_headers)
    team_id = _create_team(
        client,
        org_headers,
        project_id,
        [
            {"person_id": "alice", "fte_allocation": 0.5, "phase_id": "build"},
            {"person_id": "bob", "fte_allocation": 1.0, "phase_id": "build"},
        ],
    )

    response = _apply(client, org_headers, team_id)

    assert response.status_code == 201
    created = sorted(response.json(), key=lambda a: a["person_id"])
    assert [(a["person_id"], a["ratio"]) for a in created] == [
        ("alice", 0.5),
        ("bob", 1.0),
    ]
    for assignment in created:
        assert assignment["project_id"] == project_id
        assert assignment["phase_id"] == "build"
        assert assignment["start"] == "2026-02-01"
        assert assignment["end"] == "2026-03-31"
    assert len(_list_assignments(client, org_headers)) == 2


def test_non_phased_team_creates_one_assignment_per_project_date_range(
    client, org_headers
):
    project_id = _create_project(
        client,
        org_headers,
        phases=[],
        date_ranges=[
            {"start": "2026-01-01", "end": "2026-01-31"},
            {"start": "2026-03-01", "end": "2026-03-31"},
        ],
    )
    team_id = _create_team(
        client,
        org_headers,
        project_id,
        [
            {"person_id": "alice", "fte_allocation": 0.5},
            {"person_id": "bob", "fte_allocation": 0.5},
        ],
    )

    response = _apply(client, org_headers, team_id)

    assert response.status_code == 201
    created = response.json()
    assert len(created) == 4
    assert {(a["person_id"], a["start"], a["end"]) for a in created} == {
        ("alice", "2026-01-01", "2026-01-31"),
        ("alice", "2026-03-01", "2026-03-31"),
        ("bob", "2026-01-01", "2026-01-31"),
        ("bob", "2026-03-01", "2026-03-31"),
    }
    assert all(a["phase_id"] is None for a in created)


def test_non_phased_team_on_project_without_date_ranges_returns_400(
    client, org_headers
):
    project_id = _create_project(client, org_headers, phases=[])
    team_id = _create_team(
        client, org_headers, project_id, [{"person_id": "alice", "fte_allocation": 1.0}]
    )

    response = _apply(client, org_headers, team_id)

    assert response.status_code == 400
    assert _list_assignments(client, org_headers) == []


def test_phase_without_date_range_returns_400_and_writes_nothing(client, org_headers):
    project_id = _create_project(client, org_headers)
    team_id = _create_team(
        client,
        org_headers,
        project_id,
        [
            {"person_id": "alice", "fte_allocation": 1.0, "phase_id": "design"},
            {"person_id": "bob", "fte_allocation": 1.0, "phase_id": "undated"},
        ],
    )

    response = _apply(client, org_headers, team_id)

    assert response.status_code == 400
    assert "undated" in response.json()["detail"]
    assert _list_assignments(client, org_headers) == []


def test_member_already_fully_allocated_elsewhere_returns_400_and_writes_nothing(
    client, org_headers
):
    client.post(
        "/api/v1/assignments/",
        json={
            "person_id": "bob",
            "project_id": "other-project",
            "ratio": 1.0,
            "start": "2026-01-15",
            "end": "2026-02-15",
        },
        headers=org_headers,
    )
    project_id = _create_project(client, org_headers)
    team_id = _create_team(
        client,
        org_headers,
        project_id,
        [
            {"person_id": "alice", "fte_allocation": 1.0, "phase_id": "design"},
            {"person_id": "bob", "fte_allocation": 0.5, "phase_id": "design"},
        ],
    )

    response = _apply(client, org_headers, team_id)

    assert response.status_code == 400
    assert "bob" in response.json()["detail"]
    assert "alice" not in response.json()["detail"]
    assert [a["person_id"] for a in _list_assignments(client, org_headers)] == ["bob"]


def test_overlap_among_new_assignments_is_rejected(client, org_headers):
    project_id = _create_project(
        client,
        org_headers,
        phases=[],
        date_ranges=[
            {"start": "2026-01-01", "end": "2026-01-31"},
            {"start": "2026-01-15", "end": "2026-02-15"},
        ],
    )
    team_id = _create_team(
        client, org_headers, project_id, [{"person_id": "alice", "fte_allocation": 0.6}]
    )

    response = _apply(client, org_headers, team_id)

    assert response.status_code == 400
    assert "alice" in response.json()["detail"]
    assert _list_assignments(client, org_headers) == []


def test_reapplying_replaces_assignments_for_that_phase_only(client, org_headers):
    project_id = _create_project(client, org_headers)
    design_team = _create_team(
        client,
        org_headers,
        project_id,
        [{"person_id": "alice", "fte_allocation": 1.0, "phase_id": "design"}],
    )
    build_team = _create_team(
        client,
        org_headers,
        project_id,
        [{"person_id": "alice", "fte_allocation": 1.0, "phase_id": "build"}],
    )
    assert _apply(client, org_headers, design_team).status_code == 201
    assert _apply(client, org_headers, build_team).status_code == 201

    # Alice is at 1.0 FTE on "design"; re-applying must not count her old
    # assignment against the new one or the FTE check would reject this.
    new_design_team = _create_team(
        client,
        org_headers,
        project_id,
        [
            {"person_id": "alice", "fte_allocation": 0.5, "phase_id": "design"},
            {"person_id": "bob", "fte_allocation": 1.0, "phase_id": "design"},
        ],
    )
    response = _apply(client, org_headers, new_design_team)

    assert response.status_code == 201
    remaining = {
        (a["person_id"], a["phase_id"], a["ratio"])
        for a in _list_assignments(client, org_headers)
    }
    assert remaining == {
        ("alice", "design", 0.5),
        ("bob", "design", 1.0),
        ("alice", "build", 1.0),
    }


def test_reapplying_keeps_assignments_of_other_projects(client, org_headers):
    other = client.post(
        "/api/v1/assignments/",
        json={
            "person_id": "carol",
            "project_id": "other-project",
            "ratio": 0.5,
            "start": "2026-01-01",
            "end": "2026-01-31",
            "phase_id": "design",
        },
        headers=org_headers,
    ).json()
    project_id = _create_project(client, org_headers)
    team_id = _create_team(
        client,
        org_headers,
        project_id,
        [{"person_id": "alice", "fte_allocation": 1.0, "phase_id": "design"}],
    )

    assert _apply(client, org_headers, team_id).status_code == 201

    ids = {a["id"] for a in _list_assignments(client, org_headers)}
    assert other["id"] in ids


def test_apply_missing_team_returns_404(client, org_headers):
    response = _apply(client, org_headers, "does-not-exist")
    assert response.status_code == 404


def test_apply_team_whose_project_is_gone_returns_404(client, org_headers):
    project_id = _create_project(client, org_headers)
    team_id = _create_team(
        client,
        org_headers,
        project_id,
        [{"person_id": "alice", "fte_allocation": 1.0, "phase_id": "design"}],
    )
    client.delete(f"/api/v1/projects/{project_id}", headers=org_headers)

    response = _apply(client, org_headers, team_id)

    assert response.status_code == 404


def test_apply_team_from_another_organization_returns_404(client, org_headers):
    project_id = _create_project(client, org_headers)
    team_id = _create_team(
        client,
        org_headers,
        project_id,
        [{"person_id": "alice", "fte_allocation": 1.0, "phase_id": "design"}],
    )
    other_headers = register_and_login(client, "other-owner@example.com")
    other_org = {
        **other_headers,
        "X-Organization-Id": create_org(client, other_headers, name="Other"),
    }

    response = _apply(client, other_org, team_id)

    assert response.status_code == 404
    assert _list_assignments(client, org_headers) == []
