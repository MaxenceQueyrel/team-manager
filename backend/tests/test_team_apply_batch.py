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
from tests.conftest import ONE_FTE_NEED, create_org, register_and_login


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    monkeypatch.setattr(teams_module, "repo", FileRepository("teams", Team))
    monkeypatch.setattr(
        assignments_module, "repo", FileRepository("assignments", Assignment)
    )
    return TestClient(app)


JANUARY = {"start": "2026-01-01", "end": "2026-01-31"}
PHASES = [
    {"id": "design", "skill_requirements": [ONE_FTE_NEED], "date_range": JANUARY},
    {
        "id": "build",
        "skill_requirements": [ONE_FTE_NEED],
        "date_range": {"start": "2026-02-01", "end": "2026-03-31"},
    },
    {"id": "undated", "skill_requirements": [ONE_FTE_NEED]},
]


def _create_project(client, headers, name, **overrides) -> str:
    payload = {
        "name": name,
        "skill_requirements": [ONE_FTE_NEED],
        "date_ranges": [JANUARY],
        **overrides,
    }
    response = client.post("/api/v1/projects/", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()["id"]


def _create_team(client, headers, project_id, members, start_date=None) -> str:
    payload = {
        "project_id": project_id,
        "members": members,
        "optimization_score": 1.0,
        "optimization_max_score": 1.0,
        "start_date": start_date,
    }
    response = client.post("/api/v1/teams/", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()["id"]


def _create_assignment(client, headers, **fields):
    response = client.post("/api/v1/assignments/", json=fields, headers=headers)
    assert response.status_code == 201
    return response.json()


def _apply_batch(client, headers, team_ids):
    return client.post(
        "/api/v1/teams/apply-batch", json={"team_ids": team_ids}, headers=headers
    )


def _list_assignments(client, headers):
    return client.get("/api/v1/assignments/", headers=headers).json()


def test_apply_batch_creates_every_teams_assignments(client, org_headers):
    apollo = _create_project(client, org_headers, "Apollo")
    gemini = _create_project(client, org_headers, "Gemini")
    apollo_team = _create_team(
        client, org_headers, apollo, [{"person_id": "alice", "fte_allocation": 0.6}]
    )
    gemini_team = _create_team(
        client,
        org_headers,
        gemini,
        [
            {"person_id": "alice", "fte_allocation": 0.4},
            {"person_id": "bob", "fte_allocation": 1.0},
        ],
    )

    response = _apply_batch(client, org_headers, [apollo_team, gemini_team])

    assert response.status_code == 201
    expected = {
        ("alice", apollo, 0.6, "2026-01-01", "2026-01-31"),
        ("alice", gemini, 0.4, "2026-01-01", "2026-01-31"),
        ("bob", gemini, 1.0, "2026-01-01", "2026-01-31"),
    }
    created = {
        (a["person_id"], a["project_id"], a["ratio"], a["start"], a["end"])
        for a in response.json()
    }
    assert created == expected
    stored = {
        (a["person_id"], a["project_id"], a["ratio"], a["start"], a["end"])
        for a in _list_assignments(client, org_headers)
    }
    assert stored == expected


def test_apply_batch_over_allocation_across_teams_writes_nothing(client, org_headers):
    apollo = _create_project(client, org_headers, "Apollo")
    gemini = _create_project(client, org_headers, "Gemini")
    kept = _create_assignment(
        client,
        org_headers,
        person_id="carol",
        project_id="other-project",
        ratio=0.4,
        **JANUARY,
    )
    apollo_team = _create_team(
        client, org_headers, apollo, [{"person_id": "alice", "fte_allocation": 0.6}]
    )
    gemini_team = _create_team(
        client, org_headers, gemini, [{"person_id": "alice", "fte_allocation": 0.6}]
    )

    response = _apply_batch(client, org_headers, [apollo_team, gemini_team])

    assert response.status_code == 400
    assert "alice" in response.json()["detail"]
    assert _list_assignments(client, org_headers) == [kept]


def test_apply_batch_counts_kept_assignments_of_other_projects(client, org_headers):
    apollo = _create_project(client, org_headers, "Apollo")
    gemini = _create_project(client, org_headers, "Gemini")
    kept = _create_assignment(
        client,
        org_headers,
        person_id="bob",
        project_id="other-project",
        ratio=0.6,
        start="2026-01-20",
        end="2026-02-20",
    )
    apollo_team = _create_team(
        client, org_headers, apollo, [{"person_id": "alice", "fte_allocation": 1.0}]
    )
    gemini_team = _create_team(
        client, org_headers, gemini, [{"person_id": "bob", "fte_allocation": 0.6}]
    )

    response = _apply_batch(client, org_headers, [apollo_team, gemini_team])

    assert response.status_code == 400
    assert response.json()["detail"].endswith("bob")
    assert _list_assignments(client, org_headers) == [kept]


def test_apply_batch_with_a_dateless_team_writes_nothing(client, org_headers):
    apollo = _create_project(client, org_headers, "Apollo")
    gemini = _create_project(client, org_headers, "Gemini", phases=PHASES)
    apollo_team = _create_team(
        client, org_headers, apollo, [{"person_id": "alice", "fte_allocation": 1.0}]
    )
    gemini_team = _create_team(
        client,
        org_headers,
        gemini,
        [{"person_id": "bob", "fte_allocation": 1.0, "phase_id": "undated"}],
    )

    response = _apply_batch(client, org_headers, [apollo_team, gemini_team])

    assert response.status_code == 400
    assert "undated" in response.json()["detail"]
    assert _list_assignments(client, org_headers) == []


def test_apply_batch_replaces_every_assignment_of_each_project(client, org_headers):
    apollo = _create_project(client, org_headers, "Apollo", phases=PHASES)
    gemini = _create_project(client, org_headers, "Gemini")
    old_design = _create_assignment(
        client,
        org_headers,
        person_id="alice",
        project_id=apollo,
        ratio=1.0,
        phase_id="design",
        **JANUARY,
    )
    old_build = _create_assignment(
        client,
        org_headers,
        person_id="alice",
        project_id=apollo,
        ratio=1.0,
        phase_id="build",
        start="2026-02-01",
        end="2026-03-31",
    )
    old_gemini = _create_assignment(
        client,
        org_headers,
        person_id="bob",
        project_id=gemini,
        ratio=1.0,
        **JANUARY,
    )
    # Alice's old design assignment would put her at 1.4 FTE in January if it
    # were not replaced.
    apollo_team = _create_team(
        client,
        org_headers,
        apollo,
        [{"person_id": "alice", "fte_allocation": 0.4, "phase_id": "design"}],
    )
    gemini_team = _create_team(
        client,
        org_headers,
        gemini,
        [{"person_id": "alice", "fte_allocation": 0.6}],
    )

    response = _apply_batch(client, org_headers, [apollo_team, gemini_team])

    assert response.status_code == 201
    stored = _list_assignments(client, org_headers)
    ids = {a["id"] for a in stored}
    assert ids.isdisjoint({old_design["id"], old_build["id"], old_gemini["id"]})
    assert {
        (a["person_id"], a["project_id"], a["phase_id"], a["ratio"]) for a in stored
    } == {
        ("alice", apollo, "design", 0.4),
        ("alice", gemini, None, 0.6),
    }


def test_apply_batch_accepts_partial_overlaps_that_fit_every_period(
    client, org_headers
):
    # Each day sums to at most 1.0 FTE, although "long" overlaps both others and
    # 0.6 + 0.4 + 0.4 exceeds it.
    long = _create_project(
        client,
        org_headers,
        "Long",
        date_ranges=[{"start": "2026-01-05", "end": "2026-01-25"}],
    )
    first = _create_project(
        client,
        org_headers,
        "First",
        date_ranges=[{"start": "2026-01-05", "end": "2026-01-14"}],
    )
    second = _create_project(
        client,
        org_headers,
        "Second",
        date_ranges=[{"start": "2026-01-15", "end": "2026-01-25"}],
    )
    team_ids = [
        _create_team(
            client,
            org_headers,
            project_id,
            [{"person_id": "alice", "fte_allocation": ratio}],
        )
        for project_id, ratio in ((long, 0.6), (first, 0.4), (second, 0.4))
    ]

    response = _apply_batch(client, org_headers, team_ids)

    assert response.status_code == 201
    assert len(_list_assignments(client, org_headers)) == 3


def test_apply_batch_rejects_two_teams_of_the_same_project(client, org_headers):
    apollo = _create_project(client, org_headers, "Apollo")
    team_ids = [
        _create_team(
            client, org_headers, apollo, [{"person_id": person, "fte_allocation": 1.0}]
        )
        for person in ("alice", "bob")
    ]

    response = _apply_batch(client, org_headers, team_ids)

    assert response.status_code == 400
    assert _list_assignments(client, org_headers) == []


def test_apply_batch_rejects_a_shifted_start_team(client, org_headers):
    apollo = _create_project(client, org_headers, "Apollo")
    gemini = _create_project(
        client,
        org_headers,
        "Gemini",
        start_window={"start": "2026-01-01", "end": "2026-03-01"},
    )
    apollo_team = _create_team(
        client, org_headers, apollo, [{"person_id": "alice", "fte_allocation": 1.0}]
    )
    shifted_team = _create_team(
        client,
        org_headers,
        gemini,
        [{"person_id": "bob", "fte_allocation": 1.0}],
        start_date="2026-02-01",
    )

    response = _apply_batch(client, org_headers, [apollo_team, shifted_team])

    assert response.status_code == 400
    assert _list_assignments(client, org_headers) == []


@pytest.mark.parametrize("team_ids", [[], ["same", "same"]])
def test_apply_batch_rejects_empty_or_duplicate_team_ids(client, org_headers, team_ids):
    response = _apply_batch(client, org_headers, team_ids)

    assert response.status_code == 422


def test_apply_batch_with_a_missing_team_returns_404_and_writes_nothing(
    client, org_headers
):
    apollo = _create_project(client, org_headers, "Apollo")
    apollo_team = _create_team(
        client, org_headers, apollo, [{"person_id": "alice", "fte_allocation": 1.0}]
    )

    response = _apply_batch(client, org_headers, [apollo_team, "does-not-exist"])

    assert response.status_code == 404
    assert _list_assignments(client, org_headers) == []


def test_apply_batch_with_a_team_whose_project_is_gone_returns_404(client, org_headers):
    apollo = _create_project(client, org_headers, "Apollo")
    gemini = _create_project(client, org_headers, "Gemini")
    team_ids = [
        _create_team(
            client,
            org_headers,
            project_id,
            [{"person_id": "alice", "fte_allocation": 0.4}],
        )
        for project_id in (apollo, gemini)
    ]
    client.delete(f"/api/v1/projects/{gemini}", headers=org_headers)

    response = _apply_batch(client, org_headers, team_ids)

    assert response.status_code == 404
    assert _list_assignments(client, org_headers) == []


def test_apply_batch_cannot_apply_another_organizations_team(client, org_headers):
    apollo = _create_project(client, org_headers, "Apollo")
    apollo_team = _create_team(
        client, org_headers, apollo, [{"person_id": "alice", "fte_allocation": 1.0}]
    )
    other_headers = register_and_login(client, "other-owner@example.com")
    other_org = {
        **other_headers,
        "X-Organization-Id": create_org(client, other_headers, name="Other"),
    }

    response = _apply_batch(client, other_org, [apollo_team])

    assert response.status_code == 404
    assert _list_assignments(client, org_headers) == []


def test_apply_batch_requires_organization_membership(client, org_headers):
    headers = {"Authorization": org_headers["Authorization"]}

    response = _apply_batch(client, headers, ["any"])

    assert response.status_code == 422
