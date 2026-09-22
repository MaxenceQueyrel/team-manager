import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.person import Person
from api.models.role import Role as RoleCatalogEntry
from api.models.skill import Skill as SkillCatalogEntry
from api.repositories.file_repository import FileRepository
from api.v1 import people as people_module
from api.v1 import roles as roles_module
from api.v1 import skills as skills_module
from optimizer.models import Seniority
from tests.conftest import create_org


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(people_module, "repo", FileRepository("people", Person))
    monkeypatch.setattr(roles_module, "repo", FileRepository("roles", RoleCatalogEntry))
    monkeypatch.setattr(
        skills_module, "repo", FileRepository("skills", SkillCatalogEntry)
    )
    return TestClient(app)


def _ensure_role(client, headers, role_id):
    """Direct person create/update requires an existing Role (CSV import auto-creates it)."""
    client.post("/api/v1/roles/", json={"id": role_id}, headers=headers)


def _create_person(client, headers, **overrides):
    payload = {
        "name": "Alice Martin",
        "role": "Backend Developer",
        "seniority": Seniority.SENIOR,
        "years_of_experience": 8.0,
        "fte_capacity": 1.0,
        **overrides,
    }
    _ensure_role(client, headers, payload["role"])
    response = client.post("/api/v1/people/", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()


def _upload_csv(client, headers, csv_text):
    return client.post(
        "/api/v1/people/import",
        files={"file": ("people.csv", csv_text, "text/csv")},
        headers=headers,
    )


_CSV_FIELDNAMES = (
    "id",
    "name",
    "role",
    "seniority",
    "years_of_experience",
    "fte_capacity",
    "manager_id",
    "skills",
    "availability_windows",
    "preferences",
    "growth_targets",
    "affinities",
)


def _row_values(**overrides):
    row = {
        "id": "p1",
        "name": "Bob Nguyen",
        "role": "Frontend Developer",
        "seniority": "mid",
        "years_of_experience": "4.0",
        "fte_capacity": "1.0",
        "manager_id": "",
        "skills": "[]",
        "availability_windows": "[]",
        "preferences": "[]",
        "growth_targets": "[]",
        "affinities": "{}",
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


def test_import_creates_new_people(client, org_headers):
    _ensure_role(client, org_headers, "Frontend Developer")
    response = _upload_csv(client, org_headers, _csv_row())

    assert response.status_code == 200
    assert response.json() == {
        "created": ["p1"],
        "skipped": [],
        "created_roles": [],
        "created_skills": [],
    }

    person = client.get("/api/v1/people/p1", headers=org_headers).json()
    assert person["name"] == "Bob Nguyen"
    assert person["seniority"] == "mid"
    assert person["years_of_experience"] == 4.0


def test_import_skips_existing_ids(client, org_headers):
    existing = _create_person(client, org_headers, name="Existing Person")
    _ensure_role(client, org_headers, "Frontend Developer")
    csv_text = _csv_rows({"id": existing["id"]}, {"id": "p2"})

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 200
    body = response.json()
    assert body["skipped"] == [existing["id"]]
    assert body["created"] == ["p2"]

    unchanged = client.get(f"/api/v1/people/{existing['id']}", headers=org_headers)
    assert unchanged.json()["name"] == "Existing Person"


def test_import_rejects_bad_enum_value(client, org_headers):
    response = _upload_csv(client, org_headers, _csv_row(seniority="wizard"))

    assert response.status_code == 400
    assert "Row 2" in response.json()["detail"]
    assert client.get("/api/v1/people/p1", headers=org_headers).status_code == 404


def test_import_rejects_out_of_range_skill_level(client, org_headers):
    csv_text = _csv_row(skills='[{"id": "python", "level": 9}]')

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 400
    assert "Row 2" in response.json()["detail"]


def test_import_rejects_malformed_json_cell(client, org_headers):
    csv_text = _csv_row(skills="not-json")

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 400
    assert "Row 2" in response.json()["detail"]


def test_import_fails_closed_on_partial_bad_row(client, org_headers):
    csv_text = _csv_rows({"id": "good"}, {"id": "bad", "seniority": "wizard"})

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 400
    assert client.get("/api/v1/people/good", headers=org_headers).status_code == 404


def test_import_creates_missing_role(client, org_headers):
    response = _upload_csv(client, org_headers, _csv_row(role="Ghost Role"))

    assert response.status_code == 200
    body = response.json()
    assert body["created"] == ["p1"]
    assert body["created_roles"] == ["Ghost Role"]
    assert client.get("/api/v1/people/p1", headers=org_headers).status_code == 200

    roles = {r["id"] for r in client.get("/api/v1/roles/", headers=org_headers).json()}
    assert "Ghost Role" in roles


def test_import_does_not_recreate_an_existing_role(client, org_headers):
    _ensure_role(client, org_headers, "Frontend Developer")

    response = _upload_csv(client, org_headers, _csv_row())

    assert response.status_code == 200
    assert response.json()["created_roles"] == []


def test_import_with_a_blank_role_does_not_create_a_junk_catalog_entry(
    client, org_headers
):
    response = _upload_csv(client, org_headers, _csv_row(role=""))

    assert response.status_code == 200
    assert response.json()["created_roles"] == []
    assert client.get("/api/v1/roles/", headers=org_headers).json() == []


def test_import_creates_missing_skills_from_skills_preferences_and_growth_targets(
    client, org_headers
):
    csv_text = _csv_row(
        skills='[{"id": "python", "description": "Python", "level": 3}]',
        preferences='["rust"]',
        growth_targets='["go"]',
    )

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 200
    body = response.json()
    assert set(body["created_skills"]) == {"python", "rust", "go"}

    skills = {
        s["id"]: s["description"]
        for s in client.get("/api/v1/skills/", headers=org_headers).json()
    }
    assert skills["python"] == "Python"
    assert skills["rust"] == ""
    assert skills["go"] == ""


def test_import_does_not_recreate_an_existing_skill(client, org_headers):
    client.post(
        "/api/v1/skills/",
        json={"id": "react", "description": "React"},
        headers=org_headers,
    )
    csv_text = _csv_row(skills='[{"id": "react", "level": 3}]')

    response = _upload_csv(client, org_headers, csv_text)

    assert response.status_code == 200
    assert response.json()["created_skills"] == []
    skill = client.get("/api/v1/skills/react", headers=org_headers).json()
    assert skill["description"] == "React"


def test_export_round_trips_through_import(client, org_headers):
    alice = _create_person(client, org_headers, name="Alice Martin")
    carol = _create_person(client, org_headers, name="Carol Diaz", role="Designer")

    export_response = client.get("/api/v1/people/export", headers=org_headers)
    assert export_response.status_code == 200
    assert export_response.headers["content-type"].startswith("text/csv")
    csv_text = export_response.text

    other_org_headers = {
        **org_headers,
        "X-Organization-Id": create_org(client, org_headers, name="Other Org"),
    }
    _ensure_role(client, other_org_headers, "Backend Developer")
    _ensure_role(client, other_org_headers, "Designer")
    response = _upload_csv(client, other_org_headers, csv_text)

    assert response.status_code == 200
    body = response.json()
    assert body["skipped"] == []
    assert set(body["created"]) == {alice["id"], carol["id"]}

    imported_alice = client.get(
        f"/api/v1/people/{alice['id']}", headers=other_org_headers
    ).json()
    assert imported_alice["name"] == "Alice Martin"
    assert imported_alice["role"] == "Backend Developer"
