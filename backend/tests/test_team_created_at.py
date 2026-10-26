import json
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.project import Project
from api.models.team import Team
from api.repositories.file_repository import FileRepository
from api.v1 import projects as projects_module
from api.v1 import teams as teams_module
from tests.conftest import ONE_FTE_NEED


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    monkeypatch.setattr(teams_module, "repo", FileRepository("teams", Team))
    return TestClient(app)


def _create_project(client, headers) -> str:
    response = client.post(
        "/api/v1/projects/",
        json={"name": "Apollo", "skill_requirements": [ONE_FTE_NEED]},
        headers=headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_create_team_sets_created_at(client, org_headers):
    project_id = _create_project(client, org_headers)
    before = datetime.now(UTC)

    response = client.post(
        "/api/v1/teams/",
        json={
            "project_id": project_id,
            "members": [{"person_id": "alice", "fte_allocation": 1.0}],
            "optimization_score": 1.0,
            "optimization_max_score": 1.0,
        },
        headers=org_headers,
    )

    assert response.status_code == 201
    created_at = datetime.fromisoformat(response.json()["created_at"])
    assert before <= created_at <= datetime.now(UTC)
    stored = client.get(f"/api/v1/teams/{response.json()['id']}", headers=org_headers)
    assert datetime.fromisoformat(stored.json()["created_at"]) == created_at


def test_create_team_ignores_client_supplied_created_at(client, org_headers):
    project_id = _create_project(client, org_headers)

    response = client.post(
        "/api/v1/teams/",
        json={
            "project_id": project_id,
            "members": [],
            "optimization_score": 1.0,
            "optimization_max_score": 1.0,
            "created_at": "2000-01-01T00:00:00Z",
        },
        headers=org_headers,
    )

    assert response.status_code == 201
    assert not response.json()["created_at"].startswith("2000-01-01")


def test_legacy_team_without_created_at_loads(client, org_headers, tmp_path):
    organization_id = org_headers["X-Organization-Id"]
    legacy = {
        "id": "legacy-team",
        "organization_id": organization_id,
        "project_id": "some-project",
        "members": [],
        "is_optimized": True,
        "optimization_score": 1.0,
        "optimization_max_score": 1.0,
    }
    (tmp_path / "teams.json").write_text(json.dumps([legacy]))

    response = client.get("/api/v1/teams/legacy-team", headers=org_headers)

    assert response.status_code == 200
    assert response.json()["created_at"] is None
