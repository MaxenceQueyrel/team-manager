import json

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.project import Project
from api.repositories.file_repository import FileRepository
from api.v1 import projects as projects_module
from tests.conftest import ONE_FTE_NEED


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    return TestClient(app)


def _create_project(client, headers) -> dict:
    payload = {
        "name": "Atlas Migration",
        "skill_requirements": [ONE_FTE_NEED],
        "date_ranges": [{"start": "2026-07-01", "end": "2026-09-30"}],
    }
    response = client.post("/api/v1/projects/", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()


def _put(client, headers, project: dict, **changes):
    payload = {
        key: value
        for key, value in {**project, **changes}.items()
        if key not in ("id", "organization_id")
    }
    return client.put(
        f"/api/v1/projects/{project['id']}", json=payload, headers=headers
    )


def test_new_project_is_open(client, org_headers):
    project = _create_project(client, org_headers)

    assert project["completed_at"] is None


def test_put_with_completed_at_marks_project_complete(client, org_headers):
    project = _create_project(client, org_headers)

    response = _put(client, org_headers, project, completed_at="2026-10-01")

    assert response.status_code == 200
    assert response.json()["completed_at"] == "2026-10-01"
    stored = client.get(f"/api/v1/projects/{project['id']}", headers=org_headers)
    assert stored.json()["completed_at"] == "2026-10-01"


def test_put_with_null_completed_at_reopens_project(client, org_headers):
    project = _create_project(client, org_headers)
    completed = _put(client, org_headers, project, completed_at="2026-10-01").json()

    response = _put(client, org_headers, completed, completed_at=None)

    assert response.status_code == 200
    assert response.json()["completed_at"] is None


def test_put_rejects_invalid_completed_at(client, org_headers):
    project = _create_project(client, org_headers)

    response = _put(client, org_headers, project, completed_at="soon")

    assert response.status_code == 422


def test_legacy_project_without_completed_at_loads_as_open(
    client, org_headers, tmp_path
):
    organization_id = org_headers["X-Organization-Id"]
    legacy = {
        "id": "legacy-project",
        "organization_id": organization_id,
        "name": "Legacy",
        "description": "",
        "skill_requirements": [ONE_FTE_NEED],
        "excluded_person_ids": [],
        "included_person_ids": [],
        "squads": [],
        "date_ranges": [],
        "phases": [],
        "priority": "medium",
    }
    (tmp_path / "projects.json").write_text(json.dumps([legacy]))

    response = client.get("/api/v1/projects/legacy-project", headers=org_headers)

    assert response.status_code == 200
    assert response.json()["completed_at"] is None
