"""GET /homework/submissions/{student_id}/ — institutional-readiness audit,
2026-09, 8e vague.

homework:read is granted to STUDENT/PARENT, but this endpoint took
student_id straight from the URL with no ownership check — any
authenticated student could read another student's submission content,
grades and feedback by swapping the id in the path. Fixed by reusing
_can_submit_for_student() (the same self/parent/homework:write rule
already applied to POST /homework/{id}/submit/, see
test_homework_submission_ownership.py).

Also covers the FK injection guard added to create_homework/update_homework
(class_id/subject_id must belong to the caller's tenant).

homework/homework_submissions are raw-DDL Postgres-only tables (see
app/core/operational_tables.py) — same constraint as
test_homework_submission_ownership.py.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="homework/homework_submissions are raw Postgres-only operational tables.",
)

SUBMISSIONS_URL = "/api/v1/homework/submissions/{student_id}/"
HOMEWORK_URL = "/api/v1/homework/"


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
            id=tenant_id, name="École Devoirs IDOR Test", slug=f"hw-idor-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"u.{user_id[:8]}@ecole.gn",
            username=f"u.{user_id[:8]}", first_name="Amadou", last_name="Bah",
            password_hash="x", is_active=True,
        ))
        db.commit()
    return user_id


def _make_student(tenant_id: str, *, user_id: str = None) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, user_id=user_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Test", last_name="Student", date_of_birth=date(2012, 1, 1),
            gender=Gender.MALE, status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _link_parent(tenant_id: str, *, parent_id: str, student_id: str) -> None:
    with SessionLocal() as db:
        db.add(ParentStudent(
            id=str(uuid.uuid4()), tenant_id=tenant_id, parent_id=parent_id, student_id=student_id,
        ))
        db.commit()


def _make_subject(tenant_id: str, name: str = "Mathématiques") -> str:
    subject_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name=name))
        db.commit()
    return subject_id


class TestHomeworkSubmissionsIdor:
    def test_student_cannot_read_another_students_submissions(self):
        tenant_id = _make_tenant()
        attacker_user_id = _make_user(tenant_id)
        _make_student(tenant_id, user_id=attacker_user_id)
        victim_student_id = _make_student(tenant_id)

        resp = client.get(
            SUBMISSIONS_URL.format(student_id=victim_student_id),
            headers=_as({"id": attacker_user_id, "roles": ["STUDENT"], "tenant_id": tenant_id}),
        )
        assert resp.status_code == 403, resp.text

    def test_student_can_read_own_submissions(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        student_id = _make_student(tenant_id, user_id=user_id)

        resp = client.get(
            SUBMISSIONS_URL.format(student_id=student_id),
            headers=_as({"id": user_id, "roles": ["STUDENT"], "tenant_id": tenant_id}),
        )
        assert resp.status_code == 200, resp.text

    def test_parent_can_read_own_childs_submissions(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        student_id = _make_student(tenant_id)
        _link_parent(tenant_id, parent_id=parent_id, student_id=student_id)

        resp = client.get(
            SUBMISSIONS_URL.format(student_id=student_id),
            headers=_as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}),
        )
        assert resp.status_code == 200, resp.text

    def test_parent_cannot_read_unrelated_students_submissions(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        unrelated_student_id = _make_student(tenant_id)

        resp = client.get(
            SUBMISSIONS_URL.format(student_id=unrelated_student_id),
            headers=_as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}),
        )
        assert resp.status_code == 403, resp.text

    def test_teacher_can_read_any_students_submissions(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)

        resp = client.get(
            SUBMISSIONS_URL.format(student_id=student_id),
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}),
        )
        assert resp.status_code == 200, resp.text


class TestHomeworkCrossTenantFk:
    def test_create_rejects_subject_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        subject_b = _make_subject(tenant_b)

        resp = client.post(HOMEWORK_URL, json={
            "title": "Exercices", "subject_id": subject_b,
        }, headers=_admin_headers(tenant_a))
        assert resp.status_code == 404

    def test_create_succeeds_with_own_tenant_subject(self):
        tenant_id = _make_tenant()
        subject_id = _make_subject(tenant_id)
        # homework.teacher_id has a real FK to users.id — needs a backing
        # User row, unlike the plain-permission-check tests above.
        admin_id = _make_user(tenant_id)

        resp = client.post(HOMEWORK_URL, json={
            "title": "Exercices", "subject_id": subject_id,
        }, headers=_as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}))
        assert resp.status_code == 201, resp.text
