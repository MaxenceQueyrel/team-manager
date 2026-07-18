from datetime import date

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.assignment import Assignment
from api.models.person import Person
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module
from api.v1 import people as people_module
from optimizer.models import AvailabilityWindow, Seniority


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(people_module, "repo", FileRepository("people", Person))
    monkeypatch.setattr(assignments_module, "repo", FileRepository("assignments", Assignment))
    return TestClient(app)


def _create_person(client, **overrides):
    payload = {
        "name": "Alice Martin",
        "role": "Backend Developer",
        "seniority": Seniority.SENIOR,
        "years_of_experience": 8.0,
        "fte_capacity": 1.0,
        "availability_windows": [],
        **overrides,
    }
    response = client.post("/api/v1/people/", json=payload)
    assert response.status_code == 201
    return response.json()


def test_empty_windows_falls_back_to_flat_capacity(client):
    person = _create_person(client, fte_capacity=0.6)

    response = client.get(
        "/api/v1/people/availability",
        params={"start": "2026-01-01", "end": "2026-01-10"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body == [
        {
            "person_id": person["id"],
            "segments": [{"start": "2026-01-01", "end": "2026-01-10", "ratio": 0.6}],
        }
    ]


def test_partial_period_overlap_splits_into_segments(client):
    window = AvailabilityWindow(
        start=date(2026, 1, 5), end=date(2026, 1, 31), ratio=0.5
    ).model_dump(mode="json")
    person = _create_person(client, fte_capacity=1.0, availability_windows=[window])

    response = client.get(
        "/api/v1/people/availability",
        params={"start": "2026-01-01", "end": "2026-01-10"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body == [
        {
            "person_id": person["id"],
            "segments": [
                {"start": "2026-01-01", "end": "2026-01-04", "ratio": 1.0},
                {"start": "2026-01-05", "end": "2026-01-10", "ratio": 0.5},
            ],
        }
    ]


def test_missing_date_params_returns_422(client):
    response = client.get("/api/v1/people/availability")
    assert response.status_code == 422


def test_end_before_start_returns_400(client):
    _create_person(client)
    response = client.get(
        "/api/v1/people/availability",
        params={"start": "2026-01-10", "end": "2026-01-01"},
    )
    assert response.status_code == 400


def test_assignment_reduces_computed_availability(client):
    person = _create_person(client, fte_capacity=1.0)
    assignment_response = client.post(
        "/api/v1/assignments/",
        json={
            "person_id": person["id"],
            "project_id": "project-1",
            "ratio": 0.4,
            "start": "2026-01-01",
            "end": "2026-01-10",
        },
    )
    assert assignment_response.status_code == 201

    response = client.get(
        "/api/v1/people/availability",
        params={"start": "2026-01-01", "end": "2026-01-10"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body == [
        {
            "person_id": person["id"],
            "segments": [{"start": "2026-01-01", "end": "2026-01-10", "ratio": 0.6}],
        }
    ]


def test_availability_window_overrides_assignment_reduction(client):
    window = AvailabilityWindow(start=date(2026, 1, 1), end=date(2026, 1, 5), ratio=0.0).model_dump(mode="json")
    person = _create_person(client, fte_capacity=1.0, availability_windows=[window])
    client.post(
        "/api/v1/assignments/",
        json={
            "person_id": person["id"],
            "project_id": "project-1",
            "ratio": 0.4,
            "start": "2026-01-01",
            "end": "2026-01-10",
        },
    )

    response = client.get(
        "/api/v1/people/availability",
        params={"start": "2026-01-01", "end": "2026-01-10"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body == [
        {
            "person_id": person["id"],
            "segments": [
                {"start": "2026-01-01", "end": "2026-01-05", "ratio": 0.0},
                {"start": "2026-01-06", "end": "2026-01-10", "ratio": 0.6},
            ],
        }
    ]
