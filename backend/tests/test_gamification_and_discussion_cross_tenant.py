"""Institutional-readiness audit (2026-09) — three aliases.py endpoints
inserted a caller-supplied foreign key verbatim with no check it belongs
to the caller's tenant. Each has a real FK to another table, so a
nonexistent id already 500s/400s — the actual gap was a real row that
exists in a DIFFERENT tenant, which the FK alone can never catch:

- create_student_badge: student_id (FK -> students.id) not tenant-checked.
- create_point_transaction: student_id (FK -> users.id, despite the name)
  not tenant-checked.
- create_course_discussion: course_id (FK -> elearning_courses.id) not
  tenant-checked.

student_badges/point_transactions/course_discussions/elearning_courses
are raw-SQL operational tables — Postgres-only, same pattern as
test_message_reactions_authorization.py."""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="student_badges/point_transactions/course_discussions are raw-SQL "
           "operational tables whose DDL is Postgres-specific and never "
           "created on SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

from datetime import date  # noqa: E402


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
            id=tenant_id, name="École Gamification Test", slug=f"gamif-{tenant_id[:8]}",
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


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", is_active=True,
        ))
        db.commit()
    return user_id


def _make_course(tenant_id: str) -> str:
    from sqlalchemy import text
    course_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text(
            "INSERT INTO elearning_courses (id, tenant_id, title) VALUES (:id, :tid, 'Cours Test')"
        ), {"id": course_id, "tid": tenant_id})
        db.commit()
    return course_id


class TestStudentBadgeRejectsCrossTenantStudent:
    def test_badge_for_student_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        staff_id = _make_user(tenant_a)
        foreign_student_id = _make_student(tenant_b)
        headers = _as({"id": staff_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post("/api/v1/student-badges/", json={
            "student_id": foreign_student_id, "badge_type": "MERIT", "badge_name": "Excellence",
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_badge_for_own_tenant_student_is_accepted(self):
        tenant_id = _make_tenant()
        staff_id = _make_user(tenant_id)
        student_id = _make_student(tenant_id)
        headers = _as({"id": staff_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post("/api/v1/student-badges/", json={
            "student_id": student_id, "badge_type": "MERIT", "badge_name": "Excellence",
        }, headers=headers)
        assert resp.status_code == 201, resp.text


class TestPointTransactionRejectsCrossTenantTarget:
    def test_points_for_user_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        staff_id = _make_user(tenant_a)
        foreign_user_id = _make_user(tenant_b)
        headers = _as({"id": staff_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post("/api/v1/point-transactions/", json={
            "student_id": foreign_user_id, "points": 10, "reason": "Bon travail",
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_points_for_own_tenant_user_is_accepted(self):
        tenant_id = _make_tenant()
        staff_id = _make_user(tenant_id)
        target_id = _make_user(tenant_id)
        headers = _as({"id": staff_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post("/api/v1/point-transactions/", json={
            "student_id": target_id, "points": 10, "reason": "Bon travail",
        }, headers=headers)
        assert resp.status_code == 201, resp.text


class TestCourseDiscussionRejectsCrossTenantCourse:
    def test_discussion_on_course_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        user_id = _make_user(tenant_a)
        foreign_course_id = _make_course(tenant_b)
        headers = _as({"id": user_id, "roles": ["TEACHER"], "tenant_id": tenant_a})

        resp = client.post("/api/v1/course-discussions/", json={
            "course_id": foreign_course_id, "content": "Bonjour",
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_discussion_on_own_tenant_course_is_accepted(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        course_id = _make_course(tenant_id)
        headers = _as({"id": user_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.post("/api/v1/course-discussions/", json={
            "course_id": course_id, "content": "Bonjour",
        }, headers=headers)
        assert resp.status_code == 201, resp.text
