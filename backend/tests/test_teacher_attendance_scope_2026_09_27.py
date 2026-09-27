"""Follow-up to docs/PERMISSIONS_MATRIX.md's ID-parameter audit methodology
(same one that produced PR #241's ownership-check fixes). This one closes a
scope-widening gap deliberately deferred from PR #241 as lower severity: a
TEACHER holds attendance:write tenant-wide, so PATCH/DELETE
/attendance/{id}/ (academic/attendance.py) and PUT
/school-life/attendance/{attendance_id}/ (operational/school_life.py) let
any teacher modify or delete another teacher's class's attendance record —
not a leak to an unauthorized role (a teacher can already read/write
attendance in general), but a widening beyond the "own classes only"
workflow the UI presents.

Fix: both routes now check the `schedule` table for a row proving the
caller teaches the record's class (mirrors the existing
operational/schedule.py::_can_view_roster pattern, which already uses
schedule.teacher_id the same way for a sibling permission check).
Privileged roles (admin/director/etc.) and records with no classroom_id
(ownership undeterminable) are unrestricted, matching prior behavior.

school_life.py's DELETE /attendance/{id}/ already requires settings:write,
which TEACHER never holds, so it isn't reachable by a teacher and needed no
change — not covered here.
"""
import uuid
from datetime import date, time

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.attendance import Attendance  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.schedule import ScheduleSlot  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Shares fixtures/tables with the rest of the ownership-scoping audit suite.",
)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Teacher Scope Test", slug=f"teacher-scope-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@teacher-scope-test.example",
            username=f"u-{user_id[:8]}", first_name="Test", last_name="Teacher",
            password_hash="x", is_active=True,
        ))
        db.commit()
    return user_id


def _make_classroom(tenant_id: str, *, name: str) -> str:
    classroom_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Classroom(id=classroom_id, tenant_id=tenant_id, name=name))
        db.commit()
    return classroom_id


def _make_subject(tenant_id: str) -> str:
    subject_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name="Mathématiques"))
        db.commit()
    return subject_id


def _make_schedule_slot(tenant_id: str, *, class_id: str, subject_id: str, teacher_id: str) -> str:
    slot_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(ScheduleSlot(
            id=slot_id, tenant_id=tenant_id, class_id=class_id, subject_id=subject_id,
            teacher_id=teacher_id, day_of_week=1, start_time=time(8, 0), end_time=time(9, 0),
        ))
        db.commit()
    return slot_id


