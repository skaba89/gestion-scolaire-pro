"""Pagination on operational (raw-SQL) endpoints — national audit Phase 3.

A national-scale audit found that most endpoints in
backend/app/api/v1/endpoints/operational/ (incidents, inventory, library,
communication, school_life, alumni, clubs, parents, surveys — modules
written as db.execute(text(...)) rather than SQLAlchemy models) had no
LIMIT/OFFSET at all, unlike academic/ and finance/ which consistently use
page_size: int = Query(50, ge=1, le=100). Left unbounded, these endpoints
would eventually load a tenant's entire history (incidents and inventory
transactions in particular have no purge policy) into memory on every list
call — untenable once a tenant has thousands of rows.

This file proves the fix behaviorally: insert more rows than the default
page size, then assert the endpoint actually caps its result count instead
of just accepting the query params cosmetically.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from sqlalchemy import text  # noqa: E402

# get_test_client() installs a no-op lifespan that deliberately skips
# Alembic/Redis startup, so the real app's ensure_operational_tables(engine)
# call (app/main.py, run on every real boot) never fires for any test in
# this suite. Several operational tables — incidents in particular — have
# NO Alembic migration at all and exist ONLY because of that startup call,
# so tests inserting into them need to trigger it explicitly against a real
# Postgres test database (these raw-SQL modules use Postgres-only syntax
# like ARRAY(), JSONB, TIMESTAMPTZ and gen_random_uuid(), so this file
# cannot run against the SQLite default).
#
# The previous `try/except: pass` here silently swallowed the DDL failure
# on SQLite and let tests run anyway, producing a confusing
# "no such table"/"unrecognized token" failure instead of a clean skip —
# make the documented intent (Postgres-only) an actual pytest skip, matching
# the pattern already used in test_invoice_alias.py for the same reason.
pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="operational_tables.py DDL is Postgres-only (JSONB/TIMESTAMPTZ/gen_random_uuid/ARRAY).",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)


def _make_tenant(name: str) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id,
            name=name,
            slug=f"pagination-{tenant_id[:8]}",
            type="SCHOOL",
            country="GN",
            is_active=True,
            settings={},
        ))
        db.commit()
    return tenant_id


def _as_tenant_admin(tenant_id: str) -> dict:
    """Override get_current_user (bypasses DB/blacklist lookups for speed)
    AND return a real, decodable bearer token for TenantMiddleware, which
    enforces its own "protected route needs a bearer token" check ahead of
    FastAPI's dependency injection (app/middlewares/tenant.py) — dependency
    overrides alone aren't enough for any route outside its public-path
    list, since the middleware runs before routing/dependencies are even
    resolved and never sees the override.
    """
    from app.core.security import create_access_token

    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": "admin@pagination-test.example",
        "roles": ["TENANT_ADMIN"],
        "tenant_id": tenant_id,
    }
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user_id, "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"]})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestIncidentsPagination:
    """incidents.py:list_incidents — flagged as the highest-risk gap: an
    append-only table with no purge policy."""

    def test_list_incidents_caps_at_page_size(self):
        tenant_id = _make_tenant("École Pagination Incidents")
        with SessionLocal() as db:
            for i in range(12):
                db.execute(text("""
                    INSERT INTO incidents (id, tenant_id, title, incident_type, severity, occurred_at, status)
                    VALUES (:id, :tid, :title, 'OTHER', 'LOW', NOW(), 'OPEN')
                """), {"id": str(uuid.uuid4()), "tid": tenant_id, "title": f"Incident {i}"})
            db.commit()

        headers = _as_tenant_admin(tenant_id)
        resp = client.get("/api/v1/incidents/", params={"page_size": 5}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 5

    def test_list_incidents_page_size_is_bounded(self):
        """le=500 on page_size — an attempt to ask for an absurd page_size
        must be rejected by FastAPI's validation, not silently accepted."""
        tenant_id = _make_tenant("École Pagination Incidents 2")
        headers = _as_tenant_admin(tenant_id)
        resp = client.get("/api/v1/incidents/", params={"page_size": 100000}, headers=headers)
        assert resp.status_code == 422, resp.text


