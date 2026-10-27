import json

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.project import Project
from api.repositories.file_repository import FileRepository
from api.v1 import projects as projects_module
from tests.conftest import ONE_FTE_NEED, create_org


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    return TestClient(app)


def _create_project(client, headers, **overrides):
    payload = {
        "name": "Atlas Migration",
        "description": "Migrate legacy billing to Atlas",
        "priority": "high",
        "skill_requirements": [
            {
                "id": "python",
                "description": "Python",
                "min_level": 3.0,
                "fte": 1.6,
                "max_people": 3,
            },
            {"id": "sql", "description": "SQL", "min_level": 2.5, "fte": 1.0},
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
    "priority",
    "completed_at",
    "skill_requirements",
    "excluded_person_ids",
    "included_person_ids",
    "squads",
    "date_ranges",
    "phases",
    "start_window",
)


def _row_values(**overrides):
    row = {
        "id": "proj-1",
        "name": "Nova Redesign",
        "description": "",
        "priority": "medium",
        "completed_at": "",
        "skill_requirements": json.dumps([ONE_FTE_NEED]),
        "excluded_person_ids": "[]",
        "included_person_ids": "[]",
        "squads": "[]",
        "date_ranges": "[]",
        "phases": "[]",
        "start_window": "",
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
    assert "n_slots" not in project
    assert project["skill_requirements"] == [
        {**ONE_FTE_NEED, "description": "", "max_people": 1}
    ]
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


@pytest.mark.parametrize(
    "skill_requirements",
    [
        [],
        [{"id": "python", "min_level": 2.0, "fte": 0.5}],
        [{"id": "python", "min_level": 2.0, "fte": 1.0, "max_people": 6}],
    ],
    ids=["no-skill", "off-grid-fte", "max-people-out-of-range"],
)
def test_import_rejects_invalid_field_value(client, org_headers, skill_requirements):
    csv_text = _csv_row(skill_requirements=json.dumps(skill_requirements))

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 400
    assert "Row 2" in response.json()["detail"]
    assert client.get("/api/v1/projects/proj-1", headers=org_headers).status_code == 404


def test_import_rejects_an_unknown_priority(client, org_headers):
    response = _upload_csv(client, org_headers, _csv_row(priority="urgent"))

    assert response.status_code == 400
    assert "Row 2" in response.json()["detail"]


def test_import_fails_closed_on_partial_bad_row(client, org_headers):
    csv_text = _csv_rows({"id": "good"}, {"id": "bad", "skill_requirements": "[]"})

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 400
    assert client.get("/api/v1/projects/good", headers=org_headers).status_code == 404


def test_import_does_not_validate_skill_or_person_ids(client, org_headers):
    """Unlike People import, referenced skill/person ids are stored as-is."""
    csv_text = _csv_row(
        skill_requirements='[{"id": "ghost-skill", "min_level": 2.0, "fte": 1.0}]',
        excluded_person_ids='["ghost-person"]',
    )

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 200
    project = client.get("/api/v1/projects/proj-1", headers=org_headers).json()
    assert project["skill_requirements"][0]["id"] == "ghost-skill"
    assert project["excluded_person_ids"] == ["ghost-person"]


def test_export_round_trips_through_import(client, org_headers):
    atlas = _create_project(client, org_headers, name="Atlas Migration")
    nova = _create_project(
        client,
        org_headers,
        name="Nova Redesign",
        skill_requirements=[],
        phases=[
            {
                "id": "design",
                "skill_requirements": [
                    {"id": "figma", "min_level": 2.0, "fte": 0.6, "max_people": 2}
                ],
                "date_range": {"start": "2026-08-01", "end": "2026-08-31"},
            }
        ],
    )

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
    assert imported_atlas["skill_requirements"] == atlas["skill_requirements"]
    imported_nova = client.get(
        f"/api/v1/projects/{nova['id']}", headers=other_org_headers
    ).json()
    assert imported_nova["phases"] == nova["phases"]


def test_export_and_import_are_org_scoped(client, org_headers):
    _create_project(client, org_headers, name="Atlas Migration")

    other_org_headers = {
        **org_headers,
        "X-Organization-Id": create_org(client, org_headers, name="Other Org"),
    }
    export_response = client.get("/api/v1/projects/export", headers=other_org_headers)

    assert export_response.status_code == 200
    assert export_response.text.strip() == ",".join(_CSV_FIELDNAMES)


def test_import_reads_completed_at(client, org_headers):
    response = _upload_csv(client, org_headers, _csv_row(completed_at="2026-09-30"))

    assert response.status_code == 200
    project = client.get("/api/v1/projects/proj-1", headers=org_headers).json()
    assert project["completed_at"] == "2026-09-30"


def test_import_treats_empty_completed_at_as_open(client, org_headers):
    response = _upload_csv(client, org_headers, _csv_row())

    assert response.status_code == 200
    project = client.get("/api/v1/projects/proj-1", headers=org_headers).json()
    assert project["completed_at"] is None


def test_import_accepts_legacy_csv_without_completed_at_column(client, org_headers):
    legacy_fieldnames = [
        f for f in _CSV_FIELDNAMES if f not in ("completed_at", "start_window")
    ]
    skills_cell = '"[{""id"": ""general"", ""min_level"": 0, ""fte"": 1}]"'
    csv_text = (
        f"{','.join(legacy_fieldnames)}\n"
        f"proj-1,Nova Redesign,,medium,{skills_cell},[],[],[],[],[]\n"
    )

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 200
    project = client.get("/api/v1/projects/proj-1", headers=org_headers).json()
    assert project["completed_at"] is None
    assert project["start_window"] is None


def test_import_rejects_invalid_completed_at(client, org_headers):
    response = _upload_csv(client, org_headers, _csv_row(completed_at="not-a-date"))

    assert response.status_code == 400
    assert "Row 2" in response.json()["detail"]


def test_export_round_trips_completed_at(client, org_headers):
    done = _create_project(
        client, org_headers, name="Done Project", completed_at="2026-09-30"
    )
    open_project = _create_project(client, org_headers, name="Open Project")

    csv_text = client.get("/api/v1/projects/export", headers=org_headers).text
    other_org_headers = {
        **org_headers,
        "X-Organization-Id": create_org(client, org_headers, name="Other Org"),
    }
    assert _upload_csv(client, other_org_headers, csv_text).status_code == 200

    imported_done = client.get(
        f"/api/v1/projects/{done['id']}", headers=other_org_headers
    ).json()
    imported_open = client.get(
        f"/api/v1/projects/{open_project['id']}", headers=other_org_headers
    ).json()
    assert imported_done["completed_at"] == "2026-09-30"
    assert imported_open["completed_at"] is None


WINDOW = {"start": "2026-06-01", "end": "2026-07-31"}


@pytest.mark.parametrize("cell", ["", "null"])
def test_import_treats_empty_or_null_start_window_as_none(client, org_headers, cell):
    response = _upload_csv(client, org_headers, _csv_row(start_window=cell))

    assert response.status_code == 200
    project = client.get("/api/v1/projects/proj-1", headers=org_headers).json()
    assert project["start_window"] is None


def test_import_rejects_start_window_on_undated_project(client, org_headers):
    response = _upload_csv(
        client, org_headers, _csv_row(start_window=json.dumps(WINDOW))
    )

    assert response.status_code == 400
    assert "Row 2" in response.json()["detail"]


def test_export_round_trips_start_window(client, org_headers):
    flexible = _create_project(
        client, org_headers, name="Flexible", start_window=WINDOW
    )
    fixed = _create_project(client, org_headers, name="Fixed")

    csv_text = client.get("/api/v1/projects/export", headers=org_headers).text
    other_org_headers = {
        **org_headers,
        "X-Organization-Id": create_org(client, org_headers, name="Other Org"),
    }
    assert _upload_csv(client, other_org_headers, csv_text).status_code == 200

    imported_flexible = client.get(
        f"/api/v1/projects/{flexible['id']}", headers=other_org_headers
    ).json()
    imported_fixed = client.get(
        f"/api/v1/projects/{fixed['id']}", headers=other_org_headers
    ).json()
    assert imported_flexible["start_window"] == WINDOW
    assert imported_fixed["start_window"] is None


def test_import_ignores_a_legacy_n_slots_column(client, org_headers):
    header = ",".join([*_CSV_FIELDNAMES, "n_slots"])
    csv_text = f"{header}\n{_row_values()},3\n"

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 200
    project = client.get("/api/v1/projects/proj-1", headers=org_headers).json()
    assert "n_slots" not in project
