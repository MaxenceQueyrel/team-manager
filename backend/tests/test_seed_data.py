from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.assignment import Assignment
from api.models.person import Person
from api.models.project import Project
from api.models.role import Role as RoleCatalogEntry
from api.models.skill import Skill
from api.models.team import Team
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module
from api.v1 import people as people_module
from api.v1 import projects as projects_module
from api.v1 import roles as roles_module
from api.v1 import skills as skills_module
from api.v1 import teams as teams_module
from optimizer.grid import is_on_grid

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(people_module, "repo", FileRepository("people", Person))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    monkeypatch.setattr(teams_module, "repo", FileRepository("teams", Team))
    monkeypatch.setattr(roles_module, "repo", FileRepository("roles", RoleCatalogEntry))
    monkeypatch.setattr(skills_module, "repo", FileRepository("skills", Skill))
    monkeypatch.setattr(
        assignments_module, "repo", FileRepository("assignments", Assignment)
    )
    return TestClient(app)


@pytest.fixture
def seeded_headers(client, org_headers):
    for entity in ("people", "projects"):
        csv_text = (FIXTURES / f"{entity}_import_example.csv").read_text()
        response = client.post(
            f"/api/v1/{entity}/import",
            files={"file": (f"{entity}.csv", csv_text, "text/csv")},
            headers=org_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["skipped"] == []
    return org_headers


def test_every_open_seed_project_is_staffable(client, seeded_headers):
    projects = client.get("/api/v1/projects/", headers=seeded_headers).json()
    open_projects = [p for p in projects if p["completed_at"] is None]
    assert len(open_projects) == 13

    for project in open_projects:
        response = client.post(
            "/api/v1/optimization/solve",
            json={"project_id": project["id"], "n_alternatives": 0},
            headers=seeded_headers,
        )

        assert response.status_code == 200, (project["id"], response.text)
        best = response.json()["best"]
        assert best["fully_covered"] is True, (project["id"], best["coverage"])
        assert all(is_on_grid(m["fte_allocation"]) for m in best["members"])