def _make_student(tenant_id: str, *, reg: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"{reg}-{student_id[:8]}",
            first_name="Test", last_name="Élève",
            date_of_birth=date(2012, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _make_attendance(tenant_id: str, student_id: str, *, classroom_id: str = None,
                      subject_id: str = None, status: str = "ABSENT") -> str:
    att_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Attendance(
            id=att_id, tenant_id=tenant_id, student_id=student_id,
            classroom_id=classroom_id, subject_id=subject_id,
            date=date(2026, 9, 1), status=status, reason="Confidentiel",
        ))
        db.commit()
    return att_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@requires_postgres
class TestTeacherAttendanceScopingAcademicRoute:
    def test_teacher_cannot_patch_another_teachers_class_attendance(self):
        tenant_id = _make_tenant()
        own_teacher = _make_user(tenant_id)
        other_teacher = _make_user(tenant_id)
        classroom_id = _make_classroom(tenant_id, name="6eme A")
        subject_id = _make_subject(tenant_id)
        _make_schedule_slot(tenant_id, class_id=classroom_id, subject_id=subject_id, teacher_id=own_teacher)
        student_id = _make_student(tenant_id, reg="S1")
        att_id = _make_attendance(tenant_id, student_id, classroom_id=classroom_id, subject_id=subject_id)

        resp = _as({"id": other_teacher, "roles": ["TEACHER"], "tenant_id": tenant_id}).patch(
            f"/api/v1/attendance/{att_id}/", json={"status": "PRESENT"}, headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text

    def test_teacher_can_patch_their_own_class_attendance(self):
        tenant_id = _make_tenant()
        own_teacher = _make_user(tenant_id)
        classroom_id = _make_classroom(tenant_id, name="6eme B")
        subject_id = _make_subject(tenant_id)
        _make_schedule_slot(tenant_id, class_id=classroom_id, subject_id=subject_id, teacher_id=own_teacher)
        student_id = _make_student(tenant_id, reg="S2")
        att_id = _make_attendance(tenant_id, student_id, classroom_id=classroom_id, subject_id=subject_id)

        resp = _as({"id": own_teacher, "roles": ["TEACHER"], "tenant_id": tenant_id}).patch(
            f"/api/v1/attendance/{att_id}/", json={"status": "PRESENT"}, headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text

    def test_teacher_cannot_delete_another_teachers_class_attendance(self):
        tenant_id = _make_tenant()
        own_teacher = _make_user(tenant_id)
        other_teacher = _make_user(tenant_id)
        classroom_id = _make_classroom(tenant_id, name="6eme C")
        subject_id = _make_subject(tenant_id)
        _make_schedule_slot(tenant_id, class_id=classroom_id, subject_id=subject_id, teacher_id=own_teacher)
        student_id = _make_student(tenant_id, reg="S3")
        att_id = _make_attendance(tenant_id, student_id, classroom_id=classroom_id, subject_id=subject_id)

        resp = _as({"id": other_teacher, "roles": ["TEACHER"], "tenant_id": tenant_id}).delete(
            f"/api/v1/attendance/{att_id}/", headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text

        with SessionLocal() as db:
            assert db.query(Attendance).filter(Attendance.id == att_id).first() is not None

    def test_director_can_modify_any_teachers_class_attendance(self):
        tenant_id = _make_tenant()
        own_teacher = _make_user(tenant_id)
        director = _make_user(tenant_id)
        classroom_id = _make_classroom(tenant_id, name="6eme D")
        subject_id = _make_subject(tenant_id)
        _make_schedule_slot(tenant_id, class_id=classroom_id, subject_id=subject_id, teacher_id=own_teacher)
        student_id = _make_student(tenant_id, reg="S4")
        att_id = _make_attendance(tenant_id, student_id, classroom_id=classroom_id, subject_id=subject_id)

        resp = _as({"id": director, "roles": ["DIRECTOR"], "tenant_id": tenant_id}).delete(
            f"/api/v1/attendance/{att_id}/", headers=HEADERS,
        )
        assert resp.status_code == 204, resp.text

    def test_teacher_may_modify_record_with_no_classroom_recorded(self):
        """A record with no classroom_id predates this check, or was
        entered without one — ownership can't be determined, so permissive
        (matches prior behavior for this case)."""
        tenant_id = _make_tenant()
        teacher = _make_user(tenant_id)
        student_id = _make_student(tenant_id, reg="S5")
        att_id = _make_attendance(tenant_id, student_id, classroom_id=None, subject_id=None)

        resp = _as({"id": teacher, "roles": ["TEACHER"], "tenant_id": tenant_id}).patch(
            f"/api/v1/attendance/{att_id}/", json={"status": "PRESENT"}, headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text


@requires_postgres
class TestTeacherAttendanceScopingSchoolLifeRoute:
    def test_teacher_cannot_put_another_teachers_class_attendance(self):
        tenant_id = _make_tenant()
        own_teacher = _make_user(tenant_id)
        other_teacher = _make_user(tenant_id)
        classroom_id = _make_classroom(tenant_id, name="5eme A")
        subject_id = _make_subject(tenant_id)
        _make_schedule_slot(tenant_id, class_id=classroom_id, subject_id=subject_id, teacher_id=own_teacher)
        student_id = _make_student(tenant_id, reg="S6")
        att_id = _make_attendance(tenant_id, student_id, classroom_id=classroom_id, subject_id=subject_id)

        resp = _as({"id": other_teacher, "roles": ["TEACHER"], "tenant_id": tenant_id}).put(
            f"/api/v1/school-life/attendance/{att_id}/",
            json={"status": "PRESENT"}, headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text

    def test_teacher_can_put_their_own_class_attendance(self):
        tenant_id = _make_tenant()
        own_teacher = _make_user(tenant_id)
        classroom_id = _make_classroom(tenant_id, name="5eme B")
        subject_id = _make_subject(tenant_id)
        _make_schedule_slot(tenant_id, class_id=classroom_id, subject_id=subject_id, teacher_id=own_teacher)
        student_id = _make_student(tenant_id, reg="S7")
        att_id = _make_attendance(tenant_id, student_id, classroom_id=classroom_id, subject_id=subject_id)

        resp = _as({"id": own_teacher, "roles": ["TEACHER"], "tenant_id": tenant_id}).put(
            f"/api/v1/school-life/attendance/{att_id}/",
            json={"status": "PRESENT"}, headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
