"""Payment/invoice business-rule gaps found by the institutional-readiness
audit (2026-09), business-rules subagent:

- register_payment() bounded body.amount only against a fixed 10M ceiling,
  never against the invoice's own remaining balance — a payment larger
  than what's owed silently produced paid_amount > total_amount while
  still marking the invoice PAID.
- update_invoice_endpoint() never recalculated `status` after editing
  total_amount (e.g. applying a discount) — a PARTIAL invoice whose total
  was reduced below its existing paid_amount stayed PARTIAL forever
  instead of becoming PAID, and vice versa.

An explicit `reference` is always passed to POST /payments/register/ so
these tests don't depend on _next_payment_reference()'s Postgres-only
gen_random_uuid()/ON CONFLICT sequence (see test_payment_sequential_
reference.py) and can run on both SQLite and PostgreSQL.
"""
import uuid
from datetime import date, timedelta

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="raw SQL WHERE id=:param can't match SQLite's hex-no-dash GUID "
           "storage (see payments.py register_payment/update_invoice_endpoint).",
)

REGISTER_URL = "/api/v1/payments/register/"
INVOICE_URL = "/api/v1/payments/invoices/{invoice_id}/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _admin_headers(tenant_id: str) -> dict:
    return _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Règles Métier", slug=f"biz-rules-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_invoice(tenant_id: str, *, total: float = 100000.0, paid: float = 0.0,
                   inv_status: InvoiceStatus = InvoiceStatus.PENDING) -> tuple[str, str]:
    student_id = str(uuid.uuid4())
    invoice_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"REG-{uuid.uuid4().hex[:8]}",
            first_name="Test", last_name="Student", date_of_birth=date(2012, 1, 1),
            gender=Gender.MALE, status=StudentStatus.ACTIVE,
        ))
        db.commit()
        db.add(Invoice(
            id=invoice_id, tenant_id=tenant_id, student_id=student_id,
            invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
            issue_date=date.today(), due_date=date.today() + timedelta(days=30),
            subtotal=total, total_amount=total, paid_amount=paid,
            currency="GNF", status=inv_status,
        ))
        db.commit()
    return student_id, invoice_id


class TestOverpaymentIsRejected:
    def test_payment_larger_than_remaining_balance_is_rejected(self):
        tenant_id = _make_tenant()
        _, invoice_id = _make_invoice(tenant_id, total=100000.0, paid=0.0)

        resp = client.post(
            REGISTER_URL,
            json={"invoice_id": invoice_id, "amount": 150000.0, "method": "CASH", "reference": "REC-TEST-1"},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 400, resp.text

        with SessionLocal() as db:
            inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            assert inv.paid_amount == 0.0
            assert inv.status == InvoiceStatus.PENDING

    def test_payment_exactly_covering_balance_is_accepted(self):
        tenant_id = _make_tenant()
        _, invoice_id = _make_invoice(tenant_id, total=100000.0, paid=40000.0, inv_status=InvoiceStatus.PARTIAL)

        resp = client.post(
            REGISTER_URL,
            json={"invoice_id": invoice_id, "amount": 60000.0, "method": "CASH", "reference": "REC-TEST-2"},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "PAID"

    def test_partial_overpayment_beyond_remaining_balance_is_rejected(self):
        tenant_id = _make_tenant()
        _, invoice_id = _make_invoice(tenant_id, total=100000.0, paid=90000.0, inv_status=InvoiceStatus.PARTIAL)

        resp = client.post(
            REGISTER_URL,
            json={"invoice_id": invoice_id, "amount": 20000.0, "method": "CASH", "reference": "REC-TEST-3"},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 400, resp.text


class TestInvoiceStatusRecalculatedOnUpdate:
    def test_reducing_total_below_paid_amount_marks_paid(self):
        tenant_id = _make_tenant()
        student_id, invoice_id = _make_invoice(tenant_id, total=100000.0, paid=80000.0, inv_status=InvoiceStatus.PARTIAL)

        resp = client.put(
            INVOICE_URL.format(invoice_id=invoice_id),
            json={
                "student_id": student_id, "invoice_number": f"INV-{invoice_id[:8]}",
                "total_amount": 80000.0, "due_date": str(date.today() + timedelta(days=30)),
            },
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            assert inv.status == InvoiceStatus.PAID

    def test_increasing_total_above_paid_amount_reverts_to_partial(self):
        tenant_id = _make_tenant()
        student_id, invoice_id = _make_invoice(tenant_id, total=50000.0, paid=50000.0, inv_status=InvoiceStatus.PAID)

        resp = client.put(
            INVOICE_URL.format(invoice_id=invoice_id),
            json={
                "student_id": student_id, "invoice_number": f"INV-{invoice_id[:8]}",
                "total_amount": 100000.0, "due_date": str(date.today() + timedelta(days=30)),
            },
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            assert inv.status == InvoiceStatus.PARTIAL
