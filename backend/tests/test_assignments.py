import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.assignment import Assignment
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(
        assignments_module, "repo", FileRepository("assignments", Assignment)
    )
    return TestClient(app)


def _create_assignment(client, headers, **overrides):
    payload = {
        "person_id": "person-1",
        "project_id": "project-1",
        "ratio": 1.0,
        "start": "2026-01-01",
        "end": "2026-01-31",
        **overrides,
    }
    return client.post("/api/v1/assignments/", json=payload, headers=headers)


def test_create_and_get_assignment(client, org_headers):
    response = _create_assignment(client, org_headers)
    assert response.status_code == 201
    body = response.json()
    assert body["person_id"] == "person-1"
    assert body["phase_id"] is None
    assert body["organization_id"] == org_headers["X-Organization-Id"]

    get_response = client.get(f"/api/v1/assignments/{body['id']}", headers=org_headers)
    assert get_response.status_code == 200
    assert get_response.json() == body


def test_create_assignment_without_organization_header_returns_422(
    client, unprivileged_headers
):
    response = _create_assignment(client, unprivileged_headers)
    assert response.status_code == 422


def test_create_assignment_without_auth_returns_401(client):
    response = _create_assignment(client, headers=None)
    assert response.status_code == 401


def test_get_missing_assignment_returns_404(client, org_headers):
    response = client.get("/api/v1/assignments/does-not-exist", headers=org_headers)
    assert response.status_code == 404


def test_list_filters_by_person_and_project(client, org_headers):
    _create_assignment(
        client, org_headers, person_id="person-1", project_id="project-1", ratio=0.6
    )
    _create_assignment(
        client, org_headers, person_id="person-1", project_id="project-2", ratio=0.4
    )
    _create_assignment(
        client, org_headers, person_id="person-2", project_id="project-1", ratio=1.0
    )

    by_person = client.get(
        "/api/v1/assignments/", params={"person_id": "person-1"}, headers=org_headers
    )
    assert len(by_person.json()) == 2

    by_project = client.get(
        "/api/v1/assignments/", params={"project_id": "project-1"}, headers=org_headers
    )
    assert len(by_project.json()) == 2

    by_both = client.get(
        "/api/v1/assignments/",
        params={"person_id": "person-1", "project_id": "project-2"},
        headers=org_headers,
    )
    assert len(by_both.json()) == 1


def test_update_assignment(client, org_headers):
    created = _create_assignment(client, org_headers, ratio=0.4).json()

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
        headers=org_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ratio"] == 0.8
    assert body["phase_id"] == "phase-1"
    assert body["id"] == created["id"]


def test_update_missing_assignment_returns_404(client, org_headers):
    response = client.put(
        "/api/v1/assignments/does-not-exist",
        json={
            "person_id": "person-1",
            "project_id": "project-1",
            "ratio": 0.4,
            "start": "2026-01-01",
            "end": "2026-01-31",
        },
        headers=org_headers,
    )
    assert response.status_code == 404


def test_delete_assignment(client, org_headers):
    created = _create_assignment(client, org_headers).json()

    response = client.delete(
        f"/api/v1/assignments/{created['id']}", headers=org_headers
    )
    assert response.status_code == 204
    assert (
        client.get(
            f"/api/v1/assignments/{created['id']}", headers=org_headers
        ).status_code
        == 404
    )


def test_delete_missing_assignment_returns_404(client, org_headers):
    response = client.delete("/api/v1/assignments/does-not-exist", headers=org_headers)
    assert response.status_code == 404


def test_delete_assignment_without_organization_header_returns_422(client, org_headers):
    created = _create_assignment(client, org_headers).json()

    headers = {"Authorization": org_headers["Authorization"]}
    response = client.delete(f"/api/v1/assignments/{created['id']}", headers=headers)
    assert response.status_code == 422


def test_overlapping_assignments_exceeding_fte_are_rejected(client, org_headers):
    _create_assignment(
        client,
        org_headers,
        person_id="person-1",
        ratio=0.6,
        start="2026-01-01",
        end="2026-01-31",
    )

    response = _create_assignment(
        client,
        org_headers,
        person_id="person-1",
        ratio=0.6,
        start="2026-01-15",
        end="2026-02-15",
    )

    assert response.status_code == 400


def test_non_overlapping_assignments_are_allowed(client, org_headers):
    _create_assignment(
        client,
        org_headers,
        person_id="person-1",
        ratio=1.0,
        start="2026-01-01",
        end="2026-01-31",
    )

    response = _create_assignment(
        client,
        org_headers,
        person_id="person-1",
        ratio=1.0,
        start="2026-02-01",
        end="2026-02-28",
    )

    assert response.status_code == 201


def test_overlapping_assignments_for_different_people_are_allowed(client, org_headers):
    _create_assignment(
        client,
        org_headers,
        person_id="person-1",
        ratio=1.0,
        start="2026-01-01",
        end="2026-01-31",
    )

    response = _create_assignment(
        client,
        org_headers,
        person_id="person-2",
        ratio=1.0,
        start="2026-01-01",
        end="2026-01-31",
    )

    assert response.status_code == 201


def test_update_excludes_its_own_assignment_from_fte_check(client, org_headers):
    created = _create_assignment(client, org_headers, ratio=0.6).json()

    response = client.put(
        f"/api/v1/assignments/{created['id']}",
        json={
            "person_id": "person-1",
            "project_id": "project-1",
            "ratio": 0.8,
            "start": "2026-01-01",
            "end": "2026-01-31",
        },
        headers=org_headers,
    )

    assert response.status_code == 200


@pytest.mark.parametrize("ratio", [0.5, 0.12, 0.88, 0.0, 0.1, 1.2])
def test_off_grid_ratio_is_rejected(client, org_headers, ratio):
    response = _create_assignment(client, org_headers, ratio=ratio)

    assert response.status_code == 422


@pytest.mark.parametrize("ratio", [0.2, 0.4, 0.6, 0.8, 1.0])
def test_on_grid_ratio_is_accepted(client, org_headers, ratio):
    response = _create_assignment(client, org_headers, ratio=ratio)

    assert response.status_code == 201
    assert response.json()["ratio"] == ratio


def test_off_grid_ratio_error_explains_the_grid(client, org_headers):
    response = _create_assignment(client, org_headers, ratio=0.5)

    assert "multiple of 20%" in response.json()["detail"][0]["msg"]


def test_update_rejects_off_grid_ratio(client, org_headers):
    created = _create_assignment(client, org_headers, ratio=0.6).json()

    response = client.put(
        f"/api/v1/assignments/{created['id']}",
        json={
            "person_id": "person-1",
            "project_id": "project-1",
            "ratio": 0.5,
            "start": "2026-01-01",
            "end": "2026-01-31",
        },
        headers=org_headers,
    )

    assert response.status_code == 422


def test_float_round_off_does_not_block_a_full_allocation(client, org_headers):
    # 0.2 + 0.4 + 0.4 sums to 1.0000000000000002 in floating point.
    for ratio in (0.2, 0.4, 0.4):
        response = _create_assignment(client, org_headers, ratio=ratio)
        assert response.status_code == 201
