"""Duplicate attendance guard (institutional-readiness audit, 2026-09,
business-rules subagent): there was no unique constraint on the
`attendance` table and no application-level check, so recording the same
student/date/subject attendance twice silently created a second row,
double-counting that absence/presence in every downstream statistic. A
dedicated PATCH /attendance/{id}/ already exists for corrections, so a
duplicate is rejected (409) rather than silently overwritten or duplicated.

Postgres-only: create_attendance()/create_attendance_bulk() use raw SQL
with plain string bind params for student_id/subject_id, which can't match
SQLite's hex-no-dash GUID storage (see app/models/base.py GUID type) —
same constraint as test_invoice_deletion_payment_history.py.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="raw SQL WHERE/INSERT with plain string bind params can't match "
           "SQLite's hex-no-dash GUID storage (see attendance.py).",
)

ATTENDANCE_URL = "/api/v1/attendance/"
ATTENDANCE_BULK_URL = "/api/v1/attendance/bulk/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _admin_headers(tenant_id: str) -> dict:
    return _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Présence Test", slug=f"attend-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"REG-{student_id[:8]}",
            first_name="Test", last_name="Student", date_of_birth=date(2012, 1, 1),
            gender=Gender.MALE, status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _make_subject(tenant_id: str, name: str) -> str:
    subject_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name=name))
        db.commit()
    return subject_id


class TestDuplicateAttendanceRejected:
    def test_second_submission_same_student_date_is_rejected(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        headers = _admin_headers(tenant_id)
        payload = {"student_id": student_id, "date": str(date.today()), "status": "present"}

        first = client.post(ATTENDANCE_URL, json=payload, headers=headers)
        assert first.status_code == 201, first.text

        second = client.post(ATTENDANCE_URL, json=payload, headers=headers)
        assert second.status_code == 409, second.text

    def test_different_subjects_same_day_are_both_allowed(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        subject_a = _make_subject(tenant_id, "Mathématiques")
        subject_b = _make_subject(tenant_id, "Français")
        headers = _admin_headers(tenant_id)

        first = client.post(ATTENDANCE_URL, json={
            "student_id": student_id, "date": str(date.today()), "status": "present",
            "subject_id": subject_a,
        }, headers=headers)
        assert first.status_code == 201, first.text

        second = client.post(ATTENDANCE_URL, json={
            "student_id": student_id, "date": str(date.today()), "status": "present",
            "subject_id": subject_b,
        }, headers=headers)
        assert second.status_code == 201, second.text

    def test_bulk_rejects_when_a_record_already_exists(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        headers = _admin_headers(tenant_id)

        pre_existing = client.post(ATTENDANCE_URL, json={
            "student_id": student_id, "date": str(date.today()), "status": "present",
        }, headers=headers)
        assert pre_existing.status_code == 201, pre_existing.text

        bulk_resp = client.post(ATTENDANCE_BULK_URL, json={
            "records": [
                {"student_id": student_id, "date": str(date.today()), "status": "absent"},
            ]
        }, headers=headers)
        assert bulk_resp.status_code == 409, bulk_resp.text
