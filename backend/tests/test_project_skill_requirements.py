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


PYTHON = {"id": "python", "min_level": 3, "fte": 1.6}
REACT = {"id": "react", "min_level": 2, "fte": 0.4}


def _create(client, headers, **fields):
    return client.post(
        "/api/v1/projects/", json={"name": "Apollo", **fields}, headers=headers
    )


def _error_message(response) -> str:
    return response.json()["detail"][0]["msg"]


def test_skill_needs_round_trip_with_default_max_people(client, org_headers):
    response = _create(
        client,
        org_headers,
        skill_requirements=[PYTHON, {**REACT, "max_people": 2}],
    )

    assert response.status_code == 201
    project = response.json()
    assert "n_slots" not in project
    assert [
        (r["id"], r["fte"], r["max_people"]) for r in project["skill_requirements"]
    ] == [("python", 1.6, 2), ("react", 0.4, 2)]


def test_n_slots_is_ignored(client, org_headers):
    response = _create(
        client, org_headers, n_slots=3, skill_requirements=[ONE_FTE_NEED]
    )

    assert response.status_code == 201
    assert "n_slots" not in response.json()


def test_project_without_skill_requirement_is_rejected(client, org_headers):
    response = _create(client, org_headers)

    assert response.status_code == 422
    assert "The project needs at least one skill requirement" in _error_message(
        response
    )


def test_phase_without_skill_requirement_is_rejected(client, org_headers):
    response = _create(
        client,
        org_headers,
        phases=[
            {"id": "design", "skill_requirements": [REACT]},
            {"id": "build", "skill_requirements": []},
        ],
    )

    assert response.status_code == 422
    assert "Phase 'build' needs at least one skill requirement" in _error_message(
        response
    )


def test_phased_project_needs_no_top_level_skill_requirement(client, org_headers):
    response = _create(
        client, org_headers, phases=[{"id": "build", "skill_requirements": [PYTHON]}]
    )

    assert response.status_code == 201


def test_duplicate_skill_in_project_is_rejected(client, org_headers):
    response = _create(
        client, org_headers, skill_requirements=[PYTHON, {**PYTHON, "fte": 1}]
    )

    assert response.status_code == 422
    assert "The project requires skill 'python' more than once" in _error_message(
        response
    )


def test_duplicate_skill_in_phase_is_rejected(client, org_headers):
    response = _create(
        client,
        org_headers,
        phases=[{"id": "build", "skill_requirements": [REACT, REACT]}],
    )

    assert response.status_code == 422
    assert "Phase 'build' requires skill 'react' more than once" in _error_message(
        response
    )


def test_same_skill_in_different_phases_is_allowed(client, org_headers):
    response = _create(
        client,
        org_headers,
        phases=[
            {"id": "design", "skill_requirements": [REACT]},
            {"id": "build", "skill_requirements": [REACT]},
        ],
    )

    assert response.status_code == 201


@pytest.mark.parametrize(
    ("requirement", "message"),
    [
        ({**PYTHON, "fte": 0.5}, "fte must be a multiple of 0.2"),
        ({**PYTHON, "fte": 0}, "greater than or equal to 0.2"),
        ({**PYTHON, "max_people": 1}, "max_people must be between 2 and 8"),
        ({**PYTHON, "max_people": 9}, "max_people must be between 2 and 8"),
        ({"id": "python", "min_level": 3}, "Field required"),
    ],
    ids=["off-grid", "zero", "too-few-people", "too-many-people", "missing-fte"],
)
def test_invalid_skill_need_is_rejected(client, org_headers, requirement, message):
    response = _create(client, org_headers, skill_requirements=[requirement])

    assert response.status_code == 422
    assert message in _error_message(response)


def test_update_without_skill_requirement_is_rejected(client, org_headers):
    project = _create(client, org_headers, skill_requirements=[PYTHON]).json()

    response = client.put(
        f"/api/v1/projects/{project['id']}",
        json={"name": "Apollo", "skill_requirements": []},
        headers=org_headers,
    )

    assert response.status_code == 422
    stored = client.get(f"/api/v1/projects/{project['id']}", headers=org_headers)
    assert stored.json()["skill_requirements"][0]["id"] == "python"
