"""Regression: withdrawing an enrollment retains academic history and tenant isolation."""
import uuid

import pytest
from conftest import get_test_client
from app.core.database import SessionLocal
from app.core.security import get_current_user
from app.main import app
from app.models.enrollment import Enrollment
from test_infrastructure_enrollments import _make_fixture, _as

client = get_test_client()
ROOT = "/api/v1/enrollments/"


@pytest.fixture(autouse=True)
def cleanup_auth_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _active_id(tenant_id, class_id):
    with SessionLocal() as db:
        return str(db.query(Enrollment.id).filter(
            Enrollment.tenant_id == tenant_id,
            Enrollment.class_id == class_id,
            Enrollment.status == "ACTIVE",
        ).first()[0])


def test_withdraw_retains_row_and_historical_identity():
    tenant_id, class_id, _, _ = _make_fixture()
    enrollment_id = _active_id(tenant_id, class_id)
    response = client.delete(ROOT + enrollment_id + "/", headers=_as(tenant_id))
    assert response.status_code == 204, response.text

    with SessionLocal() as db:
        row = db.query(Enrollment).filter(Enrollment.id == enrollment_id).one()
        assert row.status == "WITHDRAWN"
        assert str(row.class_id) == class_id
        assert str(row.tenant_id) == tenant_id
        student_id = row.student_id
        academic_year_id = str(row.academic_year_id)

    active = client.get(ROOT, params={
        "academic_year_id": academic_year_id, "class_id": class_id,
        "status": "ACTIVE",
    }, headers=_as(tenant_id))
    assert active.status_code == 200, active.text
    assert enrollment_id not in {r["id"] for r in active.json()}

    history = client.get(ROOT, params={
        "academic_year_id": academic_year_id, "class_id": class_id,
        "status": "WITHDRAWN",
    }, headers=_as(tenant_id))
    assert history.status_code == 200, history.text
    assert any(r["id"] == enrollment_id and r["student_id"] == str(student_id)
               for r in history.json())


def test_repeat_withdraw_does_not_delete_history():
    tenant_id, class_id, _, _ = _make_fixture()
    enrollment_id = _active_id(tenant_id, class_id)
    assert client.delete(ROOT + enrollment_id + "/", headers=_as(tenant_id)).status_code == 204
    assert client.delete(ROOT + enrollment_id + "/", headers=_as(tenant_id)).status_code == 409
    with SessionLocal() as db:
        assert db.query(Enrollment).filter(Enrollment.id == enrollment_id).one().status == "WITHDRAWN"


def test_cross_tenant_withdraw_is_denied_without_mutation():
    owner_tenant, class_id, _, _ = _make_fixture()
    other_tenant, _, _, _ = _make_fixture()
    enrollment_id = _active_id(owner_tenant, class_id)
    resp = client.delete(ROOT + enrollment_id + "/", headers=_as(other_tenant))
    assert resp.status_code == 404, resp.text
    with SessionLocal() as db:
        assert db.query(Enrollment).filter(Enrollment.id == enrollment_id).one().status == "ACTIVE"


def test_unknown_enrollment_returns_404():
    tenant_id, _, _, _ = _make_fixture()
    resp = client.delete(ROOT + str(uuid.uuid4()) + "/", headers=_as(tenant_id))
    assert resp.status_code == 404, resp.text


def test_parent_cannot_withdraw_an_enrollment():
    tenant_id, class_id, _, _ = _make_fixture()
    enrollment_id = _active_id(tenant_id, class_id)
    app.dependency_overrides[get_current_user] = lambda: {
        "id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id,
    }
    resp = client.delete(ROOT + enrollment_id + "/", headers={
        "Authorization": "Bearer mock-token",
    })
    assert resp.status_code == 403, resp.text
    with SessionLocal() as db:
        assert db.query(Enrollment).filter(Enrollment.id == enrollment_id).one().status == "ACTIVE"
