"""Institutional-readiness audit (2026-09), business-rules subagent —
inventory.py had two data-integrity gaps:

- adjust_stock(): no floor check — an OUT larger than current stock, or a
  negative ADJUST, silently drove stock_quantity negative.
- create_order(): stock was decremented with no prior check that enough
  existed (oversell), and total_amount / each item's unit_price were
  client-supplied and stored verbatim instead of the item's real price.

inventory_items/orders/order_items are raw-SQL operational tables (DDL
only in app/core/operational_tables.py, no ORM model, never created by
Base.metadata.create_all()) — Postgres-only, same pattern as
test_message_reactions_authorization.py."""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="inventory_items/orders/order_items are raw-SQL operational "
           "tables whose DDL is Postgres-specific and never created on "
           "SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

BASE = "/api/v1/inventory"


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Inventaire Test", slug=f"inventory-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_item(headers: dict, name: str = "Cahier", price: float = 5000.0, qty: int = 10) -> str:
    created = client.post(f"{BASE}/items/", json={"name": name, "unit_price": price, "stock_quantity": qty}, headers=headers)
    assert created.status_code == 200, created.text
    return created.json()["id"]


class TestAdjustStockFloor:
    def test_out_larger_than_stock_is_rejected(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        item_id = _make_item(headers, qty=5)

        resp = client.post(f"{BASE}/adjust/", json={"item_id": item_id, "quantity": 10, "type": "OUT"}, headers=headers)
        assert resp.status_code == 400, resp.text

        unchanged = client.get(f"{BASE}/items/", headers=headers).json()
        assert next(i for i in unchanged if i["id"] == item_id)["stock_quantity"] == 5

    def test_negative_adjust_is_rejected(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        item_id = _make_item(headers, qty=5)

        resp = client.post(f"{BASE}/adjust/", json={"item_id": item_id, "quantity": -1, "type": "ADJUST"}, headers=headers)
        assert resp.status_code == 400, resp.text

    def test_valid_out_within_stock_is_accepted(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        item_id = _make_item(headers, qty=5)

        resp = client.post(f"{BASE}/adjust/", json={"item_id": item_id, "quantity": 3, "type": "OUT"}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["stock_quantity"] == 2


class TestCreateOrderOversellAndTotal:
    def test_ordering_more_than_stock_is_rejected(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        item_id = _make_item(headers, price=1000.0, qty=2)

        resp = client.post(f"{BASE}/orders/", json={
            "total_amount": 1.0, "payment_method": "CASH",
            "items": [{"item_id": item_id, "quantity": 5}],
        }, headers=headers)
        assert resp.status_code == 400, resp.text

        unchanged = client.get(f"{BASE}/items/", headers=headers).json()
        assert next(i for i in unchanged if i["id"] == item_id)["stock_quantity"] == 2

    def test_client_supplied_total_amount_is_ignored_and_recomputed(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        item_id = _make_item(headers, price=1000.0, qty=10)

        resp = client.post(f"{BASE}/orders/", json={
            "total_amount": 1.0, "payment_method": "CASH",
            "items": [{"item_id": item_id, "quantity": 3, "unit_price": 1.0, "total_price": 1.0}],
        }, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["total_amount"] == 3000.0

        remaining = client.get(f"{BASE}/items/", headers=headers).json()
        assert next(i for i in remaining if i["id"] == item_id)["stock_quantity"] == 7

    def test_unknown_item_id_is_rejected(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/orders/", json={
            "total_amount": 1.0, "payment_method": "CASH",
            "items": [{"item_id": str(uuid.uuid4()), "quantity": 1}],
        }, headers=headers)
        assert resp.status_code == 404, resp.text
