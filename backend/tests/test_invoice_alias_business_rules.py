"""PUT/DELETE /invoices/{id}/ (aliases.py::update_invoice_alias /
delete_invoice_alias) — institutional-readiness audit, 2026-09.

This alias router duplicated the canonical finance/payments.py endpoints'
PRE-FIX logic even after those were hardened: update_invoice_alias never
recalculated status against paid_amount when total_amount changed, and
delete_invoice_alias ran an unconditional DELETE with no payment-history
check (Payment.invoice_id is ON DELETE SET NULL, so it would silently
orphan every payment ever registered against the invoice). Both now
mirror finance/payments.py's update_invoice_endpoint()/
delete_invoice_endpoint() exactly.

Raw SQL in this endpoint compares dashed UUID strings directly
(`WHERE id = :invoice_id`), which cannot match SQLite's dash-less hex GUID
storage — same limitation documented in test_invoice_deletion_payment_history.py.
Postgres-only."""
import uuid
from datetime import date, timedelta

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
    reason="raw SQL WHERE id=:param can't match SQLite's hex-no-dash GUID storage (see aliases.py invoices_alias_router).",
)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _build_invoice(*, total_amount: float, paid_amount: float, status: InvoiceStatus, with_payment: bool = False):
    tenant_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    invoice_id = str(uuid.uuid4())

    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Alias Facture Test", slug=f"inv-alias-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()

        db.add(Student(
            id=student_id, tenant_id=tenant_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Fatoumata", last_name="Diallo",
            date_of_birth=date(2011, 5, 20), gender=Gender.FEMALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()

        db.add(Invoice(
            id=invoice_id, tenant_id=tenant_id, student_id=student_id,
            invoice_number=f"INV-{invoice_id[:8]}",
            issue_date=date(2026, 1, 1), due_date=date(2026, 1, 1) + timedelta(days=30),
            subtotal=total_amount, total_amount=total_amount, paid_amount=paid_amount, status=status,
        ))
        db.commit()

        if with_payment:
            db.add(Payment(
                tenant_id=tenant_id, student_id=student_id, invoice_id=invoice_id,
                amount=paid_amount, currency="GNF", payment_date=date(2026, 1, 5),
                payment_method=PaymentMethod.CASH, status=PaymentStatus.COMPLETED,
                reference=f"PAY-{invoice_id[:8].upper()}",
            ))
            db.commit()

    return {"tenant_id": tenant_id, "student_id": student_id, "invoice_id": invoice_id}


class TestUpdateInvoiceAliasRecalculatesStatus:
    def test_reducing_total_below_paid_amount_flips_status_to_paid(self):
        ctx = _build_invoice(total_amount=100000.0, paid_amount=60000.0, status=InvoiceStatus.PARTIAL)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.put(f"/api/v1/invoices/{ctx['invoice_id']}/", json={
            "student_id": ctx["student_id"], "invoice_number": "INV-DISCOUNT",
            "total_amount": 50000.0, "due_date": "2026-02-01",
        }, headers=headers)
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            invoice = db.query(Invoice).filter(Invoice.id == ctx["invoice_id"]).first()
            assert invoice.status == InvoiceStatus.PAID

    def test_raising_total_above_paid_amount_flips_status_back_to_partial(self):
        ctx = _build_invoice(total_amount=50000.0, paid_amount=50000.0, status=InvoiceStatus.PAID)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.put(f"/api/v1/invoices/{ctx['invoice_id']}/", json={
            "student_id": ctx["student_id"], "invoice_number": "INV-CORRECTED",
            "total_amount": 100000.0, "due_date": "2026-02-01",
        }, headers=headers)
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            invoice = db.query(Invoice).filter(Invoice.id == ctx["invoice_id"]).first()
            assert invoice.status == InvoiceStatus.PARTIAL


class TestDeleteInvoiceAliasBlocksOnPaymentHistory:
    def test_invoice_with_payment_cannot_be_deleted(self):
        ctx = _build_invoice(total_amount=100000.0, paid_amount=100000.0, status=InvoiceStatus.PAID, with_payment=True)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.delete(f"/api/v1/invoices/{ctx['invoice_id']}/", headers=headers)

        assert resp.status_code == 400, resp.text
        with SessionLocal() as db:
            assert db.query(Invoice).filter(Invoice.id == ctx["invoice_id"]).first() is not None

    def test_draft_invoice_without_payments_can_be_deleted(self):
        ctx = _build_invoice(total_amount=100000.0, paid_amount=0.0, status=InvoiceStatus.DRAFT)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.delete(f"/api/v1/invoices/{ctx['invoice_id']}/", headers=headers)

        assert resp.status_code == 204, resp.text
        with SessionLocal() as db:
            assert db.query(Invoice).filter(Invoice.id == ctx["invoice_id"]).first() is None
