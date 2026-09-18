"""POST/PUT /teachers/ (academic/teachers.py) — institutional-readiness
audit, 2026-09.

create_teacher_assignment/update_teacher_assignment inserted/updated
teacher_id/class_id/subject_id verbatim with no check they belong to the
caller's tenant — a TENANT_ADMIN could assign a cross-tenant user as a
teacher, or point the assignment at a cross-tenant classroom/subject."""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

BASE = "/api/v1/teachers"

_needs_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="raw SQL WHERE id=:param can't match SQLite's hex-no-dash GUID storage (see teachers.py).",
)


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
            id=tenant_id, name="École Affectations Test", slug=f"teach-{tenant_id[:8]}",
            type="secondary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", is_active=True,
        ))
        db.commit()
    return user_id


def _make_classroom(tenant_id: str) -> str:
    class_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Classroom(id=class_id, tenant_id=tenant_id, name="6eme A"))
        db.commit()
    return class_id


def _make_subject(tenant_id: str) -> str:
    subject_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name="Mathématiques"))
        db.commit()
    return subject_id


class TestCreateTeacherAssignmentValidatesForeignKeys:
    @_needs_postgres
    def test_teacher_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        class_id = _make_classroom(tenant_a)
        subject_id = _make_subject(tenant_a)
        foreign_teacher_id = _make_user(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/", json={
            "teacher_id": foreign_teacher_id, "class_id": class_id, "subject_id": subject_id,
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    @_needs_postgres
    def test_class_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        teacher_id = _make_user(tenant_a)
        subject_id = _make_subject(tenant_a)
        foreign_class_id = _make_classroom(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/", json={
            "teacher_id": teacher_id, "class_id": foreign_class_id, "subject_id": subject_id,
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    @_needs_postgres
    def test_subject_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        teacher_id = _make_user(tenant_a)
        class_id = _make_classroom(tenant_a)
        foreign_subject_id = _make_subject(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/", json={
            "teacher_id": teacher_id, "class_id": class_id, "subject_id": foreign_subject_id,
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    @_needs_postgres
    def test_valid_assignment_within_own_tenant_is_created(self):
        tenant_id = _make_tenant()
        teacher_id = _make_user(tenant_id)
        class_id = _make_classroom(tenant_id)
        subject_id = _make_subject(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/", json={
            "teacher_id": teacher_id, "class_id": class_id, "subject_id": subject_id,
        }, headers=headers)
        assert resp.status_code == 201, resp.text


class TestUpdateTeacherAssignmentValidatesForeignKeys:
    @_needs_postgres
    def test_update_rejects_class_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        teacher_id = _make_user(tenant_a)
        class_id = _make_classroom(tenant_a)
        subject_id = _make_subject(tenant_a)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})
        created = client.post(f"{BASE}/", json={
            "teacher_id": teacher_id, "class_id": class_id, "subject_id": subject_id,
        }, headers=headers)
        assert created.status_code == 201, created.text
        assignment_id = created.json()["id"]

        foreign_class_id = _make_classroom(tenant_b)
        updated = client.put(f"{BASE}/{assignment_id}/", json={"class_id": foreign_class_id}, headers=headers)
        assert updated.status_code == 404, updated.text
