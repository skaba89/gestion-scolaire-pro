"""POST/PUT /school-life/assessments|grades|attendance|events/ had NO
permission check at all (institutional-readiness audit, 2026-09,
permission-divergence subagent) — only Depends(get_current_user), while
their DELETE (and update_event/delete_event) siblings already required
require_permission("settings:write"). Any authenticated user of any role
— including STUDENT/PARENT/ALUMNI, none of whom hold grades:write/
attendance:write — could create or edit assessments, grades, attendance
records, and school events for any student in the tenant.

Fixed to require grades:write (grades), attendance:write (attendance),
and settings:write (assessments, events) — matching each resource's
canonical permission elsewhere in the app (academic/grades.py,
academic/attendance.py, academic/assessments.py) and each endpoint's own
DELETE sibling, so legitimate TEACHER/TENANT_ADMIN workflows are
unaffected.
"""
import uuid
from datetime import date, datetime, timedelta

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

ASSESSMENTS_URL = "/api/v1/school-life/assessments/"
GRADES_URL = "/api/v1/school-life/grades/"
ATTENDANCE_URL = "/api/v1/school-life/attendance/"
EVENTS_URL = "/api/v1/school-life/events/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Autorisation Test", slug=f"sl-auth-{tenant_id[:8]}",
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


class TestAssessmentWriteAuthorization:
    def test_student_cannot_create_assessment(self):
        tenant_id = _make_tenant()
        subject_id = _make_subject(tenant_id)
        resp = client.post(ASSESSMENTS_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"name": "Contrôle", "subject_id": subject_id, "date": datetime.now().isoformat()})
        assert resp.status_code == 403, resp.text

    def test_tenant_admin_can_create_assessment(self):
        tenant_id = _make_tenant()
        subject_id = _make_subject(tenant_id)
        resp = client.post(ASSESSMENTS_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id,
        }), json={"name": "Contrôle", "subject_id": subject_id, "date": datetime.now().isoformat()})
        assert resp.status_code == 200, resp.text


class TestGradeWriteAuthorization:
    def test_student_cannot_create_grade_for_self(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        resp = client.post(GRADES_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"student_id": student_id, "score": 20.0, "max_score": 20.0})
        assert resp.status_code == 403, resp.text

    def test_teacher_can_create_grade(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        resp = client.post(GRADES_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id,
        }), json={"student_id": student_id, "score": 15.0, "max_score": 20.0})
        assert resp.status_code == 200, resp.text


class TestAttendanceWriteAuthorization:
    def test_parent_cannot_mark_attendance(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        resp = client.post(ATTENDANCE_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id,
        }), json={"student_id": student_id, "date": str(date.today()), "status": "PRESENT"})
        assert resp.status_code == 403, resp.text

    def test_teacher_can_mark_attendance(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        resp = client.post(ATTENDANCE_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id,
        }), json={"student_id": student_id, "date": str(date.today()), "status": "PRESENT"})
        assert resp.status_code == 200, resp.text


class TestEventWriteAuthorization:
    def test_alumni_cannot_create_event(self):
        tenant_id = _make_tenant()
        resp = client.post(EVENTS_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["ALUMNI"], "tenant_id": tenant_id,
        }), json={
            "title": "Portes ouvertes", "start_date": datetime.now().isoformat(),
            "end_date": (datetime.now() + timedelta(hours=2)).isoformat(),
        })
        assert resp.status_code == 403, resp.text

    def test_tenant_admin_can_create_event(self):
        tenant_id = _make_tenant()
        resp = client.post(EVENTS_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id,
        }), json={
            "title": "Portes ouvertes", "start_date": datetime.now().isoformat(),
            "end_date": (datetime.now() + timedelta(hours=2)).isoformat(),
        })
        assert resp.status_code == 200, resp.text
