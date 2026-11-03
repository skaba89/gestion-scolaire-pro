"""Filtres de période des listes paiements / factures (API-02, 2026-11-03).

L'écran « Exports comptables » demandait les factures « du mois » avec des
paramètres que le serveur ignorait (il recevait les 50 premières factures,
toutes dates confondues) et appelait `GET /payments/` (inexistant) pour les
paiements : les journaux FEC / Sage / Ciel exportés étaient faux.

PostgreSQL uniquement, comme test_payment_integrity.py (SQL brut sur UUID).
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus, Payment, PaymentMethod, PaymentStatus  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="SQL brut sur UUID : PostgreSQL uniquement (job CI PostgreSQL).",
)

PAYMENTS = "/api/v1/payments/payments/"
INVOICES = "/api/v1/payments/invoices/"


@pytest.fixture(autouse=True)
def _clean_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _tenant_with_data() -> str:
    """Un établissement : 3 factures (oct., nov., nov. annulée) et 3 paiements
    (oct. encaissé, nov. encaissé, nov. annulé)."""
    tenant_id, student_id = str(uuid.uuid4()), str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name="École Export", slug=f"export-{tenant_id[:8]}",
                      type="primary", country="GN", is_active=True, settings={}))
        db.commit()
        db.add(Student(id=student_id, tenant_id=tenant_id, registration_number=f"REG-{uuid.uuid4().hex[:8]}",
                       first_name="Mariama", last_name="Camara", date_of_birth=date(2012, 1, 1),
                       gender=Gender.FEMALE, status=StudentStatus.ACTIVE))
        db.commit()
        inv = {}
        for key, issued, st in (("oct", date(2026, 10, 15), InvoiceStatus.PENDING),
                                ("nov", date(2026, 11, 5), InvoiceStatus.PARTIAL),
                                ("nov_cancelled", date(2026, 11, 20), InvoiceStatus.CANCELLED)):
            inv[key] = str(uuid.uuid4())
            db.add(Invoice(id=inv[key], tenant_id=tenant_id, student_id=student_id,
                           invoice_number=f"FAC-{key}-{uuid.uuid4().hex[:6]}", issue_date=issued,
                           due_date=issued, subtotal=100000, total_amount=100000, paid_amount=0,
                           currency="GNF", status=st))
        db.commit()
        for paid_on, st in ((date(2026, 10, 20), PaymentStatus.COMPLETED),
                            (date(2026, 11, 6), PaymentStatus.COMPLETED),
                            (date(2026, 11, 7), PaymentStatus.REVERSED)):
            db.add(Payment(id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
                           invoice_id=inv["nov"], amount=25000, payment_method=PaymentMethod.MOBILE_MONEY,
                           reference=f"OM-{uuid.uuid4().hex[:10]}", status=st, payment_date=paid_on))
        db.commit()
    return tenant_id


_headers: dict = {}


def _as(tenant_id: str, role: str = "ACCOUNTANT") -> None:
    user = {"id": str(uuid.uuid4()), "roles": [role], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": tenant_id, "roles": [role]})
    _headers.clear()
    _headers["Authorization"] = f"Bearer {token}"


def _get(url: str, params: dict | None = None):
    return client.get(url, params=params or {}, headers=_headers)


NOVEMBER = {"date_from": "2026-11-01", "date_to": "2026-11-30"}


class TestPaymentPeriodFilter:
    def test_period_and_status_select_only_the_months_collected_payments(self):
        tenant_id = _tenant_with_data()
        _as(tenant_id)
        resp = _get(PAYMENTS, {**NOVEMBER, "status": "COMPLETED"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        assert [p["payment_date"] for p in body["items"]] == ["2026-11-06"]
        assert body["items"][0]["invoices"]["invoice_number"].startswith("FAC-nov-")

    def test_without_filters_behaviour_is_unchanged(self):
        tenant_id = _tenant_with_data()
        _as(tenant_id)
        resp = _get(PAYMENTS)
        assert resp.status_code == 200, resp.text
        assert resp.json()["total"] == 3

    def test_bounds_are_inclusive(self):
        tenant_id = _tenant_with_data()
        _as(tenant_id)
        resp = _get(PAYMENTS, {"date_from": "2026-11-06", "date_to": "2026-11-06"})
        assert resp.json()["total"] == 1

    def test_inverted_period_is_400(self):
        tenant_id = _tenant_with_data()
        _as(tenant_id)
        resp = _get(PAYMENTS, {"date_from": "2026-11-30", "date_to": "2026-11-01"})
        assert resp.status_code == 400, resp.text

    def test_malformed_date_is_422(self):
        tenant_id = _tenant_with_data()
        _as(tenant_id)
        resp = _get(PAYMENTS, {"date_from": "2026-11-01' OR 1=1 --"})
        assert resp.status_code == 422, resp.text


class TestInvoicePeriodFilter:
    def test_period_filters_on_issue_date(self):
        tenant_id = _tenant_with_data()
        _as(tenant_id)
        resp = _get(INVOICES, NOVEMBER)
        assert resp.status_code == 200, resp.text
        numbers = sorted(i["invoice_number"].split("-")[1] for i in resp.json()["items"])
        assert numbers == ["nov", "nov_cancelled"]  # l'écran écarte ensuite les annulées

    def test_october_invoice_is_excluded_from_november(self):
        tenant_id = _tenant_with_data()
        _as(tenant_id)
        items = _get(INVOICES, NOVEMBER).json()["items"]
        assert all(i["issue_date"].startswith("2026-11") for i in items)


class TestIsolationAndAuthorization:
    def test_other_tenants_data_never_appears_in_a_period(self):
        other = _tenant_with_data()
        mine = _tenant_with_data()
        _as(mine)
        pays = _get(PAYMENTS, NOVEMBER).json()["items"]
        invs = _get(INVOICES, NOVEMBER).json()["items"]
        with SessionLocal() as db:
            foreign_pay = {str(p.id) for p in db.query(Payment).filter(Payment.tenant_id == other)}
            foreign_inv = {str(i.id) for i in db.query(Invoice).filter(Invoice.tenant_id == other)}
        assert not foreign_pay & {p["id"] for p in pays}
        assert not foreign_inv & {i["id"] for i in invs}
        assert len(pays) == 2 and len(invs) == 2

    def test_role_without_payments_read_is_403(self):
        tenant_id = _tenant_with_data()
        _as(tenant_id, role="TEACHER")
        assert _get(PAYMENTS, NOVEMBER).status_code == 403
        assert _get(INVOICES, NOVEMBER).status_code == 403
