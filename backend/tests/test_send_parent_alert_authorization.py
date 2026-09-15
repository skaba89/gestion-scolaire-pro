"""Authorization on POST /api/v1/notifications/send-parent-alert/
(institutional-readiness audit, 2026-09).

Before this fix, this endpoint depended only on get_current_user() — no
require_permission() — so any authenticated tenant user (STUDENT, PARENT,
ALUMNI included) could send an arbitrary "absence"/"low_grade"/custom
alert, with attacker-controlled content, to the parents of ANY student in
the tenant: a harassment/social-engineering vector impersonating the
school's own notification system. The only real frontend caller is
TeacherAttendance.tsx (src/hooks/useParentAlerts.ts), so gating on
school_life:write (already held by TEACHER) introduces no regression.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
URL = "/api/v1/notifications/send-parent-alert/"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Alerte Test", slug=f"alert-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"ALERT-{student_id[:8]}",
            first_name="Fode", last_name="Camara",
            date_of_birth=date(2012, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _payload(student_id: str) -> dict:
    return {
        "type": "absence",
        "student_id": student_id,
        "student_name": "Fode Camara",
        "details": {"date": "2026-09-15"},
    }


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestNoBusinessSendingParentAlerts:
    def test_student_cannot_send_parent_alert(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        student_user = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student_user).post(URL, json=_payload(student_id), headers=HEADERS)
        assert resp.status_code == 403

    def test_parent_cannot_send_parent_alert(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        parent_user = {"id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id}
        resp = _as(parent_user).post(URL, json=_payload(student_id), headers=HEADERS)
        assert resp.status_code == 403

    def test_alumni_cannot_send_parent_alert(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        alumni_user = {"id": str(uuid.uuid4()), "roles": ["ALUMNI"], "tenant_id": tenant_id}
        resp = _as(alumni_user).post(URL, json=_payload(student_id), headers=HEADERS)
        assert resp.status_code == 403


@pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="send_parent_alert's INSERT uses Postgres-only SQL (NOW()). "
           "Exercised by the CI Postgres job.",
)
class TestLegitimateAccessKeepsWorking:
    def test_teacher_can_send_parent_alert(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        parent_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(User(
                id=parent_id, tenant_id=tenant_id, email=f"{parent_id[:8]}@example.com",
                username=f"user-{parent_id[:8]}", is_active=True,
            ))
            from app.models.parent_student import ParentStudent
            db.add(ParentStudent(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                parent_id=parent_id, student_id=student_id,
            ))
            db.commit()

        teacher_user = {"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}
        resp = _as(teacher_user).post(URL, json=_payload(student_id), headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert resp.json()["sent"] == 1
