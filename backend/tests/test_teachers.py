"""Teacher assignments (academic/teachers.py) — national audit Phase 4
(commercial module stabilization).

This module (création, matières, classes, planning) had no dedicated test
file despite already being reasonably well-built (pagination + tenant
scoping + audit log already present in every handler). This file closes
that coverage gap: create/list/update/delete, tenant isolation (a teacher
assignment from tenant A must never leak into tenant B's list), pagination
behavior, and permission gating (settings:write required for mutations).

Uses gen_random_uuid() (Postgres-only, in create_teacher_assignment) like
the rest of the raw-SQL operational/academic modules in this codebase —
run against a real Postgres test database, not the SQLite default.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from sqlalchemy import text  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="create_teacher_assignment uses gen_random_uuid() (Postgres-only).",
)

# teacher_assignments has no Alembic migration — it exists only because
# ensure_operational_tables(engine) creates it at real app startup (see
# app/core/operational_tables.py). get_test_client()'s no-op lifespan skips
# that call, so this file triggers it explicitly (same pattern as
# test_operational_pagination.py / test_operational_indexes.py).
if engine.dialect.name == "postgresql":
    try:
        from app.core.operational_tables import ensure_operational_tables
        ensure_operational_tables(engine)
    except Exception:
        pass

TEACHERS_URL = "/api/v1/teachers/"


def _make_tenant(name: str) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"teachers-{tenant_id[:8]}",
            type="SCHOOL", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_teacher_user(tenant_id: str, *, first_name: str = "Mamadou", last_name: str = "Bah") -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id,
            email=f"{user_id[:8]}@teachers-test.example",
            username=f"teacher-{user_id[:8]}",
            first_name=first_name, last_name=last_name,
            is_active=True,
        ))
        db.commit()
    return user_id


def _as(user: dict) -> dict:
    """Override get_current_user AND return a real bearer token —
    TenantMiddleware enforces its own bearer-token check ahead of FastAPI's
    dependency injection, so an override alone isn't enough (same pattern as
    test_operational_pagination.py / test_ministry.py)."""
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _tenant_admin(tenant_id: str) -> dict:
    return _as({"id": str(uuid.uuid4()), "email": "admin@teachers-test.example", "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestTeacherAssignmentCRUD:
    def test_create_list_update_delete_assignment(self):
        tenant_id = _make_tenant("École Teachers CRUD")
        teacher_id = _make_teacher_user(tenant_id)
        headers = _tenant_admin(tenant_id)

        create_resp = client.post(TEACHERS_URL, json={"teacher_id": teacher_id}, headers=headers)
        assert create_resp.status_code == 201, create_resp.text
        assignment_id = create_resp.json()["id"]

        list_resp = client.get(TEACHERS_URL, headers=headers)
        assert list_resp.status_code == 200, list_resp.text
        body = list_resp.json()
        assert body["total"] == 1
        assert body["items"][0]["teacher"]["first_name"] == "Mamadou"

        subject_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Subject(id=subject_id, tenant_id=tenant_id, name="Mathématiques", coefficient=3.0))
            db.commit()
        update_resp = client.put(f"{TEACHERS_URL}{assignment_id}/", json={"subject_id": subject_id}, headers=headers)
        assert update_resp.status_code == 200, update_resp.text
        assert update_resp.json()["subject_id"] == subject_id

        delete_resp = client.delete(f"{TEACHERS_URL}{assignment_id}/", headers=headers)
        assert delete_resp.status_code == 200, delete_resp.text

        after_delete = client.get(TEACHERS_URL, headers=headers)
        assert after_delete.json()["total"] == 0

    def test_update_unknown_assignment_returns_404(self):
        tenant_id = _make_tenant("École Teachers 404")
        headers = _tenant_admin(tenant_id)
        resp = client.put(f"{TEACHERS_URL}{uuid.uuid4()}/", json={"subject_id": str(uuid.uuid4())}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_mutations_require_settings_write_permission(self):
        """PARENT has no settings:write — the write endpoints must 403, not
        silently allow assignment tampering from an unrelated role."""
        tenant_id = _make_tenant("École Teachers Perms")
        teacher_id = _make_teacher_user(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id})

        resp = client.post(TEACHERS_URL, json={"teacher_id": teacher_id}, headers=headers)
        assert resp.status_code == 403, resp.text


class TestTeacherAssignmentTenantIsolation:
    def test_assignment_from_other_tenant_never_appears_in_list(self):
        tenant_a = _make_tenant("École Teachers Tenant A")
        tenant_b = _make_tenant("École Teachers Tenant B")
        teacher_a = _make_teacher_user(tenant_a, first_name="Aissatou")
        teacher_b = _make_teacher_user(tenant_b, first_name="Fatoumata")

        client.post(TEACHERS_URL, json={"teacher_id": teacher_a}, headers=_tenant_admin(tenant_a))
        client.post(TEACHERS_URL, json={"teacher_id": teacher_b}, headers=_tenant_admin(tenant_b))

        resp_a = client.get(TEACHERS_URL, headers=_tenant_admin(tenant_a))
        assert resp_a.status_code == 200, resp_a.text
        names_a = [item["teacher"]["first_name"] for item in resp_a.json()["items"]]
        assert names_a == ["Aissatou"]
        assert "Fatoumata" not in names_a

    def test_delete_cannot_cross_tenant_boundary(self):
        """Tenant B must not be able to delete tenant A's assignment by
        guessing its id — the WHERE tenant_id=:tid clause must hold."""
        tenant_a = _make_tenant("École Teachers Delete A")
        tenant_b = _make_tenant("École Teachers Delete B")
        teacher_a = _make_teacher_user(tenant_a)

        create_resp = client.post(TEACHERS_URL, json={"teacher_id": teacher_a}, headers=_tenant_admin(tenant_a))
        assignment_id = create_resp.json()["id"]

        cross_tenant_delete = client.delete(f"{TEACHERS_URL}{assignment_id}/", headers=_tenant_admin(tenant_b))
        assert cross_tenant_delete.status_code == 404, cross_tenant_delete.text

        still_there = client.get(TEACHERS_URL, headers=_tenant_admin(tenant_a))
        assert still_there.json()["total"] == 1


class TestTeacherAssignmentPagination:
    def test_list_caps_at_page_size(self):
        tenant_id = _make_tenant("École Teachers Pagination")
        headers = _tenant_admin(tenant_id)
        for i in range(7):
            teacher_id = _make_teacher_user(tenant_id, first_name=f"Prof{i}")
            client.post(TEACHERS_URL, json={"teacher_id": teacher_id}, headers=headers)

        resp = client.get(TEACHERS_URL, params={"page_size": 3}, headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["items"]) == 3
        assert body["total"] == 7
        assert body["pages"] == 3

    def test_page_size_is_bounded(self):
        tenant_id = _make_tenant("École Teachers Pagination Bound")
        headers = _tenant_admin(tenant_id)
        resp = client.get(TEACHERS_URL, params={"page_size": 100000}, headers=headers)
        assert resp.status_code == 422, resp.text
