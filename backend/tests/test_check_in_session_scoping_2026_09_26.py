"""student_check_ins.session_id — follow-up to the TEACHER QR check-in
scanner fix (docs/PERMISSIONS_MATRIX.md, PR #236). The scanner
(ClassSessionAttendance.tsx) has always posted and read a `session_id`
when recording/listing check-ins, but the column never existed:
Pydantic silently dropped it on write, and the list query ignored it on
read, so the "present" count shown for one live session actually
included every check-in ever made for the tenant. Added via Alembic
migration 20260926_0001 (student_check_ins is a real ORM table, unlike
check_in_sessions which is a raw-SQL operational table).

check_in_sessions is a raw-SQL operational table (app/core/
operational_tables.py) never created by Base.metadata.create_all() on
the SQLite test DB — Postgres-only, same pattern as the rest of this
audit's test files.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from datetime import date
from sqlalchemy import text  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="check_in_sessions is a raw-SQL operational table whose DDL is "
           "Postgres-specific — see app/core/operational_tables.py.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Check-In Scoping Test", slug=f"cis-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@cis-test.example",
            username=f"u-{user_id[:8]}", first_name="Test", last_name="Teacher",
            password_hash="x", is_active=True,
        ))
        db.commit()
    return user_id


def _make_classroom(tenant_id: str) -> str:
    classroom_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Classroom(id=classroom_id, tenant_id=tenant_id, name="6e B"))
        db.commit()
    return classroom_id


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


def _make_session(tenant_id: str, teacher_id: str, classroom_id: str) -> str:
    session_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO check_in_sessions (id, tenant_id, teacher_id, classroom_id, status)
            VALUES (:id, :tid, :teacher_id, :cid, 'ACTIVE')
        """), {"id": session_id, "tid": tenant_id, "teacher_id": teacher_id, "cid": classroom_id})
        db.commit()
    return session_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@requires_postgres
class TestCheckInSessionScoping:
    def test_check_in_is_recorded_against_its_session(self):
        tenant_id = _make_tenant()
        teacher_id = _make_user(tenant_id)
        classroom_id = _make_classroom(tenant_id)
        session_id = _make_session(tenant_id, teacher_id, classroom_id)
        student_id = _make_student(tenant_id, reg="CIS-1")

        headers = _as({"id": teacher_id, "roles": ["TEACHER"], "tenant_id": tenant_id})
        resp = headers.post(
            "/api/v1/school-life/check-ins/",
            json={"student_id": student_id, "session_id": session_id, "source": "QR_SCAN"},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["session_id"] == session_id

    def test_listing_by_session_excludes_other_sessions_check_ins(self):
        """The exact bug: a check-in recorded against session A must never
        appear when the scanner lists session B's check-ins, even for the
        same student/classroom/day."""
        tenant_id = _make_tenant()
        teacher_id = _make_user(tenant_id)
        classroom_id = _make_classroom(tenant_id)
        session_a = _make_session(tenant_id, teacher_id, classroom_id)
        session_b = _make_session(tenant_id, teacher_id, classroom_id)
        student_id = _make_student(tenant_id, reg="CIS-2")

        headers = _as({"id": teacher_id, "roles": ["TEACHER"], "tenant_id": tenant_id})
        create_resp = headers.post(
            "/api/v1/school-life/check-ins/",
            json={"student_id": student_id, "session_id": session_a, "source": "QR_SCAN"},
            headers=HEADERS,
        )
        assert create_resp.status_code == 200, create_resp.text

        list_a = headers.get(
            "/api/v1/school-life/check-ins/", params={"session_id": session_a}, headers=HEADERS,
        )
        assert list_a.status_code == 200, list_a.text
        assert len(list_a.json()) == 1
        assert list_a.json()[0]["student_id"] == student_id

        list_b = headers.get(
            "/api/v1/school-life/check-ins/", params={"session_id": session_b}, headers=HEADERS,
        )
        assert list_b.status_code == 200, list_b.text
        assert list_b.json() == [], "a check-in from session A must never appear under session B"
