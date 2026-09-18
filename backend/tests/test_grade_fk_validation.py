"""POST /grades/, PUT /grades/{id}/, POST /grades/bulk — FK injection guard
(institutional-readiness audit, 2026-09, 8e vague).

student_id/subject_id/assessment_id were inserted/updated as-is from the
client with no check they belong to the caller's tenant — a TEACHER
(grades:write) could attach a grade to another establishment's student or
assessment, corrupting that tenant's averages/transcripts.

Postgres-only: the FK guard's raw text() queries bind student_id/
subject_id/assessment_id as plain hyphenated-UUID strings, which can't
match SQLite's hex-no-dash GUID storage (see app/models/base.py GUID
type) — same constraint as test_attendance_duplicate_guard.py.
"""
import uuid
from datetime import date, datetime

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.assessment import Assessment  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="FK guard's raw SQL string bind params can't match SQLite's "
           "hex-no-dash GUID storage (see grades.py::_validate_grade_fks).",
)

GRADES_URL = "/api/v1/grades/"
GRADES_BULK_URL = "/api/v1/grades/bulk"


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
            id=tenant_id, name="École Notes FK Test", slug=f"grade-fk-{tenant_id[:8]}",
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


def _make_subject(tenant_id: str) -> str:
    subject_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name="Mathématiques"))
        db.commit()
    return subject_id


def _make_assessment(tenant_id: str, subject_id: str) -> str:
    assessment_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Assessment(
            id=assessment_id, tenant_id=tenant_id, subject_id=subject_id,
            name="Devoir 1", date=datetime(2026, 10, 1),
        ))
        db.commit()
    return assessment_id


class TestCreateGradeCrossTenantFk:
    def test_rejects_student_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_b = _make_student(tenant_b)

        resp = client.post(GRADES_URL, json={
            "student_id": student_b, "score": 15.0, "max_score": 20.0,
        }, headers=_admin_headers(tenant_a))
        assert resp.status_code == 404

    def test_rejects_subject_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_a = _make_student(tenant_a)
        subject_b = _make_subject(tenant_b)

        resp = client.post(GRADES_URL, json={
            "student_id": student_a, "subject_id": subject_b, "score": 15.0, "max_score": 20.0,
        }, headers=_admin_headers(tenant_a))
        assert resp.status_code == 404

    def test_rejects_assessment_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_a = _make_student(tenant_a)
        subject_b = _make_subject(tenant_b)
        assessment_b = _make_assessment(tenant_b, subject_b)

        resp = client.post(GRADES_URL, json={
            "student_id": student_a, "assessment_id": assessment_b, "score": 15.0, "max_score": 20.0,
        }, headers=_admin_headers(tenant_a))
        assert resp.status_code == 404

    def test_accepts_own_tenant_fks(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        subject_id = _make_subject(tenant_id)

        resp = client.post(GRADES_URL, json={
            "student_id": student_id, "subject_id": subject_id, "score": 15.0, "max_score": 20.0,
        }, headers=_admin_headers(tenant_id))
        assert resp.status_code == 201, resp.text


class TestUpdateGradeCrossTenantFk:
    def test_rejects_reassigning_to_another_tenants_student(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_a = _make_student(tenant_a)
        student_b = _make_student(tenant_b)
        headers = _admin_headers(tenant_a)

        created = client.post(GRADES_URL, json={
            "student_id": student_a, "score": 15.0, "max_score": 20.0,
        }, headers=headers)
        assert created.status_code == 201, created.text
        grade_id = created.json()["id"]

        resp = client.put(f"{GRADES_URL}{grade_id}/", json={"student_id": student_b}, headers=headers)
        assert resp.status_code == 404


class TestBulkGradesCrossTenantFk:
    def test_rejects_student_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        subject_a = _make_subject(tenant_a)
        assessment_a = _make_assessment(tenant_a, subject_a)
        student_b = _make_student(tenant_b)

        resp = client.post(GRADES_BULK_URL, json={
            "grades": [{"student_id": student_b, "assessment_id": assessment_a, "score": 12.0}],
        }, headers=_admin_headers(tenant_a))
        assert resp.status_code == 404
