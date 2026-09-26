"""DEPARTMENT_HEAD "Rapports" and "Historique Alertes" nav items
(docs/PERMISSIONS_MATRIX.md's 2026-09 audit, follow-up to PR #236/#237).

DepartmentReports.tsx, DepartmentAlertHistory.tsx and
DepartmentExamCalendar.tsx all depend on `GET /department-portal/
members/` to resolve the current user's own department — this endpoint
never existed at all, so all three pages 404'd on their very first
query. DepartmentReports.tsx also depends on `GET .../reports/stats/`
and `POST .../alerts/send/` + `POST .../alerts/` (to send and persist a
low-attendance alert), and DepartmentAlertHistory.tsx on
`GET .../alerts/` — none of the alerts endpoints existed either.

department_members/department_alerts/teacher_assignments are raw-SQL
operational tables (app/core/operational_tables.py) never created by
Base.metadata.create_all() on the SQLite test DB — Postgres-only, same
pattern as test_department_exam_business_rules.py.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.associations import classroom_departments  # noqa: E402
from app.models.attendance import Attendance  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.department import Department  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from sqlalchemy import text  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="department_members/department_alerts/teacher_assignments are "
           "raw-SQL operational tables whose DDL is Postgres-specific.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

BASE = "/api/v1/department-portal"


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Département Alertes Test", slug=f"dept-alert-{tenant_id[:8]}",
            type="secondary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_department_head(tenant_id: str, name: str = "Sciences") -> tuple:
    head_id = str(uuid.uuid4())
    dept_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=head_id, tenant_id=tenant_id, email=f"{head_id[:8]}@example.com",
            username=f"head-{head_id[:8]}", first_name="Chef", last_name="Département",
            is_active=True,
        ))
        db.commit()
        db.add(Department(id=dept_id, tenant_id=tenant_id, name=name, head_id=head_id))
        db.commit()
    return head_id, dept_id


def _make_classroom(tenant_id: str, department_id: str, name: str = "6eme A") -> str:
    classroom_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Classroom(id=classroom_id, tenant_id=tenant_id, name=name))
        db.commit()
        db.execute(classroom_departments.insert().values(
            tenant_id=tenant_id, class_id=classroom_id, department_id=department_id,
        ))
        db.commit()
    return classroom_id


def _make_academic_year(tenant_id: str) -> str:
    ay_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(AcademicYear(
            id=ay_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
            start_date=date(2026, 9, 1), end_date=date(2027, 7, 1), is_current=True,
        ))
        db.commit()
    return ay_id


def _make_student(tenant_id: str, *, reg: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=reg,
            first_name="Test", last_name="Élève",
            date_of_birth=date(2012, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _enroll(tenant_id: str, student_id: str, class_id: str, academic_year_id: str) -> None:
    with SessionLocal() as db:
        db.add(Enrollment(
            id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
            class_id=class_id, academic_year_id=academic_year_id,
            enrollment_date=date(2026, 9, 1), status="active",
        ))
        db.commit()


def _mark_attendance(tenant_id: str, student_id: str, classroom_id: str, status: str, day: date) -> None:
    with SessionLocal() as db:
        db.add(Attendance(
            id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
            classroom_id=classroom_id, status=status, date=day,
        ))
        db.commit()


class TestDepartmentMembership:
    def test_head_gets_their_own_department(self):
        tenant_id = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_id, name="Sciences")
        headers = _as({"id": head_id, "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id})

        resp = client.get(f"{BASE}/members/", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body) == 1
        assert body[0]["department_id"] == dept_id
        assert body[0]["departments"]["name"] == "Sciences"

    def test_user_with_no_department_gets_empty_list(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id})

        resp = client.get(f"{BASE}/members/", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json() == []


class TestDepartmentReportStats:
    def test_stats_scoped_to_own_department_classrooms_only(self):
        tenant_id = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_id, name="Sciences")
        other_head_id, other_dept_id = _make_department_head(tenant_id, name="Lettres")
        ay_id = _make_academic_year(tenant_id)

        own_class = _make_classroom(tenant_id, dept_id, name="6eme A")
        foreign_class = _make_classroom(tenant_id, other_dept_id, name="6eme B")

        own_student = _make_student(tenant_id, reg="DEPT-1")
        _enroll(tenant_id, own_student, own_class, ay_id)
        foreign_student = _make_student(tenant_id, reg="DEPT-2")
        _enroll(tenant_id, foreign_student, foreign_class, ay_id)

        today = date(2026, 9, 20)
        _mark_attendance(tenant_id, own_student, own_class, "PRESENT", today)
        _mark_attendance(tenant_id, own_student, own_class, "ABSENT", today)
        # This attendance row belongs to another department's classroom —
        # must never leak into this department head's stats even if they
        # pass its class_id explicitly (SECURITY: never trust client scoping).
        _mark_attendance(tenant_id, foreign_student, foreign_class, "PRESENT", today)

        headers = _as({"id": head_id, "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id})
        resp = client.get(
            f"{BASE}/reports/stats/",
            params={
                "class_ids": f"{own_class},{foreign_class}",
                "start_date": "2026-09-01", "end_date": "2026-09-30",
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["studentCount"] == 1, "must only count the caller's own department's students"
        assert body["attendance"]["total"] == 2, "must exclude the foreign department's attendance rows"
        assert body["attendance"]["present"] == 1
        assert body["attendance"]["absent"] == 1

    def test_stats_with_no_department_returns_404(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id})
        resp = client.get(f"{BASE}/reports/stats/", params={"class_ids": ""}, headers=headers)
        assert resp.status_code == 404, resp.text


class TestDepartmentAlerts:
    def test_create_and_list_alert_history(self):
        tenant_id = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_id, name="Sciences")
        headers = _as({"id": head_id, "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id})

        create_resp = client.post(
            f"{BASE}/alerts/",
            json={
                "alert_type": "manual", "period_label": "30 derniers jours",
                "alerts_data": [{"classroomName": "6eme A", "rate": "65.0", "absent": 7, "total": 20}],
                "email_sent": True,
            },
            headers=headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        assert create_resp.json()["department_id"] == dept_id

        list_resp = client.get(f"{BASE}/alerts/", headers=headers)
        assert list_resp.status_code == 200, list_resp.text
        alerts = list_resp.json()
        assert len(alerts) == 1
        assert alerts[0]["period_label"] == "30 derniers jours"
        assert alerts[0]["sent_to_profile"]["first_name"] == "Chef"

    def test_alerts_are_scoped_to_the_callers_own_department(self):
        tenant_id = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_id, name="Sciences")
        other_head_id, other_dept_id = _make_department_head(tenant_id, name="Lettres")

        client.post(
            f"{BASE}/alerts/",
            json={"alert_type": "manual", "period_label": "P1", "alerts_data": [], "email_sent": False},
            headers=_as({"id": other_head_id, "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id}),
        )

        resp = client.get(
            f"{BASE}/alerts/",
            headers=_as({"id": head_id, "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id}),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == [], "another department's alert history must never leak"

    def test_send_alert_email_does_not_error_without_mail_provider_configured(self):
        """No SMTP/Resend configured in the test environment — the endpoint
        must still respond 200 with email_sent: false, never 500."""
        tenant_id = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_id, name="Sciences")
        headers = _as({"id": head_id, "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id})

        resp = client.post(
            f"{BASE}/alerts/send/",
            json={
                "alerts": [{"classroomName": "6eme A", "rate": "65.0", "absent": 7, "total": 20}],
                "periodLabel": "30 derniers jours",
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["email_sent"] is False
