"""CRUD operations for Payment and Invoice models"""
from typing import Optional
from sqlalchemy.orm import Session, joinedload
from uuid import UUID
import secrets

from app.models.payment import Payment, Invoice, PaymentStatus, InvoiceStatus
from app.schemas.payment import PaymentCreate, PaymentUpdate, InvoiceCreate, InvoiceUpdate


# Payment CRUD
def get_payment(db: Session, payment_id: UUID, tenant_id: UUID) -> Optional[Payment]:
    """Get a payment by ID"""
    return db.query(Payment).options(joinedload(Payment.student)).filter(
        Payment.id == payment_id,
        Payment.tenant_id == tenant_id
    ).first()


def get_payments(
    db: Session,
    tenant_id: UUID,
    skip: int = 0,
    limit: int = 100,
    student_id: Optional[UUID] = None,
    status: Optional[PaymentStatus] = None,
) -> tuple[list[Payment], int]:
    """Get payments with pagination and filters"""
    query = db.query(Payment).filter(Payment.tenant_id == tenant_id)
    
    if student_id:
        query = query.filter(Payment.student_id == student_id)
    
    if status:
        query = query.filter(Payment.status == status)
    
    total = query.count()
    payments = query.options(joinedload(Payment.student)).order_by(Payment.payment_date.desc()).offset(skip).limit(limit).all()
    
    return payments, total


def create_payment(db: Session, payment: PaymentCreate, tenant_id: UUID) -> Payment:
    """Create a new payment"""
    # Generate unique reference
    reference = f"PAY-{secrets.token_hex(8).upper()}"
    
    db_payment = Payment(
        **payment.model_dump(),
        tenant_id=tenant_id,
        reference=reference
    )
    db.add(db_payment)
    
    # Update invoice if linked
    if payment.invoice_id:
        invoice = get_invoice(db, payment.invoice_id, tenant_id)
        if invoice:
            invoice.paid_amount += payment.amount
            if invoice.paid_amount >= invoice.total_amount:
                invoice.status = InvoiceStatus.PAID
    
    db.commit()
    db.refresh(db_payment)
    # Reload with student data
    return get_payment(db, db_payment.id, tenant_id)


def update_payment(
    db: Session,
    payment_id: UUID,
    payment_update: PaymentUpdate,
    tenant_id: UUID
) -> Optional[Payment]:
    """Update a payment"""
    db_payment = get_payment(db, payment_id, tenant_id)
    if not db_payment:
        return None
    
    update_data = payment_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_payment, field, value)
    
    db.commit()
    db.refresh(db_payment)
    return db_payment


# Invoice CRUD
def get_invoice(db: Session, invoice_id: UUID, tenant_id: UUID) -> Optional[Invoice]:
    """Get an invoice by ID"""
    return db.query(Invoice).options(joinedload(Invoice.student)).filter(
        Invoice.id == invoice_id,
        Invoice.tenant_id == tenant_id
    ).first()


def get_invoices(
    db: Session,
    tenant_id: UUID,
    skip: int = 0,
    limit: int = 100,
    student_id: Optional[UUID] = None,
    status: Optional[InvoiceStatus] = None,
) -> tuple[list[Invoice], int]:
    """Get invoices with pagination and filters"""
    query = db.query(Invoice).filter(Invoice.tenant_id == tenant_id)
    
    if student_id:
        query = query.filter(Invoice.student_id == student_id)
    
    if status:
        query = query.filter(Invoice.status == status)
    
    total = query.count()
    invoices = query.options(joinedload(Invoice.student)).order_by(Invoice.issue_date.desc()).offset(skip).limit(limit).all()
    
    return invoices, total


def create_invoice(db: Session, invoice: InvoiceCreate, tenant_id: UUID) -> Invoice:
    """Create a new invoice"""
    db_invoice = Invoice(
        **invoice.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_invoice)
    db.commit()
    db.refresh(db_invoice)
    return get_invoice(db, db_invoice.id, tenant_id)


def update_invoice(
    db: Session,
    invoice_id: UUID,
    invoice_update: InvoiceUpdate,
    tenant_id: UUID
) -> Optional[Invoice]:
    """Update an invoice"""
    db_invoice = get_invoice(db, invoice_id, tenant_id)
    if not db_invoice:
        return None
    
    update_data = invoice_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_invoice, field, value)
    
    db.commit()
    db.refresh(db_invoice)
    return db_invoice
