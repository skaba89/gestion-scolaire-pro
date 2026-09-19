"""PUT /incidents/{id}/assign/ (operational/incidents.py::assign_incident)
— institutional-readiness audit, 2026-09.

Two bugs found together. (a) resolver_id was written straight into
assigned_to with no check it's a real user in this tenant — a typo or
stray id silently created an orphaned assignment (no FK enforcement on
this raw-SQL column). (b) assigned_to didn't even exist as a column on
`incidents` at all — every call raised UndefinedColumn on real Postgres,
so incident assignment has never worked; fixed by adding the column via
app/core/operational_tables.py's additive ALTER TABLE block, same pattern
already used there for title/occurred_at/location/resolved_by/etc.

incidents is a raw-SQL operational table — Postgres-only, same pattern as
test_message_reactions_authorization.py."""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="incidents is a raw-SQL operational table whose DDL is "
           "Postgres-specific and never created on SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

BASE = "/api/v1/incidents"


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
            id=tenant_id, name="École Incidents Test", slug=f"incidents-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
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


def _make_incident(tenant_id: str) -> str:
    from sqlalchemy import text
    incident_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO incidents (id, tenant_id, title, description, incident_type, severity, occurred_at)
            VALUES (:id, :tid, 'Bagarre', 'Description', 'DISCIPLINE', 'MEDIUM', NOW())
        """), {"id": incident_id, "tid": tenant_id})
        db.commit()
    return incident_id


class TestAssignIncidentValidatesResolver:
    def test_unknown_resolver_id_is_rejected(self):
        tenant_id = _make_tenant()
        admin_id = _make_user(tenant_id)
        incident_id = _make_incident(tenant_id)
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.put(f"{BASE}/{incident_id}/assign/", json={"resolver_id": str(uuid.uuid4())}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_resolver_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        admin_id = _make_user(tenant_a)
        foreign_user_id = _make_user(tenant_b)
        incident_id = _make_incident(tenant_a)
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.put(f"{BASE}/{incident_id}/assign/", json={"resolver_id": foreign_user_id}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_valid_resolver_in_same_tenant_is_accepted(self):
        tenant_id = _make_tenant()
        admin_id = _make_user(tenant_id)
        resolver_id = _make_user(tenant_id)
        incident_id = _make_incident(tenant_id)
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.put(f"{BASE}/{incident_id}/assign/", json={"resolver_id": resolver_id}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["assigned_to"] == resolver_id
        assert resp.json()["status"] == "ASSIGNED"
