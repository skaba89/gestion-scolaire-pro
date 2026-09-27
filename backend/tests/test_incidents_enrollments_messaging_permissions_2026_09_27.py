"""3 more instances of the recurring "bare get_current_user() while sibling
write endpoints require a real permission" bug, found by a third systematic
audit sweep (same bug class as test_no_permission_listing_endpoints_2026_09_27.py
and test_permissions_sweep_2026_09_25.py):

- operational/incidents.py::list_incidents (GET /incidents/) had no
  permission check at all, while create_incident/update_incident/
  resolve_incident/assign_incident on the same router all require
  settings:write. Any authenticated tenant user could read every raw
  incident record (title, description, notes, student_ids, location,
  reporter/resolver identity) tenant-wide. Gated on settings:write to match
  its siblings exactly; DIRECTOR already holds settings:write.
- operational/infrastructure.py::read_enrollments (GET
  /infrastructure/enrollments/) had no permission check, unlike its own
  alias route (aliases.py::list_enrollments_alias, GET /enrollments/,
  serving the same data) which already requires enrollments:read. Gated to
  match the alias.
- operational/communication.py::get_messaging_users (GET
  /communication/messaging/users/) had no permission check — any
  authenticated tenant user (STUDENT/PARENT/ALUMNI included) could
  enumerate every user's id/name/email/roles tenant-wide. Gated on
  users:read (its frontend callers are admin-only composer components).
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}

# incidents is a raw-SQL operational table (DDL only in
# app/core/operational_tables.py, no ORM model) — Postgres-only, same
# pattern as the other permission-sweep test files.
requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="incidents is a raw-SQL operational table whose DDL is "
           "Postgres-specific and never created on SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Permissions Test 3", slug=f"perms3-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _as(tenant_id: str, role: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": [role], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestIncidentsListRequiresSettingsWrite:
    @requires_postgres
    def test_student_cannot_list_incidents(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/incidents/", headers=_as(tenant_id, "STUDENT"))
        assert resp.status_code == 403, resp.text

    @requires_postgres
    def test_parent_cannot_list_incidents(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/incidents/", headers=_as(tenant_id, "PARENT"))
        assert resp.status_code == 403, resp.text

    @requires_postgres
    def test_director_can_list_incidents(self):
        """DIRECTOR already holds settings:write — must not regress."""
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/incidents/", headers=_as(tenant_id, "DIRECTOR"))
        assert resp.status_code == 200, resp.text


class TestInfrastructureEnrollmentsRequiresEnrollmentsRead:
    def test_student_cannot_read_enrollments(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/infrastructure/enrollments/", headers=_as(tenant_id, "STUDENT"))
        assert resp.status_code == 403, resp.text

    def test_parent_cannot_read_enrollments(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/infrastructure/enrollments/", headers=_as(tenant_id, "PARENT"))
        assert resp.status_code == 403, resp.text

    def test_director_can_read_enrollments(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/infrastructure/enrollments/", headers=_as(tenant_id, "DIRECTOR"))
        assert resp.status_code == 200, resp.text


class TestMessagingUsersRequiresUsersRead:
    def test_student_cannot_list_messaging_users(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/communication/messaging/users/", headers=_as(tenant_id, "STUDENT"))
        assert resp.status_code == 403, resp.text

    def test_parent_cannot_list_messaging_users(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/communication/messaging/users/", headers=_as(tenant_id, "PARENT"))
        assert resp.status_code == 403, resp.text

    @requires_postgres
    def test_teacher_can_list_messaging_users(self):
        """TEACHER already holds users:read — must not regress.

        Postgres-only: the endpoint's raw SQL uses array_agg(), which SQLite
        doesn't support — a pre-existing incompatibility, unrelated to this
        permission fix (the 403 path for STUDENT/PARENT above never reaches
        the query, so it isn't affected either way)."""
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/communication/messaging/users/", headers=_as(tenant_id, "TEACHER"))
        assert resp.status_code == 200, resp.text

    @requires_postgres
    def test_director_can_list_messaging_users(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/communication/messaging/users/", headers=_as(tenant_id, "DIRECTOR"))
        assert resp.status_code == 200, resp.text
