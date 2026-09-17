"""POST /homework/{homework_id}/submit/ took body.student_id directly from
the client with no ownership check at all (institutional-readiness audit,
2026-09) — any authenticated user, including another STUDENT or a
TEACHER/STAFF account, could forge a homework submission for an arbitrary
student_id in the tenant. Fixed via _can_submit_for_student(): the caller
must be the student themselves, a parent linked to that student, or a
homework:write holder (TEACHER) submitting on the student's behalf.
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
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

# homework_submissions is a raw operational table (Postgres-specific DDL:
# gen_random_uuid()/TIMESTAMPTZ, see app/core/operational_tables.py) never
# created in the SQLite test lifespan — same constraint as
# test_alumni_ownership_authorization.py. The 403-rejection tests below
# short-circuit in _can_submit_for_student() before ever reaching that
# table, so only the successful-insert paths need this skip.
_needs_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="homework_submissions is a raw Postgres-only operational table (see app/core/operational_tables.py).",
)

SUBMIT_URL = "/api/v1/homework/{homework_id}/submit/"


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
            id=tenant_id, name="École Devoirs Test", slug=f"hw-{tenant_id[:8]}",
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


def _make_student(tenant_id: str, *, user_id: str | None = None) -> str:
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


class TestHomeworkSubmissionOwnership:
    def test_student_cannot_submit_for_another_student(self):
        tenant_id = _make_tenant()
        attacker_user_id = _make_user(tenant_id)
        _make_student(tenant_id, user_id=attacker_user_id)
        victim_student_id = _make_student(tenant_id)

        resp = client.post(
            SUBMIT_URL.format(homework_id=str(uuid.uuid4())),
            headers=_as({"id": attacker_user_id, "roles": ["STUDENT"], "tenant_id": tenant_id}),
            json={"homework_id": str(uuid.uuid4()), "student_id": victim_student_id, "content": "Forgé"},
        )
        assert resp.status_code == 403, resp.text

    @_needs_postgres
    def test_student_can_submit_for_self(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        student_id = _make_student(tenant_id, user_id=user_id)

        resp = client.post(
            SUBMIT_URL.format(homework_id=str(uuid.uuid4())),
            headers=_as({"id": user_id, "roles": ["STUDENT"], "tenant_id": tenant_id}),
            json={"homework_id": str(uuid.uuid4()), "student_id": student_id, "content": "Ma réponse"},
        )
        assert resp.status_code == 201, resp.text

    @_needs_postgres
    def test_parent_can_submit_for_own_child(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        student_id = _make_student(tenant_id)
        _link_parent(tenant_id, parent_id=parent_id, student_id=student_id)

        resp = client.post(
            SUBMIT_URL.format(homework_id=str(uuid.uuid4())),
            headers=_as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}),
            json={"homework_id": str(uuid.uuid4()), "student_id": student_id, "content": "Réponse de mon enfant"},
        )
        assert resp.status_code == 201, resp.text

    def test_parent_cannot_submit_for_unrelated_student(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        unrelated_student_id = _make_student(tenant_id)

        resp = client.post(
            SUBMIT_URL.format(homework_id=str(uuid.uuid4())),
            headers=_as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}),
            json={"homework_id": str(uuid.uuid4()), "student_id": unrelated_student_id, "content": "Forgé"},
        )
        assert resp.status_code == 403, resp.text

    @_needs_postgres
    def test_teacher_can_submit_on_behalf_of_student(self):
        tenant_id = _make_tenant()
        teacher_id = str(uuid.uuid4())
        student_id = _make_student(tenant_id)

        resp = client.post(
            SUBMIT_URL.format(homework_id=str(uuid.uuid4())),
            headers=_as({"id": teacher_id, "roles": ["TEACHER"], "tenant_id": tenant_id}),
            json={"homework_id": str(uuid.uuid4()), "student_id": student_id, "content": "Soumis en présentiel"},
        )
        assert resp.status_code == 201, resp.text
