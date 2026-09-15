"""Authorization on POST /api/v1/admissions/ — the internal/staff creation
endpoint (institutional-readiness audit, 2026-09).

Distinct from the unauthenticated POST /admissions/public/apply/ used by
prospective applicants, this endpoint depended only on get_current_user()
— no require_permission() — so any authenticated tenant user (STUDENT,
PARENT, ALUMNI included) could create DRAFT admission applications. Every
other write on this router (transition_status/convert_to_student/
edit_admission/delete_admission) already required admissions:write.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
URL = "/api/v1/admissions/"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Admissions Test", slug=f"adm-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _payload() -> dict:
    return {
        "student_first_name": "Ibrahima",
        "student_last_name": "Sow",
        "parent_first_name": "Mariam",
        "parent_last_name": "Sow",
        "parent_email": "mariam.sow@example.com",
        "parent_phone": "+224600000000",
    }


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestNoBusinessCreatingAdmissions:
    def test_student_cannot_create_admission(self):
        tenant_id = _make_tenant()
        student = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student).post(URL, json=_payload(), headers=HEADERS)
        assert resp.status_code == 403

    def test_parent_cannot_create_admission(self):
        tenant_id = _make_tenant()
        parent = {"id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id}
        resp = _as(parent).post(URL, json=_payload(), headers=HEADERS)
        assert resp.status_code == 403

    def test_alumni_cannot_create_admission(self):
        tenant_id = _make_tenant()
        alumni = {"id": str(uuid.uuid4()), "roles": ["ALUMNI"], "tenant_id": tenant_id}
        resp = _as(alumni).post(URL, json=_payload(), headers=HEADERS)
        assert resp.status_code == 403


@pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="create_admission's INSERT uses Postgres-only SQL (gen_random_uuid(), "
           "NOW()) — same constraint as convert_to_student/public_apply in this "
           "module. Exercised by the CI Postgres job.",
)
class TestLegitimateAccessKeepsWorking:
    def test_secretary_can_create_admission(self):
        tenant_id = _make_tenant()
        secretary = {"id": str(uuid.uuid4()), "roles": ["SECRETARY"], "tenant_id": tenant_id}
        resp = _as(secretary).post(URL, json=_payload(), headers=HEADERS)
        assert resp.status_code == 201, resp.text

    def test_staff_can_create_admission(self):
        tenant_id = _make_tenant()
        staff = {"id": str(uuid.uuid4()), "roles": ["STAFF"], "tenant_id": tenant_id}
        resp = _as(staff).post(URL, json=_payload(), headers=HEADERS)
        assert resp.status_code == 201, resp.text
