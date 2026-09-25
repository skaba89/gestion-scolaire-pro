"""3 more instances of the same recurring bug class as
test_director_finance_read_access.py / test_permissions_sweep_2026_09.py:
AdminLayout.tsx shows a role a nav item gated on a frontend permission the
role does hold, but the page's real backend endpoint checks a DIFFERENT
permission the role's backend ROLE_PERMISSIONS entry never granted.

- STAFF, SECRETARY: "/admin/schedule" (frontend "schedule:read") ->
  GET /schedule/ needs backend schedule:read. DIRECTOR's own version of
  this exact gap was already fixed in test_permissions_sweep_2026_09.py,
  but STAFF and SECRETARY (who also hold the frontend permission) were
  missed at the time.
- STAFF: "/admin/scan" (frontend "attendance:read", the QR check-in
  scanner) -> POST /school-life/check-ins/ is gated on school_life:write
  via _can_access_checkin_for_student() (school_life.py). STAFF held
  neither school_life:read nor school_life:write, so the scanner's own
  submit action always 403'd despite the nav link and page being visible.
- STAFF, ACCOUNTANT, SECRETARY: "/admin/analytics", "/admin/decision-
  support", "/admin/ministry-reporting" (frontend "dashboard:admin") ->
  every KPI call (analytics.py) is gated on analytics:read, which none of
  these three roles held.
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

# school_life_check_ins is a raw-SQL operational table (DDL only in
# app/core/operational_tables.py, no ORM model, never created by
# Base.metadata.create_all()) — Postgres-only, same pattern as the other
# permission-sweep test files.
requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="school_life_check_ins is a raw-SQL operational table whose DDL "
           "is Postgres-specific and never created on SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Permissions Test 2", slug=f"perms2-{tenant_id[:8]}",
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


class TestScheduleAccessForStaffAndSecretary:
    def test_staff_can_list_schedule(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/schedule/", headers=_as(tenant_id, "STAFF"))
        assert resp.status_code == 200, resp.text

    def test_secretary_can_list_schedule(self):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/schedule/", headers=_as(tenant_id, "SECRETARY"))
        assert resp.status_code == 200, resp.text


class TestStaffCheckInScanAccess:
    @requires_postgres
    def test_staff_can_read_check_ins_without_school_life_read_before_fix(self):
        """Regression guard for the exact 403 the QR scanner hit: with
        school_life:read now granted, GET /check-ins/ no longer requires
        student_ids at all (the endpoint only demands student_ids when the
        caller lacks school_life:read and must prove self/parent access
        per student)."""
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/school-life/check-ins/", headers=_as(tenant_id, "STAFF"))
        assert resp.status_code == 200, resp.text


class TestAnalyticsAccessForStaffAccountantSecretary:
    @pytest.mark.parametrize("role", ["STAFF", "ACCOUNTANT", "SECRETARY"])
    def test_role_can_read_financial_kpis(self, role):
        tenant_id = _make_tenant()
        resp = client.get("/api/v1/analytics/financial-kpis/", headers=_as(tenant_id, role))
        assert resp.status_code == 200, resp.text
