"""Faculty (top-level LMD division) CRUD authorization — module université
build-out, 2026-09.

Faculty is a genuinely new entity (see app/models/faculty.py), not a
relabeling of Department: it sits above Department in the hierarchy
(Faculty -> Department -> Subject/UE). Permission split mirrors
departments:read/write exactly (see app/core/security.py) since the
audit's own recommendation was "same read/write shape as departments,
DEPARTMENT_HEAD read-only" — a faculty is tenant-wide structure, not
something a department head manages.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.faculty import Faculty  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

FACULTIES_URL = "/api/v1/faculties/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class _AuthedClient:
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
            id=tenant_id, name="Université Test", slug=f"fac-{tenant_id[:8]}",
            type="university", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_faculty(tenant_id: str) -> str:
    faculty_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Faculty(id=faculty_id, tenant_id=tenant_id, name="Faculté des Sciences", code="SCI"))
        db.commit()
    return faculty_id


class TestFacultyPermissions:
    def test_tenant_admin_can_create_faculty(self):
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}).post(
            FACULTIES_URL, json={"name": "Faculté de Droit"},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["name"] == "Faculté de Droit"

    def test_director_can_create_faculty(self):
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["DIRECTOR"], "tenant_id": tenant_id}).post(
            FACULTIES_URL, json={"name": "Faculté de Médecine"},
        )
        assert resp.status_code == 201, resp.text

    def test_department_head_cannot_create_faculty(self):
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id}).post(
            FACULTIES_URL, json={"name": "Faculté Fantôme"},
        )
        assert resp.status_code == 403, resp.text

    def test_department_head_can_read_faculties(self):
        tenant_id = _make_tenant()
        _make_faculty(tenant_id)
        resp = _as({"id": str(uuid.uuid4()), "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id}).get(
            FACULTIES_URL,
        )
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1

    def test_department_head_cannot_update_faculty(self):
        tenant_id = _make_tenant()
        faculty_id = _make_faculty(tenant_id)
        resp = _as({"id": str(uuid.uuid4()), "roles": ["DEPARTMENT_HEAD"], "tenant_id": tenant_id}).put(
            f"{FACULTIES_URL}{faculty_id}/", json={"description": "Tentative"},
        )
        assert resp.status_code == 403, resp.text

    def test_tenant_admin_can_update_faculty(self):
        tenant_id = _make_tenant()
        faculty_id = _make_faculty(tenant_id)
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}).put(
            f"{FACULTIES_URL}{faculty_id}/", json={"description": "Mise à jour"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["description"] == "Mise à jour"

    def test_teacher_cannot_read_faculties(self):
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}).get(
            FACULTIES_URL,
        )
        assert resp.status_code == 403, resp.text

    def test_tenant_admin_can_delete_faculty(self):
        tenant_id = _make_tenant()
        faculty_id = _make_faculty(tenant_id)
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}).delete(
            f"{FACULTIES_URL}{faculty_id}/",
        )
        assert resp.status_code == 200, resp.text

    def test_faculty_not_found_returns_404(self):
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}).get(
            f"{FACULTIES_URL}{uuid.uuid4()}/",
        )
        assert resp.status_code == 404, resp.text

    def test_faculty_is_tenant_scoped(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        faculty_id = _make_faculty(tenant_a)
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_b}).get(
            f"{FACULTIES_URL}{faculty_id}/",
        )
        assert resp.status_code == 404, resp.text
