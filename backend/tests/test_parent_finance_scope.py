"""Un parent ne voit que les données financières de SES enfants (2026-10-13).

Le rôle PARENT détient `payments:read`. GET /payments/invoices/ et le reçu
appliquaient la règle ; ces routes renvoyaient les données de TOUTES les
familles de l'établissement :
- GET /invoices/ (alias) : factures, nom, matricule et téléphone de l'élève ;
- GET /payments/payments/ et GET /payments/export/ : paiements ;
- GET /payment-schedules/ : échéanciers.
"""
import uuid
from datetime import date

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.models.payment import Payment, PaymentMethod, PaymentStatus  # noqa: E402
from test_parent_payment_schedule_scope_2026_09_27 import (  # noqa: E402
    HEADERS, _as, _link_parent, _make_invoice, _make_payment_schedule, _make_student,
    _make_tenant, _make_user, requires_postgres,
)

pytestmark = requires_postgres


def _make_payment(tenant_id: str, student_id: str, invoice_id: str) -> str:
    payment_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Payment(
            id=payment_id, tenant_id=tenant_id, student_id=student_id, invoice_id=invoice_id,
            amount=100000, payment_date=date(2026, 9, 15), payment_method=PaymentMethod.CASH,
            status=PaymentStatus.COMPLETED, reference=f"REF-{payment_id[:12]}",
        ))
        db.commit()
    return payment_id


@pytest.fixture
def school():
    tenant_id = _make_tenant()
    parent = _make_user(tenant_id)
    other_parent = _make_user(tenant_id)
    childless_parent = _make_user(tenant_id)
    own_child = _make_student(tenant_id, reg="OWN")
    other_child = _make_student(tenant_id, reg="OTHER")
    _link_parent(tenant_id, parent, own_child)
    _link_parent(tenant_id, other_parent, other_child)
    data = {"tenant_id": tenant_id, "parent": parent, "childless_parent": childless_parent,
            "own_child": own_child, "other_child": other_child}
    for key, student in (("own", own_child), ("other", other_child)):
        invoice = _make_invoice(tenant_id, student)
        data[f"{key}_invoice"] = invoice
        data[f"{key}_payment"] = _make_payment(tenant_id, student, invoice)
        data[f"{key}_schedule"] = _make_payment_schedule(tenant_id, invoice)
    return data


def _parent(school, key="parent"):
    return _as({"id": school[key], "roles": ["PARENT"], "tenant_id": school["tenant_id"]})


def _ids(resp):
    assert resp.status_code == 200, resp.text
    return {item["id"] for item in resp.json()["items"]}


LISTS = [
    ("/api/v1/invoices/", "invoice"),
    ("/api/v1/payments/invoices/", "invoice"),
    ("/api/v1/payments/payments/", "payment"),
    ("/api/v1/payment-schedules/", "schedule"),
]


@pytest.mark.parametrize("url,kind", LISTS)
class TestLists:
    def test_parent_sees_only_own_children(self, school, url, kind):
        ids = _ids(_parent(school).get(url, headers=HEADERS))
        assert ids == {school[f"own_{kind}"]}

    def test_parent_cannot_ask_for_another_familys_student(self, school, url, kind):
        resp = _parent(school).get(url, params={"student_id": school["other_child"]}, headers=HEADERS)
        assert resp.status_code == 403

    def test_parent_can_filter_on_own_child(self, school, url, kind):
        ids = _ids(_parent(school).get(url, params={"student_id": school["own_child"]}, headers=HEADERS))
        assert ids == {school[f"own_{kind}"]}

    def test_parent_without_children_sees_nothing(self, school, url, kind):
        assert _ids(_parent(school, "childless_parent").get(url, headers=HEADERS)) == set()

    def test_accountant_still_sees_every_family(self, school, url, kind):
        accountant = _as({"id": str(uuid.uuid4()), "roles": ["ACCOUNTANT"], "tenant_id": school["tenant_id"]})
        ids = _ids(accountant.get(url, headers=HEADERS))
        assert {school[f"own_{kind}"], school[f"other_{kind}"]} <= ids

    def test_parent_who_is_also_staff_is_not_restricted(self, school, url, kind):
        user = {"id": school["parent"], "roles": ["PARENT", "TENANT_ADMIN"], "tenant_id": school["tenant_id"]}
        ids = _ids(_as(user).get(url, headers=HEADERS))
        assert {school[f"own_{kind}"], school[f"other_{kind}"]} <= ids


class TestExport:
    def test_parent_export_contains_only_own_children(self, school):
        resp = _parent(school).get("/api/v1/payments/export/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert f"REF-{school['own_payment'][:12]}" in resp.text
        assert f"REF-{school['other_payment'][:12]}" not in resp.text

    def test_parent_cannot_export_another_familys_student(self, school):
        resp = _parent(school).get("/api/v1/payments/export/", params={"student_id": school["other_child"]},
                                   headers=HEADERS)
        assert resp.status_code == 403
