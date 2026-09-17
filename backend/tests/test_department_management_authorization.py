"""Department (faculté) management authorization — institutional-readiness
audit, 2026-09, university/LMD "base structure".

academic/departments.py used to gate every route on settings:read/
settings:write instead of the dedicated departments:read/departments:write
permissions that already existed in ROLE_PERMISSIONS (app/core/security.py)
— a "dead" granular permission nobody actually checked, same class of bug
already fixed for levels.py. It happened to work for TENANT_ADMIN/DIRECTOR
only because they also hold settings:write, but DEPARTMENT_HEAD — a role
the frontend describes as having "Gestion complète du département"
(src/lib/permissions.ts, "department:own") — held neither departments:write
nor settings:write, so they could never edit even their own department.

Fixed: departments:read/write added where the frontend already promised
them (DIRECTOR full access, STAFF/SECRETARY read-only for the student
creation form which fetches a department by id), and DEPARTMENT_HEAD gets
an ownership-scoped update path (their own department only, never an
arbitrary one).
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.department import Department  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

DEPARTMENTS_URL = "/api/v1/departments/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class _AuthedClient:
    """TenantMiddleware decodes the JWT itself (not via the get_current_user
    dependency), so a dependency override alone isn't enough — a real
    bearer token is required too, same pattern as test_payment_receipt.py."""

    def __init__(self, headers: dict):
        self._headers = headers

    def get(self, url, **kwargs):
        return client.get(url, headers=self._headers, **kwargs)

    def post(self, url, **kwargs):
        return client.post(url, headers=self._headers, **kwargs)

    def put(self, url, **kwargs):
        return client.put(url, headers=self._headers, **kwargs)

    def delete(self, url, **kwargs):
        return client.delete(url, headers=self._headers, **kwargs)


def _as(user: dict) -> _AuthedClient:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return _AuthedClient({"Authorization": f"Bearer {token}"})


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Département Test", slug=f"dept-{tenant_id[:8]}",
            type="university", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_department(tenant_id: str, *, head_id: str | None = None) -> str:
    dept_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Department(
            id=dept_id, tenant_id=tenant_id, name="Faculté des Sciences",
            code="SCI", head_id=head_id,
        ))
        db.commit()
    return dept_id


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


class TestDepartmentPermissions:
    def test_tenant_admin_can_create_department(self):
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}).post(
            DEPARTMENTS_URL, json={"name": "Faculté de Droit"},
        )
        assert resp.status_code == 200, resp.text

    def test_director_can_create_department(self):
        """DIRECTOR holds departments:write now — frontend already promised
        "departments:manage" for this role (src/lib/permissions.ts)."""
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["DIRECTOR"], "tenant_id": tenant_id}).post(
            DEPARTMENTS_URL, json={"name": "Faculté de Médecine"},
        )
        assert resp.status_code == 200, resp.text

    def test_department_head_cannot_create_department(self):
        """department:own means editing their own department, never
        creating new ones tenant-wide."""
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id}).post(
            DEPARTMENTS_URL, json={"name": "Faculté Fantôme"},
        )
        assert resp.status_code == 403, resp.text

    def test_department_head_can_read_departments(self):
        tenant_id = _make_tenant()
        _make_department(tenant_id)
        resp = _as({"id": str(uuid.uuid4()), "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id}).get(
            DEPARTMENTS_URL,
        )
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1

    def test_staff_can_read_department_for_student_form(self):
        """useStudentForm.ts fetches GET /departments/{id}/ for the student
        creation form — STAFF (students:write) must not regress here."""
        tenant_id = _make_tenant()
        dept_id = _make_department(tenant_id)
        resp = _as({"id": str(uuid.uuid4()), "roles": ["STAFF"], "tenant_id": tenant_id}).get(
            f"{DEPARTMENTS_URL}{dept_id}/",
        )
        assert resp.status_code == 200, resp.text

    def test_secretary_can_read_department_for_student_form(self):
        tenant_id = _make_tenant()
        dept_id = _make_department(tenant_id)
        resp = _as({"id": str(uuid.uuid4()), "roles": ["SECRETARY"], "tenant_id": tenant_id}).get(
            f"{DEPARTMENTS_URL}{dept_id}/",
        )
        assert resp.status_code == 200, resp.text

    def test_teacher_cannot_read_departments(self):
        """TEACHER has no departments:read — no frontend screen for this
        role reads the department list, so no regression to preserve."""
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}).get(
            DEPARTMENTS_URL,
        )
        assert resp.status_code == 403, resp.text


class TestDepartmentHeadOwnershipScoping:
    def test_department_head_can_update_their_own_department(self):
        tenant_id = _make_tenant()
        head_user_id = _make_user(tenant_id)
        dept_id = _make_department(tenant_id, head_id=head_user_id)

        resp = _as({"id": head_user_id, "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id}).put(
            f"{DEPARTMENTS_URL}{dept_id}/", json={"description": "Mise à jour par le chef"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["description"] == "Mise à jour par le chef"

    def test_department_head_cannot_update_another_department(self):
        tenant_id = _make_tenant()
        head_user_id = _make_user(tenant_id)
        other_head_id = _make_user(tenant_id)
        dept_id = _make_department(tenant_id, head_id=other_head_id)

        resp = _as({"id": head_user_id, "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id}).put(
            f"{DEPARTMENTS_URL}{dept_id}/", json={"description": "Tentative non autorisée"},
        )
        assert resp.status_code == 403, resp.text

    def test_tenant_admin_can_update_any_department(self):
        tenant_id = _make_tenant()
        other_head_id = _make_user(tenant_id)
        dept_id = _make_department(tenant_id, head_id=other_head_id)

        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}).put(
            f"{DEPARTMENTS_URL}{dept_id}/", json={"description": "Mise à jour admin"},
        )
        assert resp.status_code == 200, resp.text

    def test_department_head_cannot_delete_even_their_own_department(self):
        tenant_id = _make_tenant()
        head_user_id = _make_user(tenant_id)
        dept_id = _make_department(tenant_id, head_id=head_user_id)

        resp = _as({"id": head_user_id, "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id}).delete(
            f"{DEPARTMENTS_URL}{dept_id}/",
        )
        assert resp.status_code == 403, resp.text
