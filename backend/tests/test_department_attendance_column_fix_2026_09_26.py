"""GET /department-portal/attendance/ (departments.py) — found while
building the department Reports/Alerts backend (docs/PERMISSIONS_MATRIX.md,
PR #238's follow-up): this endpoint queried the real `attendance` table
with column names (`class_id`, `notes`) that don't exist on it — the
actual columns are `classroom_id` and `reason` (see app/models/
attendance.py) — so every call raised UndefinedColumn and 500'd against
real PostgreSQL. The department head's "Suivi des présences" page
(DepartmentAttendance.tsx) could therefore never load, silently, since
this bug only ever surfaces against Postgres, not the SQLite test DB.

department_members/teacher_assignments are raw-SQL operational tables —
Postgres-only, same pattern as test_department_exam_business_rules.py.
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
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="department_members is a raw-SQL operational table whose DDL is "
           "Postgres-specific, and this bug (wrong column names) only "
           "surfaces against real PostgreSQL, not SQLite.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

BASE = "/api/v1/department-portal/attendance/"


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
            id=tenant_id, name="École Département Présences Test", slug=f"dept-att-{tenant_id[:8]}",
            type="secondary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_department_head(tenant_id: str) -> tuple:
    head_id = str(uuid.uuid4())
    dept_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=head_id, tenant_id=tenant_id, email=f"{head_id[:8]}@example.com",
            username=f"head-{head_id[:8]}", is_active=True,
        ))
        db.commit()
        db.add(Department(id=dept_id, tenant_id=tenant_id, name="Sciences", head_id=head_id))
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


class TestDepartmentAttendanceColumnFix:
    def test_lists_attendance_records_without_500(self):
        """Regression guard for the UndefinedColumn crash: a real
        attendance row for the department's own classroom must come back
        with a 200 and the correct notes/status fields, not a 500."""
        tenant_id = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_id)
        classroom_id = _make_classroom(tenant_id, dept_id)
        student_id = _make_student(tenant_id, reg="ATT-1")

        with SessionLocal() as db:
            db.add(Attendance(
                id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
                classroom_id=classroom_id, status="ABSENT", reason="Maladie",
                date=date.today(),
            ))
            db.commit()

        headers = _as({"id": head_id, "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id})
        resp = client.get(BASE, params={"period": "month"}, headers=headers)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["stats"]["total"] == 1
        assert body["stats"]["absent"] == 1
        assert len(body["records"]) == 1
        assert body["records"][0]["notes"] == "Maladie"
        assert body["records"][0]["classrooms"]["name"] == "6eme A"

    def test_filtering_by_classroom_id_works(self):
        tenant_id = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_id)
        class_a = _make_classroom(tenant_id, dept_id, name="6eme A")
        class_b = _make_classroom(tenant_id, dept_id, name="6eme B")
        student_a = _make_student(tenant_id, reg="ATT-2")
        student_b = _make_student(tenant_id, reg="ATT-3")

        with SessionLocal() as db:
            db.add(Attendance(
                id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_a,
                classroom_id=class_a, status="PRESENT", date=date.today(),
            ))
            db.add(Attendance(
                id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_b,
                classroom_id=class_b, status="PRESENT", date=date.today(),
            ))
            db.commit()

        headers = _as({"id": head_id, "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id})
        resp = client.get(BASE, params={"period": "month", "classroom_id": class_a}, headers=headers)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["records"]) == 1
        assert body["records"][0]["classrooms"]["name"] == "6eme A"
