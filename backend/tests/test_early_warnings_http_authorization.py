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
    assert client.post(URL, json={\n        "student_id": str(uuid4()), "alert_type": "academic",\n        "severity": "high", "title": "Suivi", "description": "Difficulté",\n    }).status_code in (401, 403)


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
