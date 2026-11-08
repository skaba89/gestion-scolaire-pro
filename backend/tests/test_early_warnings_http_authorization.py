"""HTTP routing and role-boundary tests for Early Warnings.

Unlike handler-only unit tests, these exercise FastAPI's routing, request
validation, and dependency-based permission checks through TestClient.
"""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import get_db  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.api.v1.endpoints.operational import early_warnings as api  # noqa: E402

URL = "/api/v1/school-life/early-warnings/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_db, None)


def _identity(roles):
    tid = str(uuid4())
    uid = str(uuid4())
    user = {"id": uid, "tenant_id": tid, "roles": roles}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": uid, "tenant_id": tid, "roles": roles})
    return user, {"Authorization": f"Bearer {token}"}


def test_anonymous_early_warning_requests_are_denied():
    assert client.get(URL).status_code in (401, 403)
    response = client.post(URL, json={
        "student_id": str(uuid4()),
        "alert_type": "academic",
        "severity": "high",
        "title": "Suivi",
        "description": "Difficulté",
    })
    assert response.status_code in (401, 403)


@pytest.mark.parametrize("role", ["STUDENT", "PARENT", "TEACHER", "ACCOUNTANT", "STAFF"])
def test_non_management_roles_cannot_list_early_warnings(role):
    _, headers = _identity([role])
    response = client.get(URL, headers=headers)
    assert response.status_code == 403, response.text


@pytest.mark.parametrize("role", ["STUDENT", "PARENT", "TEACHER", "ACCOUNTANT", "STAFF"])
def test_non_management_roles_cannot_create_early_warnings(role):
    _, headers = _identity([role])
    response = client.post(URL, headers=headers, json={
        "student_id": str(uuid4()),
        "alert_type": "academic", "severity": "high",
        "title": "Suivi", "description": "Difficulté",
    })
    assert response.status_code == 403, response.text


def test_director_can_read_early_warnings_using_real_http_route():
    user, headers = _identity(["DIRECTOR"])
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    app.dependency_overrides[get_db] = lambda: db
    with patch.object(api, "resolve_current_tenant_id", return_value=user["tenant_id"]):
        response = client.get(URL, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json() == []
    _, params = db.execute.call_args.args
    assert params["tid"] == user["tenant_id"]


def test_director_create_validates_payload_before_writing_to_database():
    user, headers = _identity(["DIRECTOR"])
    db = MagicMock()
    app.dependency_overrides[get_db] = lambda: db
    with patch.object(api, "resolve_current_tenant_id", return_value=user["tenant_id"]):
        response = client.post(URL, headers=headers, json={
            "student_id": str(uuid4()),
            "alert_type": "unknown",
            "severity": "high",
            "title": "Suivi",
            "description": "Difficulté",
        })
    assert response.status_code == 422, response.text
    db.execute.assert_not_called()


@pytest.mark.parametrize("suffix", ["summary/", "paginated/?status=new", "paginated/?group=processing", "paginated/?group=closed"])
def test_anonymous_requests_to_new_early_warning_routes_are_denied(suffix):
    response = client.get(URL + suffix)
    assert response.status_code in (401, 403), response.text


@pytest.mark.parametrize("role", ["STUDENT", "PARENT", "TEACHER", "ACCOUNTANT", "STAFF"])
@pytest.mark.parametrize("suffix", ["summary/", "paginated/?status=new", "paginated/?group=processing", "paginated/?group=closed"])
def test_non_management_roles_cannot_read_new_early_warning_routes(role, suffix):
    _, headers = _identity([role])
    response = client.get(URL + suffix, headers=headers)
    assert response.status_code == 403, response.text


def test_director_reads_authoritative_summary_over_http_with_tenant_filter():
    user, headers = _identity(["DIRECTOR"])
    db = MagicMock()
    counts = {
        "total": 30, "new": 7, "processing": 4, "closed": 19,
        "resolved": 17, "dismissed": 2, "academic": 10,
        "critical_new": 3,
    }
    db.execute.return_value.mappings.return_value.one.return_value = counts
    app.dependency_overrides[get_db] = lambda: db
    with patch.object(api, "resolve_current_tenant_id", return_value=user["tenant_id"]):
        response = client.get(URL + "summary/", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json() == counts
    assert db.execute.call_count == 1
    sql, params = db.execute.call_args.args
    assert "FROM early_warnings WHERE tenant_id = :tid" in str(sql)
    assert params == {"tid": user["tenant_id"]}


@pytest.mark.parametrize("suffix", [
    "paginated/?page=0",
    "paginated/?page=-1",
    "paginated/?page_size=0",
    "paginated/?page_size=101",
    "paginated/?status=invalid",
    "paginated/?group=invalid",
    "paginated/?group=closed&status=resolved",
])
def test_director_pagination_rejects_invalid_filters_without_sql(suffix):
    user, headers = _identity(["DIRECTOR"])
    db = MagicMock()
    app.dependency_overrides[get_db] = lambda: db
    with patch.object(api, "resolve_current_tenant_id", return_value=user["tenant_id"]):
        response = client.get(URL + suffix, headers=headers)
    assert response.status_code == 422, response.text
    db.execute.assert_not_called()


@pytest.mark.parametrize("suffix,expected_filter", [
    ("paginated/?status=new&page=2&page_size=12", "w.status = :status"),
    ("paginated/?group=processing&page=2&page_size=12", "w.status IN ('acknowledged', 'in_progress')"),
    ("paginated/?group=closed&page=2&page_size=12", "w.status IN ('resolved', 'dismissed')"),
])
def test_director_pagination_uses_same_tenant_in_count_and_page_http(suffix, expected_filter):
    user, headers = _identity(["DIRECTOR"])
    db = MagicMock()
    db.execute.side_effect = [
        MagicMock(scalar_one=lambda: 25),
        MagicMock(mappings=lambda: MagicMock(all=lambda: [])),
    ]
    app.dependency_overrides[get_db] = lambda: db
    with patch.object(api, "resolve_current_tenant_id", return_value=user["tenant_id"]):
        response = client.get(URL + suffix, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "items": [], "total": 25, "page": 2,
        "page_size": 12, "total_pages": 3,
    }
    assert db.execute.call_count == 2
    for call in db.execute.call_args_list:
        sql, params = call.args
        assert "w.tenant_id = :tid" in str(sql)
        assert expected_filter in str(sql)
        assert params["tid"] == user["tenant_id"]
    assert db.execute.call_args_list[1].args[1]["offset"] == 12
