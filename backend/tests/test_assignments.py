import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.assignment import Assignment
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(assignments_module, "repo", FileRepository("assignments", Assignment))
    return TestClient(app)


def _create_assignment(client, **overrides):
    payload = {
        "person_id": "person-1",
        "project_id": "project-1",
        "ratio": 1.0,
        "start": "2026-01-01",
        "end": "2026-01-31",
        **overrides,
    }
    return client.post("/api/v1/assignments/", json=payload)


def test_create_and_get_assignment(client):
    response = _create_assignment(client)
    assert response.status_code == 201
    body = response.json()
    assert body["person_id"] == "person-1"
    assert body["phase_id"] is None

    get_response = client.get(f"/api/v1/assignments/{body['id']}")
    assert get_response.status_code == 200
    assert get_response.json() == body


def test_get_missing_assignment_returns_404(client):
    response = client.get("/api/v1/assignments/does-not-exist")
    assert response.status_code == 404


def test_list_filters_by_person_and_project(client):
    _create_assignment(client, person_id="person-1", project_id="project-1", ratio=0.5)
    _create_assignment(client, person_id="person-1", project_id="project-2", ratio=0.5)
    _create_assignment(client, person_id="person-2", project_id="project-1", ratio=1.0)

    by_person = client.get("/api/v1/assignments/", params={"person_id": "person-1"})
    assert len(by_person.json()) == 2

    by_project = client.get("/api/v1/assignments/", params={"project_id": "project-1"})
    assert len(by_project.json()) == 2

    by_both = client.get(
        "/api/v1/assignments/", params={"person_id": "person-1", "project_id": "project-2"}
    )
    assert len(by_both.json()) == 1


def test_update_assignment(client):
    created = _create_assignment(client, ratio=0.5).json()

    response = client.put(
        f"/api/v1/assignments/{created['id']}",
        json={
            "person_id": "person-1",
            "project_id": "project-1",
            "ratio": 0.8,
            "start": "2026-01-01",
            "end": "2026-01-31",
            "phase_id": "phase-1",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ratio"] == 0.8
    assert body["phase_id"] == "phase-1"
    assert body["id"] == created["id"]


def test_update_missing_assignment_returns_404(client):
    response = client.put(
        "/api/v1/assignments/does-not-exist",
        json={
            "person_id": "person-1",
            "project_id": "project-1",
            "ratio": 0.5,
            "start": "2026-01-01",
            "end": "2026-01-31",
        },
    )
    assert response.status_code == 404


def test_delete_assignment(client):
    created = _create_assignment(client).json()

    response = client.delete(f"/api/v1/assignments/{created['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/v1/assignments/{created['id']}").status_code == 404


def test_delete_missing_assignment_returns_404(client):
    response = client.delete("/api/v1/assignments/does-not-exist")
    assert response.status_code == 404


def test_overlapping_assignments_exceeding_fte_are_rejected(client):
    _create_assignment(client, person_id="person-1", ratio=0.6, start="2026-01-01", end="2026-01-31")

    response = _create_assignment(
        client, person_id="person-1", ratio=0.5, start="2026-01-15", end="2026-02-15"
    )

    assert response.status_code == 400


def test_non_overlapping_assignments_are_allowed(client):
    _create_assignment(client, person_id="person-1", ratio=1.0, start="2026-01-01", end="2026-01-31")

    response = _create_assignment(
        client, person_id="person-1", ratio=1.0, start="2026-02-01", end="2026-02-28"
    )

    assert response.status_code == 201


def test_overlapping_assignments_for_different_people_are_allowed(client):
    _create_assignment(client, person_id="person-1", ratio=1.0, start="2026-01-01", end="2026-01-31")

    response = _create_assignment(
        client, person_id="person-2", ratio=1.0, start="2026-01-01", end="2026-01-31"
    )

    assert response.status_code == 201


def test_update_excludes_its_own_assignment_from_fte_check(client):
    created = _create_assignment(client, ratio=0.6).json()

    response = client.put(
        f"/api/v1/assignments/{created['id']}",
        json={
            "person_id": "person-1",
            "project_id": "project-1",
            "ratio": 0.9,
            "start": "2026-01-01",
            "end": "2026-01-31",
        },
    )

    assert response.status_code == 200
