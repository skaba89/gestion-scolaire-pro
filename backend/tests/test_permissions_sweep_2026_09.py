"""3 more roles 403'd on their own sidebar links — same sweep, same
methodology as test_director_finance_read_access.py (continuing
docs/PERMISSIONS_MATRIX.md's audit): AdminLayout.tsx shows a role a nav
item gated on a frontend permission that role does have, but the page's
real backend endpoint checks a DIFFERENT permission the role's backend
ROLE_PERMISSIONS entry never granted.

- DIRECTOR: "/admin/schedule" (schedule:read) -> GET /schedule/ needs
  schedule:read; "/admin/elearning" (homework:read) -> GET
  /analytics/elearning/courses/ needs homework:read. Neither was granted.
- DEPARTMENT_HEAD: "/admin/enrollments" (enrollments:read) -> GET
  /enrollments/ needs enrollments:read; "/admin/elearning" (homework:read)
  -> same endpoint as above. Neither was granted.
- STAFF: "/admin/enrollments" (enrollments:read) -> same endpoint as
  above. Not granted (frontend also implies write via
  enrollments:create/update/manage, so write is checked too).

The two elearning-courses tests are Postgres-only: elearning_courses is a
raw-SQL operational table (app/core/operational_tables.py), never created
by Base.metadata.create_all() on the SQLite test DB.
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

# elearning_courses/elearning_enrollments are raw-SQL operational tables
# (DDL only in app/core/operational_tables.py, no ORM model, never created
# by Base.metadata.create_all()) — Postgres-only, same pattern as
# test_director_finance_read_access.py.
requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="elearning_courses is a raw-SQL operational table whose DDL is "
           "Postgres-specific and never created on SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Permissions Test", slug=f"perms-{tenant_id[:8]}",
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


class TestDirectorScheduleAndElearningAccess:
    def test_director_can_list_schedule(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/schedule/", headers=_as(tenant_id, "DIRECTOR"))
        assert resp.status_code == 200, resp.text

    @requires_postgres
    def test_director_can_list_elearning_courses(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/analytics/elearning/courses/", headers=_as(tenant_id, "DIRECTOR"))
        assert resp.status_code == 200, resp.text


class TestDepartmentHeadEnrollmentsAndElearningAccess:
    def test_department_head_can_list_enrollments(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/enrollments/", headers=_as(tenant_id, "DEPARTMENT_HEAD"))
        assert resp.status_code == 200, resp.text

    @requires_postgres
    def test_department_head_can_list_elearning_courses(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/analytics/elearning/courses/", headers=_as(tenant_id, "DEPARTMENT_HEAD"))
        assert resp.status_code == 200, resp.text


class TestStaffEnrollmentsAccess:
    def test_staff_can_list_enrollments(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/enrollments/", headers=_as(tenant_id, "STAFF"))
        assert resp.status_code == 200, resp.text
