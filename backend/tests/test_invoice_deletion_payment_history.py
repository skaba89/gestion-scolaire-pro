"""DELETE /payments/invoices/{id}/ — data-integrity fix (institutional-
readiness audit, 2026-09).

docs/PAYMENTS_READINESS.md's own endpoint reference flagged this route as
"(brouillon uniquement — à vérifier)" — the "à vérifier" was never actually
done: the handler ran an unconditional DELETE regardless of the invoice's
payment history. Payment.invoice_id is ON DELETE SET NULL (app/models/
payment.py), so deleting a PAID invoice would silently orphan every
payment ever registered against it (invoice_id → NULL) and permanently
erase the invoice's line items/amounts — contradicting this same doc's
headline claim that the payments module never physically deletes
financial history (the same guarantee already enforced for Payment rows
via reverse-only, never DELETE).

Raw SQL in this endpoint compares dashed UUID strings directly
(`WHERE id = :invoice_id`), which cannot match SQLite's dash-less hex GUID
storage — same limitation already documented in test_payment_receipt.py
for sibling endpoints in this file. Postgres-only, like that file.
"""
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

_needs_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="raw SQL WHERE id=:param can't match SQLite's hex-no-dash GUID storage (see payments.py delete_invoice_endpoint).",
)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _build_invoice(*, with_payment: bool, payment_status: PaymentStatus = PaymentStatus.COMPLETED):
    tenant_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    invoice_id = str(uuid.uuid4())

    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Suppression Facture Test", slug=f"del-inv-{tenant_id[:8]}",
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
            subtotal=100000.0, total_amount=100000.0,
            paid_amount=100000.0 if with_payment else 0.0,
            status=InvoiceStatus.PAID if with_payment else InvoiceStatus.DRAFT,
        ))
        db.commit()

        if with_payment:
            db.add(Payment(
                tenant_id=tenant_id, student_id=student_id, invoice_id=invoice_id,
                amount=100000.0, currency="GNF", payment_date=date(2026, 1, 5),
                payment_method=PaymentMethod.CASH, status=payment_status,
                reference=f"PAY-{invoice_id[:8].upper()}",
            ))
            db.commit()

    return {"tenant_id": tenant_id, "invoice_id": invoice_id}


class TestDeleteInvoiceWithPaymentHistory:
    @_needs_postgres
    def test_invoice_with_completed_payment_cannot_be_deleted(self):
        ctx = _build_invoice(with_payment=True)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.delete(f"/api/v1/payments/invoices/{ctx['invoice_id']}/", headers=headers)

        assert resp.status_code == 400, resp.text
        with SessionLocal() as db:
            assert db.query(Invoice).filter(Invoice.id == ctx["invoice_id"]).first() is not None

    @_needs_postgres
    def test_invoice_with_reversed_payment_still_cannot_be_deleted(self):
        """Even a REVERSED payment must keep its invoice from being
        deleted — the audit trail (who paid what, later reversed) must
        stay intact, same guarantee as never hard-deleting a Payment row."""
        ctx = _build_invoice(with_payment=True, payment_status=PaymentStatus.REVERSED)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.delete(f"/api/v1/payments/invoices/{ctx['invoice_id']}/", headers=headers)

        assert resp.status_code == 400, resp.text

    @_needs_postgres
    def test_draft_invoice_without_payments_can_be_deleted(self):
        ctx = _build_invoice(with_payment=False)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.delete(f"/api/v1/payments/invoices/{ctx['invoice_id']}/", headers=headers)

        assert resp.status_code == 204, resp.text
        with SessionLocal() as db:
            assert db.query(Invoice).filter(Invoice.id == ctx["invoice_id"]).first() is None

    @_needs_postgres
    def test_deleting_nonexistent_invoice_returns_404(self):
        tenant_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="École Test", slug=f"del-inv-404-{tenant_id[:8]}",
                type="primary", country="GN", is_active=True, settings={},
            ))
            db.commit()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.delete(f"/api/v1/payments/invoices/{uuid.uuid4()}/", headers=headers)

        assert resp.status_code == 404, resp.text
