from tests.conftest import register_and_login


def _create_org(client, headers, name="Acme Corp"):
    response = client.post(
        "/api/v1/organizations/", json={"name": name}, headers=headers
    )
    assert response.status_code == 201
    return response.json()


def test_create_organization_makes_creator_the_owner(client, manager_headers):
    org = _create_org(client, manager_headers)

    assert org["name"] == "Acme Corp"

    list_response = client.get("/api/v1/organizations/", headers=manager_headers)
    assert list_response.status_code == 200
    memberships = list_response.json()
    assert len(memberships) == 1
    assert memberships[0]["id"] == org["id"]
    assert memberships[0]["role"] == "owner"


def test_list_organizations_only_returns_current_users_memberships(client):
    owner_headers = register_and_login(client, "owner@example.com")
    other_headers = register_and_login(client, "other@example.com")
    _create_org(client, owner_headers)

    response = client.get("/api/v1/organizations/", headers=other_headers)

    assert response.status_code == 200
    assert response.json() == []


def test_get_organization_detail_includes_members(client, manager_headers):
    org = _create_org(client, manager_headers)

    response = client.get(
        f"/api/v1/organizations/{org['id']}", headers=manager_headers
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Acme Corp"
    assert [m["email"] for m in body["members"]] == ["manager@example.com"]
    assert body["members"][0]["role"] == "owner"


def test_get_organization_detail_denied_for_non_member(client):
    owner_headers = register_and_login(client, "owner@example.com")
    other_headers = register_and_login(client, "other@example.com")
    org = _create_org(client, owner_headers)

    response = client.get(
        f"/api/v1/organizations/{org['id']}", headers=other_headers
    )

    assert response.status_code == 403


def test_get_organization_detail_returns_404_for_unknown_id(client, manager_headers):
    response = client.get(
        "/api/v1/organizations/00000000-0000-0000-0000-000000000000",
        headers=manager_headers,
    )
    assert response.status_code == 404


def test_add_member_by_email_makes_them_a_contributor(client):
    owner_headers = register_and_login(client, "owner@example.com")
    register_and_login(client, "contributor@example.com")
    org = _create_org(client, owner_headers)

    response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )

    assert response.status_code == 201
    assert response.json()["role"] == "contributor"

    detail = client.get(
        f"/api/v1/organizations/{org['id']}", headers=owner_headers
    ).json()
    assert {m["email"] for m in detail["members"]} == {
        "owner@example.com",
        "contributor@example.com",
    }


def test_add_member_requires_owner_role(client):
    owner_headers = register_and_login(client, "owner@example.com")
    contributor_headers = register_and_login(client, "contributor@example.com")
    register_and_login(client, "third@example.com")
    org = _create_org(client, owner_headers)
    client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )

    response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "third@example.com"},
        headers=contributor_headers,
    )

    assert response.status_code == 403


def test_add_member_with_unknown_email_returns_404(client, manager_headers):
    org = _create_org(client, manager_headers)

    response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "nobody@example.com"},
        headers=manager_headers,
    )

    assert response.status_code == 404


def test_add_member_already_a_member_returns_409(client):
    owner_headers = register_and_login(client, "owner@example.com")
    org = _create_org(client, owner_headers)

    response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "owner@example.com"},
        headers=owner_headers,
    )

    assert response.status_code == 409


def test_remove_member_by_owner_succeeds(client):
    owner_headers = register_and_login(client, "owner@example.com")
    register_and_login(client, "contributor@example.com")
    org = _create_org(client, owner_headers)
    add_response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )
    contributor_id = add_response.json()["user_id"]

    response = client.delete(
        f"/api/v1/organizations/{org['id']}/members/{contributor_id}",
        headers=owner_headers,
    )

    assert response.status_code == 204
    detail = client.get(
        f"/api/v1/organizations/{org['id']}", headers=owner_headers
    ).json()
    assert [m["email"] for m in detail["members"]] == ["owner@example.com"]


def test_remove_member_requires_owner_role(client):
    owner_headers = register_and_login(client, "owner@example.com")
    contributor_headers = register_and_login(client, "contributor@example.com")
    org = _create_org(client, owner_headers)
    add_response = client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )
    contributor_id = add_response.json()["user_id"]

    response = client.delete(
        f"/api/v1/organizations/{org['id']}/members/{contributor_id}",
        headers=contributor_headers,
    )

    assert response.status_code == 403


def test_delete_organization_requires_owner_role(client):
    owner_headers = register_and_login(client, "owner@example.com")
    contributor_headers = register_and_login(client, "contributor@example.com")
    org = _create_org(client, owner_headers)
    client.post(
        f"/api/v1/organizations/{org['id']}/members",
        json={"email": "contributor@example.com"},
        headers=owner_headers,
    )

    response = client.delete(
        f"/api/v1/organizations/{org['id']}", headers=contributor_headers
    )

    assert response.status_code == 403


def test_delete_organization_by_owner_succeeds(client, manager_headers):
    org = _create_org(client, manager_headers)

    response = client.delete(
        f"/api/v1/organizations/{org['id']}", headers=manager_headers
    )
    assert response.status_code == 204

    get_response = client.get(
        f"/api/v1/organizations/{org['id']}", headers=manager_headers
    )
    assert get_response.status_code == 404


def test_organizations_require_authentication(client):
    response = client.get("/api/v1/organizations/")
    assert response.status_code == 401
