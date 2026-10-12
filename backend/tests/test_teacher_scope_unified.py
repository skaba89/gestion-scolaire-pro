"""Périmètre enseignant unifié (app/core/teacher_scope.py, 2026-10-12).

« Enseigne cette classe » = affecté (teacher_assignments) OU planifié
(schedule). Avant : présences sur l'emploi du temps seul, notes sur les
affectations seules, et AUCUNE vérification à la création de présence.
"""
import uuid
from datetime import date

import pytest
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from test_teacher_attendance_scope_2026_09_27 import (  # noqa: E402
    HEADERS, _make_attendance, _make_classroom, _make_schedule_slot, _make_student,
    _make_subject, _make_tenant, _make_user, requires_postgres,
)

pytestmark = requires_postgres


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user_id: str, tenant_id: str, roles=("TEACHER",)):
    user = {"id": user_id, "tenant_id": tenant_id, "roles": list(roles)}
    app.dependency_overrides[get_current_user] = lambda: user
    return client


def _assign(tenant_id: str, user_id: str, class_id: str, subject_id=None) -> None:
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO teacher_assignments (id, tenant_id, user_id, classroom_id, subject_id, created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :uid, :cid, :sid, NOW(), NOW())
        """), {"tid": tenant_id, "uid": user_id, "cid": class_id, "sid": subject_id})
        db.commit()


@pytest.fixture
def school():
    tenant_id = _make_tenant()
    mine = _make_classroom(tenant_id, name=f"Mine {uuid.uuid4().hex[:4]}")
    other = _make_classroom(tenant_id, name=f"Other {uuid.uuid4().hex[:4]}")
    subject = _make_subject(tenant_id)
    student = _make_student(tenant_id, reg=f"S-{uuid.uuid4().hex[:6]}")
    with SessionLocal() as db:
        year = AcademicYear(tenant_id=tenant_id, name="2024-2025", code=f"Y{uuid.uuid4().hex[:6]}",
                            start_date=date(2024, 10, 1), end_date=date(2025, 7, 31))
        db.add(year)
        db.flush()
        db.add(Enrollment(tenant_id=tenant_id, student_id=student, class_id=mine, academic_year_id=year.id))
        db.commit()
    assigned = _make_user(tenant_id)      # affecté seulement
    _assign(tenant_id, assigned, mine)
    scheduled = _make_user(tenant_id)     # planifié seulement
    _make_schedule_slot(tenant_id, class_id=mine, subject_id=subject, teacher_id=scheduled)
    outsider = _make_user(tenant_id)      # ni l'un ni l'autre
    return {"tenant_id": tenant_id, "mine": mine, "other": other, "subject": subject,
            "student": student, "assigned": assigned, "scheduled": scheduled, "outsider": outsider}


def _attendance_body(school, class_id):
    return {"student_id": school["student"], "date": date.today().isoformat(), "status": "PRESENT",
            "classroom_id": class_id}


class TestAttendance:
    def test_assigned_only_teacher_creates_then_corrects(self, school):
        """Le bug : création OK, correction 403 (emploi du temps exigé)."""
        c = _as(school["assigned"], school["tenant_id"])
        created = c.post("/api/v1/attendance/", json=_attendance_body(school, school["mine"]), headers=HEADERS)
        assert created.status_code == 201, created.text

        patch = c.patch(f"/api/v1/attendance/{created.json()['id']}/", json={"status": "ABSENT"}, headers=HEADERS)
        assert patch.status_code == 200, patch.text

    def test_outsider_cannot_create_attendance_for_the_class(self, school):
        """L'élargissement : la création ne vérifiait aucune classe."""
        c = _as(school["outsider"], school["tenant_id"])
        resp = c.post("/api/v1/attendance/", json=_attendance_body(school, school["mine"]), headers=HEADERS)
        assert resp.status_code == 403

    def test_teacher_cannot_bypass_the_check_by_omitting_the_class(self, school):
        c = _as(school["outsider"], school["tenant_id"])
        body = _attendance_body(school, None)
        body.pop("classroom_id")
        assert c.post("/api/v1/attendance/", json=body, headers=HEADERS).status_code == 403

    def test_outsider_cannot_bulk_create(self, school):
        c = _as(school["outsider"], school["tenant_id"])
        resp = c.post("/api/v1/attendance/bulk/", json={"records": [_attendance_body(school, school["mine"])]},
                      headers=HEADERS)
        assert resp.status_code == 403

    def test_scheduled_only_teacher_still_corrects(self, school):
        att = _make_attendance(school["tenant_id"], school["student"], classroom_id=school["mine"])
        c = _as(school["scheduled"], school["tenant_id"])
        resp = c.patch(f"/api/v1/attendance/{att}/", json={"status": "PRESENT"}, headers=HEADERS)
        assert resp.status_code == 200, resp.text

    def test_outsider_cannot_correct(self, school):
        att = _make_attendance(school["tenant_id"], school["student"], classroom_id=school["mine"])
        c = _as(school["outsider"], school["tenant_id"])
        assert c.patch(f"/api/v1/attendance/{att}/", json={"status": "PRESENT"}, headers=HEADERS).status_code == 403

    def test_admin_unchanged(self, school):
        c = _as(str(uuid.uuid4()), school["tenant_id"], roles=("TENANT_ADMIN",))
        resp = c.post("/api/v1/attendance/", json=_attendance_body(school, school["other"]), headers=HEADERS)
        assert resp.status_code == 201, resp.text


class TestEnrollmentsAndAssessments:
    def test_scheduled_only_teacher_reads_class_enrollments(self, school):
        c = _as(school["scheduled"], school["tenant_id"])
        resp = c.get("/api/v1/infrastructure/enrollments/", params={"class_id": school["mine"]}, headers=HEADERS)
        assert resp.status_code == 200, resp.text

    def test_outsider_cannot_read_class_enrollments(self, school):
        c = _as(school["outsider"], school["tenant_id"])
        resp = c.get("/api/v1/infrastructure/enrollments/", params={"class_id": school["mine"]}, headers=HEADERS)
        assert resp.status_code == 403

    def test_scheduled_only_teacher_creates_an_assessment_for_the_scheduled_subject(self, school):
        user = {"id": school["scheduled"], "tenant_id": school["tenant_id"], "roles": ["TEACHER"]}
        app.dependency_overrides[get_current_user] = lambda: user
        resp = client.post("/api/v1/assessments/", json={
            "subject_id": school["subject"], "class_id": school["mine"], "name": "Contrôle",
            "type": "QUIZ", "date": "2026-11-01", "max_score": 20,
        }, headers=HEADERS)
        assert resp.status_code == 200, resp.text
