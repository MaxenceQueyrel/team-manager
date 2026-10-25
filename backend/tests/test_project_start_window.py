import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.project import Project
from api.repositories.file_repository import FileRepository
from api.v1 import projects as projects_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    return TestClient(app)


JANUARY = [{"start": "2026-01-05", "end": "2026-01-30"}]
WINDOW = {"start": "2026-01-05", "end": "2026-02-23"}


def _create(client, headers, **fields):
    return client.post(
        "/api/v1/projects/", json={"name": "Apollo", **fields}, headers=headers
    )


def _error_message(response) -> str:
    return response.json()["detail"][0]["msg"]


def test_valid_window_round_trips(client, org_headers):
    response = _create(client, org_headers, date_ranges=JANUARY, start_window=WINDOW)

    assert response.status_code == 201
    project_id = response.json()["id"]
    fetched = client.get(f"/api/v1/projects/{project_id}", headers=org_headers)
    assert fetched.json()["start_window"] == WINDOW


def test_window_defaults_to_none(client, org_headers):
    response = _create(client, org_headers)

    assert response.status_code == 201
    assert response.json()["start_window"] is None


def test_window_needs_no_top_level_range_when_a_phase_is_dated(client, org_headers):
    phases = [{"id": "build", "date_range": JANUARY[0]}, {"id": "undated"}]

    response = _create(client, org_headers, phases=phases, start_window=WINDOW)

    assert response.status_code == 201


def test_window_on_undated_project_is_rejected(client, org_headers):
    response = _create(
        client, org_headers, phases=[{"id": "undated"}], start_window=WINDOW
    )

    assert response.status_code == 422
    assert "at least one project or phase date range" in _error_message(response)


def test_window_ending_before_it_starts_is_rejected(client, org_headers):
    response = _create(
        client,
        org_headers,
        date_ranges=JANUARY,
        start_window={"start": "2026-02-01", "end": "2026-01-31"},
    )

    assert response.status_code == 422
    assert "must not be before its start" in _error_message(response)


@pytest.mark.parametrize(
    ("end", "status"),
    [("2026-12-30", 201), ("2026-12-31", 422)],
    ids=["52-candidates", "53-candidates"],
)
def test_window_is_capped_at_52_weekly_candidates(client, org_headers, end, status):
    # 2026-01-01 + 52 weeks is 2026-12-31, which would be the 53rd candidate.
    response = _create(
        client,
        org_headers,
        date_ranges=JANUARY,
        start_window={"start": "2026-01-01", "end": end},
    )

    assert response.status_code == status
    if status == 422:
        assert "at most 52 weekly start candidates" in _error_message(response)


def test_update_validates_the_window(client, org_headers):
    project = _create(client, org_headers, date_ranges=JANUARY).json()

    response = client.put(
        f"/api/v1/projects/{project['id']}",
        json={"name": "Apollo", "start_window": WINDOW},
        headers=org_headers,
    )

    assert response.status_code == 422
    stored = client.get(f"/api/v1/projects/{project['id']}", headers=org_headers)
    assert stored.json()["date_ranges"] == JANUARY


def test_update_can_set_and_clear_the_window(client, org_headers):
    project = _create(client, org_headers, date_ranges=JANUARY).json()
    url = f"/api/v1/projects/{project['id']}"
    body = {"name": "Apollo", "date_ranges": JANUARY}

    set_response = client.put(
        url, json={**body, "start_window": WINDOW}, headers=org_headers
    )
    cleared = client.put(url, json=body, headers=org_headers)

    assert set_response.json()["start_window"] == WINDOW
    assert cleared.json()["start_window"] is None