class TestInventoryPagination:
    """inventory.py — items, transactions (the unbounded movement log) and orders."""

    def test_list_items_caps_at_page_size(self):
        tenant_id = _make_tenant("École Pagination Inventory")
        with SessionLocal() as db:
            for i in range(12):
                db.execute(text("""
                    INSERT INTO inventory_items (id, tenant_id, name, unit_price, stock_quantity)
                    VALUES (:id, :tid, :name, 1000, 10)
                """), {"id": str(uuid.uuid4()), "tid": tenant_id, "name": f"Item {i}"})
            db.commit()

        headers = _as_tenant_admin(tenant_id)
        resp = client.get("/api/v1/inventory/items/", params={"page_size": 5}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 5

    def test_list_transactions_caps_at_page_size(self):
        """The movement log — flagged as the module's biggest scalability
        risk since it has no purge policy and grows with every stock move."""
        tenant_id = _make_tenant("École Pagination Inventory Tx")
        with SessionLocal() as db:
            item_id = str(uuid.uuid4())
            db.execute(text("""
                INSERT INTO inventory_items (id, tenant_id, name, unit_price, stock_quantity)
                VALUES (:id, :tid, 'Stocked Item', 1000, 100)
            """), {"id": item_id, "tid": tenant_id})
            for i in range(12):
                db.execute(text("""
                    INSERT INTO inventory_transactions (id, tenant_id, item_id, type, quantity, created_at)
                    VALUES (:id, :tid, :item_id, 'IN', 1, NOW())
                """), {"id": str(uuid.uuid4()), "tid": tenant_id, "item_id": item_id})
            db.commit()

        headers = _as_tenant_admin(tenant_id)
        resp = client.get("/api/v1/inventory/transactions/", params={"page_size": 5}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 5


class TestCommunicationPagination:
    """communication.py — announcements and the messaging user directory."""

    def test_get_announcements_caps_at_page_size(self):
        tenant_id = _make_tenant("École Pagination Comm")
        from app.models.user import User

        author_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(User(
                id=author_id, tenant_id=tenant_id,
                email=f"author-{author_id}@example.com",
                username=f"author-{author_id}",
                first_name="Auteur", last_name="Test", is_active=True,
            ))
            db.commit()
            for i in range(12):
                db.execute(text("""
                    INSERT INTO announcements (id, tenant_id, author_id, title, content, target_roles, pinned, created_at)
                    VALUES (:id, :tid, :author_id, :title, 'Contenu', '["TENANT_ADMIN"]'::jsonb, false, NOW())
                """), {"id": str(uuid.uuid4()), "tid": tenant_id, "author_id": author_id, "title": f"Annonce {i}"})
            db.commit()

        headers = _as_tenant_admin(tenant_id)
        resp = client.get("/api/v1/communication/announcements/", params={"page_size": 5}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 5


class TestLibraryPagination:
    def test_list_resources_caps_at_page_size(self):
        tenant_id = _make_tenant("École Pagination Bibliotheque")
        with SessionLocal() as db:
            for i in range(12):
                db.execute(text("""
                    INSERT INTO library_resources (id, tenant_id, title, resource_type, created_at)
                    VALUES (:id, :tid, :title, 'BOOK', NOW())
                """), {"id": str(uuid.uuid4()), "tid": tenant_id, "title": f"Livre {i}"})
            db.commit()

        headers = _as_tenant_admin(tenant_id)
        resp = client.get("/api/v1/library/resources/", params={"page_size": 5}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 5


class TestRemainingOperationalEndpointsAcceptPageSize:
    """For the remaining fixed endpoints, prove at minimum that page_size
    is a recognized, validated parameter (rejects an absurd value with 422)
    rather than being silently ignored — a lighter but still meaningful
    signal that the LIMIT is wired to a real, bounded query parameter."""

    @pytest.mark.parametrize("path", [
        "/api/v1/library/borrowers/",
        "/api/v1/communication/conversations/",
        "/api/v1/communication/messaging/users/",
        "/api/v1/communication/forums/",
        "/api/v1/school-life/badges/",
        "/api/v1/school-life/event-registrations/",
        "/api/v1/alumni/document-requests/",
        "/api/v1/clubs/memberships/",
        "/api/v1/parents/",
        "/api/v1/parents/unlinked-students/",
        "/api/v1/surveys/",
        "/api/v1/inventory/orders/",
    ])
    def test_absurd_page_size_rejected(self, path):
        tenant_id = _make_tenant("École Pagination Générique")
        headers = _as_tenant_admin(tenant_id)
        resp = client.get(path, params={"page_size": 100000}, headers=headers)
        assert resp.status_code == 422, f"{path}: {resp.status_code} {resp.text}"
