import json

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.person import Person
from api.models.role import Role as RoleCatalogEntry
from api.repositories.file_repository import FileRepository
from api.v1 import people as people_module
from api.v1 import roles as roles_module
from optimizer.models import Seniority


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(people_module, "repo", FileRepository("people", Person))
    monkeypatch.setattr(roles_module, "repo", FileRepository("roles", RoleCatalogEntry))
    return TestClient(app)


@pytest.fixture
def org_headers(client, org_headers):
    client.post("/api/v1/roles/", json={"id": "Backend Developer"}, headers=org_headers)
    return org_headers


def _payload(**overrides):
    return {
        "name": "Alice Martin",
        "role": "Backend Developer",
        "seniority": Seniority.SENIOR,
        "years_of_experience": 8.0,
        **overrides,
    }


def test_new_person_defaults_to_a_full_week_and_no_vacations(client, org_headers):
    response = client.post("/api/v1/people/", json=_payload(), headers=org_headers)

    assert response.status_code == 201
    body = response.json()
    assert body["working_days_per_week"] == 5
    assert body["vacations"] == []
    assert body["base_capacity"] == 1.0
    assert "fte_capacity" not in body


@pytest.mark.parametrize(("days", "capacity"), [(1, 0.2), (4, 0.8), (6, 1.0), (7, 1.0)])
def test_base_capacity_is_derived_from_the_working_pattern(
    client, org_headers, days, capacity
):
    created = client.post(
        "/api/v1/people/",
        json=_payload(working_days_per_week=days),
        headers=org_headers,
    ).json()

    fetched = client.get(f"/api/v1/people/{created['id']}", headers=org_headers)

    assert created["base_capacity"] == capacity
    assert fetched.json()["base_capacity"] == capacity


@pytest.mark.parametrize("days", [0, 8])
def test_working_days_per_week_out_of_range_is_rejected(client, org_headers, days):
    response = client.post(
        "/api/v1/people/",
        json=_payload(working_days_per_week=days),
        headers=org_headers,
    )

    assert response.status_code == 422


def test_vacations_round_trip_through_create_and_update(client, org_headers):
    vacation = {"start": "2026-07-01", "end": "2026-07-15"}
    created = client.post(
        "/api/v1/people/", json=_payload(vacations=[vacation]), headers=org_headers
    ).json()
    assert created["vacations"] == [vacation]

    updated = client.put(
        f"/api/v1/people/{created['id']}",
        json=_payload(vacations=[]),
        headers=org_headers,
    )

    assert updated.json()["vacations"] == []


def test_legacy_record_with_fte_capacity_loads_with_defaults_and_is_dropped_on_save(
    client, org_headers, tmp_path
):
    organization_id = org_headers["X-Organization-Id"]
    legacy = {
        **_payload(seniority="senior"),
        "id": "legacy",
        "organization_id": organization_id,
        "fte_capacity": 0.6,
    }
    (tmp_path / "people.json").write_text(json.dumps([legacy]))

    loaded = client.get("/api/v1/people/legacy", headers=org_headers).json()

    assert loaded["working_days_per_week"] == 5
    assert loaded["vacations"] == []
    assert loaded["base_capacity"] == 1.0
    assert "fte_capacity" not in loaded

    client.put("/api/v1/people/legacy", json=_payload(), headers=org_headers)

    stored = json.loads((tmp_path / "people.json").read_text())
    assert "fte_capacity" not in stored[0]
    assert "base_capacity" not in stored[0]
