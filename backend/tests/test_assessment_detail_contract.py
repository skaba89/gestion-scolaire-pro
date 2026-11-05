"""Regression: GET /assessments/{id} and assessment list error visibility.

PostgreSQL-only: existing assessment fixtures use PostgreSQL UUID storage.
"""
import uuid
import pytest
from sqlalchemy import text
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from test_assessment_business_rules import (  # noqa: E402
    _as, _make_classroom, _make_subject, _make_tenant, _payload,
)

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="The existing assessment fixture relies on PostgreSQL UUID storage.",
)
BASE = "/api/v1/assessments"


@pytest.fixture(autouse=True)
def clear_auth():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _admin(tenant_id):
    return {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"]}


def test_detail_returns_assessment_and_class_id():
    tenant = _make_tenant()
    subject = _make_subject(tenant)
    classroom = _make_classroom(tenant)
    headers = _as(_admin(tenant))
    created = client.post(f"{BASE}/", json=_payload(subject, class_id=classroom), headers=headers)
    assert created.status_code == 200, created.text

    result = client.get(f"{BASE}/{created.json()['id']}/", headers=headers)
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["id"] == created.json()["id"]
    assert body["tenant_id"] == tenant
    assert body["class_id"] == classroom
    assert body["subject_id"] == subject
    assert body["type"] == "QUIZ"
    assert body["subjects"]["name"] == "Mathématiques"


def test_detail_does_not_expose_another_school_assessment():
    school_a, school_b = _make_tenant(), _make_tenant()
    subject = _make_subject(school_a)
    headers_a = _as(_admin(school_a))
    created = client.post(f"{BASE}/", json=_payload(subject), headers=headers_a)
    assert created.status_code == 200, created.text

    response = client.get(f"{BASE}/{created.json()['id']}/", headers=_as(_admin(school_b)))
    assert response.status_code == 404


def test_detail_unknown_assessment_is_404():
    school = _make_tenant()
    response = client.get(f"{BASE}/{uuid.uuid4()}/", headers=_as(_admin(school)))
    assert response.status_code == 404


def test_detail_requires_settings_read():
    school = _make_tenant()
    student = {"id": str(uuid.uuid4()), "tenant_id": school, "roles": ["STUDENT"]}
    response = client.get(f"{BASE}/{uuid.uuid4()}/", headers=_as(student))
    assert response.status_code == 403


def test_list_database_error_is_not_reported_as_empty_success(monkeypatch):
    school = _make_tenant()
    from app.api.v1.endpoints.academic import assessments

    original = assessments.text

    def reject_list(query):
        if "ORDER BY a.date DESC" in str(query):
            raise RuntimeError("Simulated database failure")
        return original(query)

    monkeypatch.setattr(assessments, "text", reject_list)
    response = client.get(f"{BASE}/", headers=_as(_admin(school)))
    assert response.status_code == 500
    assert response.json()["detail"] == "Unable to load assessments"
