"""app/crud/payment.py — 20.9% test coverage (67 statements), national
audit dette technique. Covers Payment and Invoice CRUD directly (no HTTP),
including the invoice auto-update side effect on payment creation
(paid_amount incremented, status flipped to PAID once fully paid) that a
plain "does the endpoint 200" test wouldn't exercise.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.crud import payment as crud_payment  # noqa: E402
from app.models.payment import InvoiceStatus, PaymentMethod, PaymentStatus  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.schemas.payment import InvoiceCreate, InvoiceUpdate, PaymentCreate, PaymentUpdate  # noqa: E402


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École CRUD Payment Test", slug=f"crud-pay-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Mamadou", last_name="Bah",
            date_of_birth=date(2010, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


class TestPaymentCrud:
    def test_get_payment_isolates_by_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_id = _make_student(tenant_a)
        with SessionLocal() as db:
            payment = crud_payment.create_payment(
                db, PaymentCreate(
                    student_id=student_id, amount=50000.0, payment_date=date(2026, 7, 1),
                    payment_method=PaymentMethod.CASH,
                ), tenant_a,
            )
            assert crud_payment.get_payment(db, payment.id, tenant_a) is not None
            assert crud_payment.get_payment(db, payment.id, tenant_b) is None

    def test_create_payment_generates_unique_reference(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        with SessionLocal() as db:
            p1 = crud_payment.create_payment(
                db, PaymentCreate(student_id=student_id, amount=1000.0, payment_date=date(2026, 7, 1),
                                   payment_method=PaymentMethod.CASH), tenant_id,
            )
            p2 = crud_payment.create_payment(
                db, PaymentCreate(student_id=student_id, amount=1000.0, payment_date=date(2026, 7, 1),
                                   payment_method=PaymentMethod.CASH), tenant_id,
            )
            assert p1.reference.startswith("PAY-")
            assert p1.reference != p2.reference

    def test_create_payment_updates_linked_invoice_paid_amount(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        with SessionLocal() as db:
            invoice = crud_payment.create_invoice(
                db, InvoiceCreate(
                    student_id=student_id, invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
                    issue_date=date(2026, 7, 1), due_date=date(2026, 8, 1),
                    subtotal=100000.0, total_amount=100000.0,
                ), tenant_id,
            )
            crud_payment.create_payment(
                db, PaymentCreate(student_id=student_id, invoice_id=invoice.id, amount=40000.0,
                                   payment_date=date(2026, 7, 1), payment_method=PaymentMethod.MOBILE_MONEY),
                tenant_id,
            )
            refreshed = crud_payment.get_invoice(db, invoice.id, tenant_id)
            assert refreshed.paid_amount == 40000.0
            assert refreshed.status != InvoiceStatus.PAID  # partially paid, not yet flipped

    def test_create_payment_marks_invoice_paid_once_fully_covered(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        with SessionLocal() as db:
            invoice = crud_payment.create_invoice(
                db, InvoiceCreate(
                    student_id=student_id, invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
                    issue_date=date(2026, 7, 1), due_date=date(2026, 8, 1),
                    subtotal=50000.0, total_amount=50000.0,
                ), tenant_id,
            )
            crud_payment.create_payment(
                db, PaymentCreate(student_id=student_id, invoice_id=invoice.id, amount=50000.0,
                                   payment_date=date(2026, 7, 1), payment_method=PaymentMethod.CASH),
                tenant_id,
            )
            refreshed = crud_payment.get_invoice(db, invoice.id, tenant_id)
            assert refreshed.status == InvoiceStatus.PAID

    def test_get_payments_filters_by_status(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        with SessionLocal() as db:
            crud_payment.create_payment(
                db, PaymentCreate(student_id=student_id, amount=1000.0, payment_date=date(2026, 7, 1),
                                   payment_method=PaymentMethod.CASH), tenant_id,
            )
            payments, total = crud_payment.get_payments(db, tenant_id, status=PaymentStatus.PENDING)
            assert total == 1
            payments_completed, total_completed = crud_payment.get_payments(db, tenant_id, status=PaymentStatus.COMPLETED)
            assert total_completed == 0

    def test_get_payments_never_leaks_across_tenants(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_a = _make_student(tenant_a)
        student_b = _make_student(tenant_b)
        with SessionLocal() as db:
            crud_payment.create_payment(
                db, PaymentCreate(student_id=student_a, amount=1000.0, payment_date=date(2026, 7, 1),
                                   payment_method=PaymentMethod.CASH), tenant_a,
            )
            crud_payment.create_payment(
                db, PaymentCreate(student_id=student_b, amount=1000.0, payment_date=date(2026, 7, 1),
                                   payment_method=PaymentMethod.CASH), tenant_b,
            )
            _, total_a = crud_payment.get_payments(db, tenant_a)
            assert total_a == 1

    def test_update_payment_changes_only_provided_fields(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        with SessionLocal() as db:
            payment = crud_payment.create_payment(
                db, PaymentCreate(student_id=student_id, amount=1000.0, payment_date=date(2026, 7, 1),
                                   payment_method=PaymentMethod.CASH, notes="initial"), tenant_id,
            )
            updated = crud_payment.update_payment(db, payment.id, PaymentUpdate(status=PaymentStatus.COMPLETED), tenant_id)
            assert updated.status == PaymentStatus.COMPLETED
            assert updated.notes == "initial"  # untouched

    def test_update_payment_returns_none_for_unknown_id(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            result = crud_payment.update_payment(db, uuid.uuid4(), PaymentUpdate(notes="x"), tenant_id)
            assert result is None


class TestInvoiceCrud:
    def test_get_invoice_isolates_by_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_id = _make_student(tenant_a)
        with SessionLocal() as db:
            invoice = crud_payment.create_invoice(
                db, InvoiceCreate(
                    student_id=student_id, invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
                    issue_date=date(2026, 7, 1), due_date=date(2026, 8, 1),
                    subtotal=10000.0, total_amount=10000.0,
                ), tenant_a,
            )
            assert crud_payment.get_invoice(db, invoice.id, tenant_a) is not None
            assert crud_payment.get_invoice(db, invoice.id, tenant_b) is None

    def test_get_invoices_filters_by_student_and_status(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        with SessionLocal() as db:
            crud_payment.create_invoice(
                db, InvoiceCreate(
                    student_id=student_id, invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
                    issue_date=date(2026, 7, 1), due_date=date(2026, 8, 1),
                    subtotal=10000.0, total_amount=10000.0,
                ), tenant_id,
            )
            invoices, total = crud_payment.get_invoices(db, tenant_id, student_id=student_id, status=InvoiceStatus.DRAFT)
            assert total == 1
            assert invoices[0].student_id is not None

    def test_update_invoice_changes_only_provided_fields(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        with SessionLocal() as db:
            invoice = crud_payment.create_invoice(
                db, InvoiceCreate(
                    student_id=student_id, invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
                    issue_date=date(2026, 7, 1), due_date=date(2026, 8, 1),
                    subtotal=10000.0, total_amount=10000.0, notes="initial",
                ), tenant_id,
            )
            updated = crud_payment.update_invoice(db, invoice.id, InvoiceUpdate(status=InvoiceStatus.SENT), tenant_id)
            assert updated.status == InvoiceStatus.SENT
            assert updated.notes == "initial"  # untouched

    def test_update_invoice_returns_none_for_unknown_id(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            result = crud_payment.update_invoice(db, uuid.uuid4(), InvoiceUpdate(notes="x"), tenant_id)
            assert result is None
