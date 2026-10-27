import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.assignment import Assignment
from api.models.person import Person
from api.models.project import Project
from api.models.role import Role as RoleCatalogEntry
from api.models.team import Team
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module
from api.v1 import people as people_module
from api.v1 import projects as projects_module
from api.v1 import roles as roles_module
from api.v1 import teams as teams_module
from optimizer.models import Seniority
from tests.conftest import ONE_FTE_NEED, create_org, register_and_login


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(people_module, "repo", FileRepository("people", Person))
    monkeypatch.setattr(projects_module, "repo", FileRepository("projects", Project))
    monkeypatch.setattr(teams_module, "repo", FileRepository("teams", Team))
    monkeypatch.setattr(roles_module, "repo", FileRepository("roles", RoleCatalogEntry))
    monkeypatch.setattr(
        assignments_module, "repo", FileRepository("assignments", Assignment)
    )
    return TestClient(app)


@pytest.fixture
def org_headers(client, org_headers):
    """Person.role must reference an existing Role catalog entry."""
    client.post("/api/v1/roles/", json={"id": "Backend Developer"}, headers=org_headers)
    return org_headers


NOVEMBER = {"start": "2026-11-01", "end": "2026-11-30"}


def _create_person(client, headers, name, **overrides) -> str:
    response = client.post(
        "/api/v1/people/",
        json={
            "name": name,
            "role": "Backend Developer",
            "seniority": Seniority.SENIOR,
            "years_of_experience": 5.0,
            **overrides,
        },
        headers=headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


def _create_project(client, headers, name, **overrides) -> str:
    response = client.post(
        "/api/v1/projects/",
        json={
            "name": name,
            "skill_requirements": [ONE_FTE_NEED],
            "date_ranges": [NOVEMBER],
            **overrides,
        },
        headers=headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


def _assign(client, headers, person_id, project_id):
    response = client.post(
        "/api/v1/assignments/",
        json={
            "person_id": person_id,
            "project_id": project_id,
            "ratio": 1.0,
            **NOVEMBER,
        },
        headers=headers,
    )
    assert response.status_code == 201


def _solve_batch(client, headers, project_ids, **overrides):
    return client.post(
        "/api/v1/optimization/solve-batch",
        json={"project_ids": project_ids, **overrides},
        headers=headers,
    )


def _member_ids(team):
    return [m["person_id"] for m in team["members"]]


def test_solve_batch_saves_one_team_per_project_in_request_order(client, org_headers):
    for i in range(3):
        _create_person(client, org_headers, f"Person {i}")
    project_ids = [
        _create_project(client, org_headers, name) for name in ("A", "B", "C")
    ]

    response = _solve_batch(client, org_headers, project_ids)

    assert response.status_code == 200
    body = response.json()
    assert body["ignored_start_window_project_ids"] == []
    teams = body["teams"]
    assert [team["project_id"] for team in teams] == project_ids
    for team in teams:
        assert team["id"]
        assert team["is_optimized"] is True
        assert team["created_at"] is not None
        assert team["start_date"] is None
        assert team["fully_covered"] is True
        assert team["coverage"][0]["staffed_fte"] == 1.0
    # The three projects overlap, so nobody can be on two of them at 1.0 FTE.
    all_members = [person for team in teams for person in _member_ids(team)]
    assert len(all_members) == len(set(all_members)) == 3
    saved = client.get("/api/v1/teams/", headers=org_headers).json()
    assert {team["id"] for team in saved} == {team["id"] for team in teams}


def test_solve_batch_staffs_the_higher_priority_project_first(client, org_headers):
    bob_id = _create_person(client, org_headers, "Bob")
    low = _create_project(client, org_headers, "Low", priority="low")
    critical = _create_project(client, org_headers, "Critical", priority="critical")

    response = _solve_batch(client, org_headers, [low, critical])

    assert response.status_code == 200
    low_team, critical_team = response.json()["teams"]
    assert _member_ids(critical_team) == [bob_id]
    assert critical_team["fully_covered"] is True
    assert low_team["members"] == []
    assert low_team["fully_covered"] is False


def test_solve_batch_frees_the_selected_projects_own_assignments(client, org_headers):
    bob_id = _create_person(client, org_headers, "Bob")
    _create_person(client, org_headers, "Alice")
    project_a = _create_project(client, org_headers, "A", included_person_ids=[bob_id])
    project_b = _create_project(client, org_headers, "B")
    _assign(client, org_headers, bob_id, project_a)

    response = _solve_batch(client, org_headers, [project_a, project_b])

    assert response.status_code == 200
    assert _member_ids(response.json()["teams"][0]) == [bob_id]


def test_solve_batch_keeps_unselected_projects_assignments_as_committed_load(
    client, org_headers
):
    bob_id = _create_person(client, org_headers, "Bob")
    alice_id = _create_person(client, org_headers, "Alice")
    carol_id = _create_person(client, org_headers, "Carol")
    unselected = _create_project(client, org_headers, "Unselected")
    _assign(client, org_headers, bob_id, unselected)
    project_ids = [_create_project(client, org_headers, name) for name in ("A", "B")]

    response = _solve_batch(client, org_headers, project_ids)

    assert response.status_code == 200
    members = [p for team in response.json()["teams"] for p in _member_ids(team)]
    assert sorted(members) == sorted([alice_id, carol_id])


def test_solve_batch_flags_projects_whose_start_window_was_ignored(client, org_headers):
    for name in ("Bob", "Alice"):
        _create_person(client, org_headers, name)
    fixed = _create_project(client, org_headers, "Fixed")
    flexible = _create_project(
        client,
        org_headers,
        "Flexible",
        start_window={"start": "2026-11-01", "end": "2026-12-01"},
    )

    response = _solve_batch(client, org_headers, [fixed, flexible])

    assert response.status_code == 200
    body = response.json()
    assert body["ignored_start_window_project_ids"] == [flexible]
    assert all(team["start_date"] is None for team in body["teams"])


def test_solve_batch_result_applies_cleanly(client, org_headers):
    for i in range(3):
        _create_person(client, org_headers, f"Person {i}")
    split_need = [{**ONE_FTE_NEED, "fte": 1.6, "max_people": 2}]
    project_ids = [
        _create_project(client, org_headers, name, skill_requirements=split_need)
        for name in ("A", "B")
    ]
    teams = _solve_batch(client, org_headers, project_ids).json()["teams"]

    response = client.post(
        "/api/v1/teams/apply-batch",
        json={"team_ids": [team["id"] for team in teams]},
        headers=org_headers,
    )

    assert response.status_code == 201
    assert len(response.json()) == sum(len(team["members"]) for team in teams)
    load: dict[str, float] = {}
    for assignment in response.json():
        load[assignment["person_id"]] = (
            load.get(assignment["person_id"], 0.0) + assignment["ratio"]
        )
    assert all(total <= 1.0 + 1e-9 for total in load.values())


def test_solve_batch_result_applies_after_moving_a_person_to_a_higher_priority(
    client, org_headers
):
    bob_id = _create_person(client, org_headers, "Bob")
    low = _create_project(client, org_headers, "Low", priority="low")
    critical = _create_project(client, org_headers, "Critical", priority="critical")
    _assign(client, org_headers, bob_id, low)
    teams = _solve_batch(client, org_headers, [low, critical]).json()["teams"]
    assert teams[0]["members"] == []

    response = client.post(
        "/api/v1/teams/apply-batch",
        json={"team_ids": [team["id"] for team in teams]},
        headers=org_headers,
    )

    assert response.status_code == 201
    stored = client.get("/api/v1/assignments/", headers=org_headers).json()
    assert [(a["person_id"], a["project_id"]) for a in stored] == [(bob_id, critical)]


def test_project_with_an_unknown_priority_is_rejected(client, org_headers):
    response = client.post(
        "/api/v1/projects/",
        json={
            "name": "Apollo",
            "skill_requirements": [ONE_FTE_NEED],
            "priority": "urgent",
        },
        headers=org_headers,
    )

    assert response.status_code == 422


def test_solve_batch_returns_409_with_cross_project_forced_conflict(
    client, org_headers
):
    # Bob can give only one day a week in November but is forced into both projects.
    bob_id = _create_person(
        client,
        org_headers,
        "Bob",
        availability_windows=[{**NOVEMBER, "ratio": 0.2}],
    )
    project_ids = [
        _create_project(client, org_headers, name, included_person_ids=[bob_id])
        for name in ("A", "B")
    ]

    response = _solve_batch(client, org_headers, project_ids)

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["message"]
    assert [project["project_id"] for project in detail["projects"]] == project_ids
    for project in detail["projects"]:
        assert project["message"]
        cross = [
            c
            for c in project["conflicts"]
            if c["reason"] == "cross_project_forced_conflict"
        ]
        assert cross
        assert cross[0]["person_id"] == bob_id
        assert sorted(cross[0]["project_ids"]) == sorted(project_ids)
    assert client.get("/api/v1/teams/", headers=org_headers).json() == []


def test_solve_batch_returns_409_listing_only_the_infeasible_projects(
    client, org_headers
):
    # A 1 FTE need goes to at most one person, so forcing a squad of two into it
    # can never fit.
    squad_ids = [_create_person(client, org_headers, n) for n in "XY"]
    _create_person(client, org_headers, "Alice")
    feasible = _create_project(client, org_headers, "A")
    infeasible = _create_project(
        client,
        org_headers,
        "B",
        squads=[{"member_ids": squad_ids}],
        included_person_ids=squad_ids[:1],
    )

    response = _solve_batch(client, org_headers, [feasible, infeasible])

    assert response.status_code == 409
    projects = response.json()["detail"]["projects"]
    assert [project["project_id"] for project in projects] == [infeasible]
    assert projects[0]["conflicts"]
    assert all(
        c["reason"] != "cross_project_forced_conflict" for c in projects[0]["conflicts"]
    )
    assert client.get("/api/v1/teams/", headers=org_headers).json() == []


@pytest.mark.parametrize("count", [1, 11])
def test_solve_batch_rejects_too_few_or_too_many_projects(client, org_headers, count):
    response = _solve_batch(client, org_headers, [f"p{i}" for i in range(count)])

    assert response.status_code == 422


def test_solve_batch_rejects_duplicate_project_ids(client, org_headers):
    project_id = _create_project(client, org_headers, "A")

    response = _solve_batch(client, org_headers, [project_id, project_id])

    assert response.status_code == 422


def test_solve_batch_returns_404_for_an_unknown_project(client, org_headers):
    project_id = _create_project(client, org_headers, "A")

    response = _solve_batch(client, org_headers, [project_id, "does-not-exist"])

    assert response.status_code == 404


def test_solve_batch_returns_404_for_another_organizations_project(client, org_headers):
    project_id = _create_project(client, org_headers, "A")
    other_headers = register_and_login(client, "other-owner@example.com")
    other_org = {
        **other_headers,
        "X-Organization-Id": create_org(client, other_headers, name="Other"),
    }
    other_project = _create_project(client, other_org, "Theirs")

    response = _solve_batch(client, org_headers, [project_id, other_project])

    assert response.status_code == 404


def test_solve_batch_rejects_a_completed_project(client, org_headers):
    _create_person(client, org_headers, "Bob")
    open_project = _create_project(client, org_headers, "Open")
    done = _create_project(client, org_headers, "Done", completed_at="2026-10-01")

    response = _solve_batch(client, org_headers, [open_project, done])

    assert response.status_code == 422
    assert client.get("/api/v1/teams/", headers=org_headers).json() == []


def test_solve_batch_requires_optimization_run_permission(
    client, org_headers, unprivileged_headers
):
    # The unprivileged user joins the organization, so the 403 comes from the
    # missing permission and not from membership.
    client.post(
        f"/api/v1/organizations/{org_headers['X-Organization-Id']}/members",
        json={"email": "unprivileged@example.com"},
        headers=org_headers,
    )
    headers = {
        **unprivileged_headers,
        "X-Organization-Id": org_headers["X-Organization-Id"],
    }

    response = _solve_batch(client, headers, ["a", "b"])

    assert response.status_code == 403


def test_solve_batch_requires_organization_membership(client, manager_headers):
    response = _solve_batch(client, manager_headers, ["a", "b"])

    assert response.status_code == 422
