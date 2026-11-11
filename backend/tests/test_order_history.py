"""Historique des commandes (2026-11-11).

Avant : le reçu d'une vente s'affichait sans article (`GET
/inventory/orders/{id}/items/` absent, 404) et la corbeille de l'historique
n'avait aucune action (`DELETE /inventory/orders/{id}/` absent). Une vente
est désormais ANNULÉE (statut CANCELLED, articles remis en stock, audit),
jamais supprimée : elle reste une trace financière.
"""
import uuid

import pytest
from conftest import get_test_client
from sqlalchemy import text

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Tables de vente sans modèle ORM : PostgreSQL")

INV = "/api/v1/inventory"
HEADERS = {"Authorization": "Bearer mock-token"}
_CREATED: list[str] = []


def _tenant() -> str:
    tid = str(uuid.uuid4())
    _CREATED.append(tid)
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École Boutique", slug=f"shop-{tid[:12]}", type="primary",
                      country="GN", is_active=True, settings={}))
        db.commit()
    return tid


def _item(tid: str, *, stock: int, price: float = 5000) -> str:
    with SessionLocal() as db:
        iid = db.execute(text(
            "INSERT INTO inventory_items (tenant_id, name, unit_price, stock_quantity) "
            "VALUES (:t, 'Cahier 200 p.', :p, :s) RETURNING id"
        ), {"t": tid, "p": price, "s": stock}).scalar()
        db.commit()
    return str(iid)


def _stock(iid: str) -> int:
    with SessionLocal() as db:
        return db.execute(text("SELECT stock_quantity FROM inventory_items WHERE id = :i"), {"i": iid}).scalar()


def _as(tid: str, role: str):
    app.dependency_overrides[get_current_user] = lambda: {"id": str(uuid.uuid4()), "tenant_id": tid, "roles": [role]}
    return client


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    app.dependency_overrides.pop(get_current_user, None)
    tenants = list(_CREATED)
    _CREATED.clear()
    if not tenants:
        return
    with SessionLocal() as db:
        params = {"t": tenants}
        db.execute(text("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = ANY(CAST(:t AS uuid[])))"), params)
        for table in ("orders", "inventory_items", "audit_logs"):
            db.execute(text(f"DELETE FROM {table} WHERE tenant_id = ANY(CAST(:t AS uuid[]))"), params)
        db.execute(text("DELETE FROM tenants WHERE id = ANY(CAST(:t AS uuid[]))"), params)
        db.commit()


def _sale(tid: str, iid: str, qty: int) -> str:
    r = _as(tid, "TENANT_ADMIN").post(f"{INV}/orders/", json={
        "total_amount": 0, "payment_method": "CASH",
        "items": [{"item_id": iid, "item_name": "Cahier", "quantity": qty, "unit_price": 1, "total_price": 1},
                  {"item_name": "Photocopies", "quantity": 10, "unit_price": 100, "total_price": 1000}],
    }, headers=HEADERS)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_receipt_lists_the_order_lines():
    tid = _tenant()
    iid = _item(tid, stock=10)
    order_id = _sale(tid, iid, 3)
    r = _as(tid, "ACCOUNTANT").get(f"{INV}/orders/{order_id}/items/", headers=HEADERS)
    assert r.status_code == 200, r.text
    lines = {line["item_name"]: line for line in r.json()}
    assert lines["Cahier 200 p."]["quantity"] == 3 and lines["Cahier 200 p."]["total_price"] == 15000
    assert lines["Photocopies"]["total_price"] == 1000


def test_cancelling_a_sale_restocks_and_keeps_the_record():
    tid = _tenant()
    iid = _item(tid, stock=10)
    order_id = _sale(tid, iid, 3)
    assert _stock(iid) == 7

    r = _as(tid, "TENANT_ADMIN").post(f"{INV}/orders/{order_id}/cancel/", headers=HEADERS)
    assert r.status_code == 200, r.text
    assert r.json() == {"id": order_id, "status": "CANCELLED", "restocked_lines": 1}
    assert _stock(iid) == 10
    [order] = [o for o in _as(tid, "TENANT_ADMIN").get(f"{INV}/orders/", headers=HEADERS).json() if str(o["id"]) == order_id]
    assert order["status"] == "CANCELLED"  # toujours dans l'historique
    with SessionLocal() as db:
        assert db.execute(text("SELECT COUNT(*) FROM audit_logs WHERE action = 'CANCEL_ORDER' AND resource_id = :o"),
                          {"o": order_id}).scalar() == 1

    # Seconde annulation : refusée, pas de seconde remise en stock.
    assert _as(tid, "TENANT_ADMIN").post(f"{INV}/orders/{order_id}/cancel/", headers=HEADERS).status_code == 409
    assert _stock(iid) == 10


def test_other_school_cannot_read_or_cancel():
    tid, other = _tenant(), _tenant()
    iid = _item(tid, stock=5)
    order_id = _sale(tid, iid, 1)
    assert _as(other, "TENANT_ADMIN").get(f"{INV}/orders/{order_id}/items/", headers=HEADERS).status_code == 404
    assert _as(other, "TENANT_ADMIN").post(f"{INV}/orders/{order_id}/cancel/", headers=HEADERS).status_code == 404
    assert _stock(iid) == 4


def test_roles_without_inventory_permissions_are_refused():
    tid = _tenant()
    iid = _item(tid, stock=5)
    order_id = _sale(tid, iid, 1)
    assert _as(tid, "STUDENT").get(f"{INV}/orders/{order_id}/items/", headers=HEADERS).status_code == 403
    assert _as(tid, "TEACHER").post(f"{INV}/orders/{order_id}/cancel/", headers=HEADERS).status_code == 403
    assert _stock(iid) == 4
