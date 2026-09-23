"""DIRECTOR could not open their own "Finances" sidebar link.

Permissions audit (2026-09), continuing docs/PERMISSIONS_MATRIX.md into the
finance/payments zone (listed there as "non encore audité"). AdminLayout.tsx
shows DIRECTOR the /admin/finances nav item, gated on frontend permission
"fees:read" — which src/lib/permissions.ts DOES grant DIRECTOR. But the
page's data (useFees -> GET /payments/fees/) is gated backend-side on
"payments:read" (see payments.py::list_fees), and ROLE_PERMISSIONS only gave
DIRECTOR "finance:read" — a string never checked anywhere in the backend
(`grep -rn 'require_permission("finance' backend/app/` returns nothing).
Same recurring class of bug already fixed elsewhere in this codebase for
DIRECTOR (departments, rooms — see security.py's own comments).
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

# fees is a raw-SQL operational table (DDL only in
# app/core/operational_tables.py, no ORM model, never created by
# Base.metadata.create_all()) — Postgres-only, same pattern as
# test_inventory_business_rules.py.
pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="fees is a raw-SQL operational table whose DDL is "
           "Postgres-specific and never created on SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

HEADERS = {"Authorization": "Bearer mock-token"}
BASE = "/api/v1/payments"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Finance Test", slug=f"finance-{tenant_id[:8]}",
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


class TestDirectorCanReadOwnFinancesPage:
    def test_director_can_list_fees(self):
        tenant_id = _make_tenant()
        resp = client.get(f"{BASE}/fees/", headers=_as(tenant_id, "DIRECTOR"))
        assert resp.status_code == 200, resp.text

    def test_director_cannot_create_fee(self):
        """Frontend never grants DIRECTOR fees:manage — read-only is correct."""
        tenant_id = _make_tenant()
        resp = client.post(
            f"{BASE}/fees/", json={"name": "Frais test", "amount": 1000},
            headers=_as(tenant_id, "DIRECTOR"),
        )
        assert resp.status_code == 403
