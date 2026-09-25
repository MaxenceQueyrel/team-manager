import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.project import Project
from api.repositories.file_repository import FileRepository
from api.v1 import projects as projects_module
from tests.conftest import create_org


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    return TestClient(app)


def _create_project(client, headers, **overrides):
    payload = {
        "name": "Atlas Migration",
        "description": "Migrate legacy billing to Atlas",
        "n_slots": 3,
        "priority": "high",
        "skill_requirements": [
            {"id": "python", "description": "Python", "min_level": 3.0}
        ],
        "excluded_person_ids": ["p-carol"],
        "included_person_ids": ["p-alice"],
        "squads": [{"member_ids": ["p-alice", "p-bob"]}],
        "date_ranges": [{"start": "2026-07-01", "end": "2026-09-30"}],
        "phases": [],
        **overrides,
    }
    response = client.post("/api/v1/projects/", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()


def _upload_csv(client, headers, csv_text):
    return client.post(
        "/api/v1/projects/import",
        files={"file": ("projects.csv", csv_text, "text/csv")},
        headers=headers,
    )


_CSV_FIELDNAMES = (
    "id",
    "name",
    "description",
    "n_slots",
    "priority",
    "skill_requirements",
    "excluded_person_ids",
    "included_person_ids",
    "squads",
    "date_ranges",
    "phases",
)


def _row_values(**overrides):
    row = {
        "id": "proj-1",
        "name": "Nova Redesign",
        "description": "",
        "n_slots": "1",
        "priority": "medium",
        "skill_requirements": "[]",
        "excluded_person_ids": "[]",
        "included_person_ids": "[]",
        "squads": "[]",
        "date_ranges": "[]",
        "phases": "[]",
        **overrides,
    }

    def _cell(value: str) -> str:
        if "," in value or '"' in value:
            return '"{}"'.format(value.replace('"', '""'))
        return value

    return ",".join(_cell(row[field]) for field in _CSV_FIELDNAMES)


def _csv_row(**overrides):
    return f"{','.join(_CSV_FIELDNAMES)}\n{_row_values(**overrides)}\n"


def _csv_rows(*row_overrides):
    header = ",".join(_CSV_FIELDNAMES)
    lines = "\n".join(_row_values(**overrides) for overrides in row_overrides)
    return f"{header}\n{lines}\n"


def test_import_creates_new_projects(client, org_headers):
    response = _upload_csv(client, org_headers, _csv_row())

    assert response.status_code == 200
    assert response.json() == {"created": ["proj-1"], "skipped": []}

    project = client.get("/api/v1/projects/proj-1", headers=org_headers).json()
    assert project["name"] == "Nova Redesign"
    assert project["n_slots"] == 1
    assert project["priority"] == "medium"


def test_import_skips_existing_ids(client, org_headers):
    existing = _create_project(client, org_headers, name="Existing Project")
    csv_text = _csv_rows({"id": existing["id"]}, {"id": "proj-2"})

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 200
    body = response.json()
    assert body["skipped"] == [existing["id"]]
    assert body["created"] == ["proj-2"]

    unchanged = client.get(f"/api/v1/projects/{existing['id']}", headers=org_headers)
    assert unchanged.json()["name"] == "Existing Project"


def test_import_rejects_missing_column(client, org_headers):
    csv_text = "id,name\nproj-1,Nova Redesign\n"

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 400
    assert "Row 2" in response.json()["detail"]
    assert client.get("/api/v1/projects/proj-1", headers=org_headers).status_code == 404


def test_import_rejects_malformed_json_cell(client, org_headers):
    csv_text = _csv_row(skill_requirements="not-json")

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 400
    assert "Row 2" in response.json()["detail"]


def test_import_rejects_invalid_field_value(client, org_headers):
    csv_text = _csv_row(n_slots="0")

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 400
    assert "Row 2" in response.json()["detail"]
    assert client.get("/api/v1/projects/proj-1", headers=org_headers).status_code == 404


def test_import_fails_closed_on_partial_bad_row(client, org_headers):
    csv_text = _csv_rows({"id": "good"}, {"id": "bad", "n_slots": "0"})

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 400
    assert client.get("/api/v1/projects/good", headers=org_headers).status_code == 404


def test_import_does_not_validate_skill_or_person_ids(client, org_headers):
    """Unlike People import, referenced skill/person ids are stored as-is."""
    csv_text = _csv_row(
        skill_requirements='[{"id": "ghost-skill", "min_level": 2.0}]',
        excluded_person_ids='["ghost-person"]',
    )

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 200
    project = client.get("/api/v1/projects/proj-1", headers=org_headers).json()
    assert project["skill_requirements"][0]["id"] == "ghost-skill"
    assert project["excluded_person_ids"] == ["ghost-person"]


def test_export_round_trips_through_import(client, org_headers):
    atlas = _create_project(client, org_headers, name="Atlas Migration")
    nova = _create_project(client, org_headers, name="Nova Redesign", n_slots=1)

    export_response = client.get("/api/v1/projects/export", headers=org_headers)
    assert export_response.status_code == 200
    assert export_response.headers["content-type"].startswith("text/csv")
    csv_text = export_response.text

    other_org_headers = {
        **org_headers,
        "X-Organization-Id": create_org(client, org_headers, name="Other Org"),
    }
    response = _upload_csv(client, other_org_headers, csv_text)

    assert response.status_code == 200
    body = response.json()
    assert body["skipped"] == []
    assert set(body["created"]) == {atlas["id"], nova["id"]}

    imported_atlas = client.get(
        f"/api/v1/projects/{atlas['id']}", headers=other_org_headers
    ).json()
    assert imported_atlas["name"] == "Atlas Migration"
    assert imported_atlas["squads"] == [{"member_ids": ["p-alice", "p-bob"]}]


def test_export_and_import_are_org_scoped(client, org_headers):
    _create_project(client, org_headers, name="Atlas Migration")

    other_org_headers = {
        **org_headers,
        "X-Organization-Id": create_org(client, org_headers, name="Other Org"),
    }
    export_response = client.get("/api/v1/projects/export", headers=other_org_headers)

    assert export_response.status_code == 200
    assert export_response.text.strip() == ",".join(_CSV_FIELDNAMES)
