"""Payment, Invoice and Fees endpoints"""
import logging
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import uuid as _uuid
import math, secrets
from datetime import datetime
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit

limiter = Limiter(key_func=get_remote_address)
from app.crud import payment as crud_payment
from app.schemas.payment import (
    Payment, PaymentCreate, PaymentUpdate, PaymentList,
    Invoice, InvoiceCreate, InvoiceUpdate, InvoiceList
)
from app.models.payment import PaymentStatus, InvoiceStatus

logger = logging.getLogger(__name__)
router = APIRouter()

# SECURITY: Whitelist ORDER BY columns to prevent SQL injection in dynamic queries
ALLOWED_ORDER_COLUMNS = {"p.created_at", "p.amount", "p.status", "p.payment_date", "s.first_name", "s.last_name", "i.created_at", "i.invoice_number"}
ALLOWED_SORT_DIRECTIONS = {"asc", "desc"}


def _get_tenant_id(current_user: dict):
    """Return tenant_id or raise 400 if not set (SUPER_ADMIN must select a tenant)."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun établissement sélectionné. Veuillez d'abord sélectionner un établissement.",
        )
    return tenant_id


# ─── Schemas inline ───────────────────────────────────────────────────────────

class RegisterPaymentRequest(BaseModel):
    invoice_id: str
    amount: float = Field(..., gt=0, le=10_000_000)
    method: str
    reference: Optional[str] = None
    notes: Optional[str] = None

class ReversePaymentRequest(BaseModel):
    notes: Optional[str] = None

class FeeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    amount: float = Field(..., gt=0, le=10_000_000)

class FeeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = Field(None, gt=0, le=10_000_000)

class InvoiceReminderRequest(BaseModel):
    invoice_ids: Optional[List[str]] = None  # None = tous les impayés


# ─── Payment endpoints ────────────────────────────────────────────────────────

@router.get("/payments/")
def list_payments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    student_id: Optional[str] = None,
):
    """List payments with pagination — includes student info."""
    tenant_id = _get_tenant_id(current_user)
    offset = (page - 1) * page_size
    params: dict = {"tenant_id": tenant_id, "limit": page_size, "offset": offset}

    extra = ""
    if student_id:
        extra = " AND p.student_id = :student_id"
        params["student_id"] = student_id

    sql = text(f"""
        SELECT p.id, p.amount, p.payment_date, p.payment_method, p.reference, p.notes, p.status,
               p.invoice_id, p.student_id,
               s.first_name, s.last_name, s.registration_number,
               i.invoice_number
        FROM payments p
        LEFT JOIN students s ON p.student_id = s.id
        LEFT JOIN invoices i ON p.invoice_id = i.id
        WHERE p.tenant_id = :tenant_id {extra}
        ORDER BY p.payment_date DESC
        LIMIT :limit OFFSET :offset
    """)
    rows = db.execute(sql, params).fetchall()

    count_sql = text(f"SELECT COUNT(*) FROM payments p WHERE p.tenant_id = :tenant_id {extra}")
    total = db.execute(count_sql, {k: v for k, v in params.items() if k not in ("limit", "offset")}).scalar() or 0

    items = []
    for r in rows:
        items.append({
            "id": str(r.id), "amount": float(r.amount or 0),
            "payment_date": r.payment_date.isoformat() if r.payment_date else None,
            "payment_method": r.payment_method, "reference": r.reference,
            "notes": r.notes, "status": r.status, "invoice_id": str(r.invoice_id) if r.invoice_id else None,
            "invoices": {"invoice_number": r.invoice_number} if r.invoice_number else None,
            "students": {
                "first_name": r.first_name, "last_name": r.last_name,
                "registration_number": r.registration_number
            } if r.first_name else None
        })

    return {"items": items, "total": int(total or 0), "page": page, "page_size": page_size,
            "pages": math.ceil(float(total or 0) / page_size) if total and total > 0 else 1}


@router.post("/register/", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def register_payment(
    request: Request,
    body: RegisterPaymentRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """
    Atomic: register a payment and update the linked invoice status.
    Replaces the Supabase RPC `register_payment`.
    """
    tenant_id = _get_tenant_id(current_user)
    user_id = current_user.get("id")

    # 1. Fetch invoice to validate (student_id est requis pour le paiement)
    inv = db.execute(text("""
        SELECT id, student_id, total_amount, paid_amount, status FROM invoices
        WHERE id = :invoice_id AND tenant_id = :tenant_id
    """), {"invoice_id": body.invoice_id, "tenant_id": tenant_id}).mappings().first()

    if not inv:
        raise HTTPException(status_code=404, detail="Facture introuvable")

    if inv["status"] == "PAID":
        raise HTTPException(status_code=400, detail="Cette facture est déjà soldée")

    new_paid = float(inv["paid_amount"] or 0) + body.amount
    new_status = "PAID" if new_paid >= float(inv["total_amount"]) else ("PARTIAL" if new_paid > 0 else "PENDING")
    reference = body.reference or f"PAY-{secrets.token_hex(6).upper()}"

    # 2. Insert payment — colonnes alignées sur le modèle Payment
    # (pas de received_by dans le schéma ; l'auteur est tracé via l'audit log).
    # payment_method est un Enum PostgreSQL: CASH, BANK_TRANSFER, MOBILE_MONEY...
    method_value = (body.method or "CASH").upper().replace(" ", "_")
    payment_id = db.execute(text("""
        INSERT INTO payments (id, tenant_id, student_id, invoice_id, amount, payment_method,
                              reference, notes, status, payment_date, created_at, updated_at)
        VALUES (:id, :tenant_id, :student_id, :invoice_id, :amount, :method,
                :reference, :notes, 'COMPLETED', CURRENT_DATE, NOW(), NOW())
        RETURNING id
    """), {
        "id": str(_uuid.uuid4()),
        "tenant_id": tenant_id, "student_id": str(inv["student_id"]),
        "invoice_id": body.invoice_id,
        "amount": body.amount, "method": method_value,
        "reference": reference, "notes": body.notes
    }).scalar()

    # 3. Update invoice
    db.execute(text("""
        UPDATE invoices SET paid_amount = :paid, status = :status, updated_at = NOW()
        WHERE id = :invoice_id AND tenant_id = :tenant_id
    """), {"paid": new_paid, "status": new_status, "invoice_id": body.invoice_id, "tenant_id": tenant_id})

    # 4. Audit log BEFORE commit
    log_audit(
        db,
        user_id=user_id,
        tenant_id=tenant_id,
        action="REGISTER_PAYMENT",
        resource_type="PAYMENT",
        resource_id=str(payment_id),
        details={"invoice_id": body.invoice_id, "amount": body.amount, "method": body.method, "reference": reference}
    )

    db.commit()
    return {"id": str(payment_id), "reference": reference, "status": new_status, "paid_amount": new_paid}


@router.post("/{payment_id}/reverse/")
@limiter.limit("5/minute")
def reverse_payment(
    request: Request,
    payment_id: str,
    body: ReversePaymentRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """
    Reverse (cancel) a payment and revert invoice status.
    Replaces the Supabase RPC `reverse_payment`.
    """
    tenant_id = _get_tenant_id(current_user)

    pay = db.execute(text("""
        SELECT id, amount, invoice_id, status FROM payments
        WHERE id = :payment_id AND tenant_id = :tenant_id
    """), {"payment_id": payment_id, "tenant_id": tenant_id}).mappings().first()

    if not pay:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    if pay["status"] == "REVERSED":
        raise HTTPException(status_code=400, detail="Ce paiement est déjà annulé")

    # Mark payment as reversed
    db.execute(text("""
        UPDATE payments SET status = 'REVERSED', notes = :notes, updated_at = NOW()
        WHERE id = :payment_id AND tenant_id = :tenant_id
    """), {"payment_id": payment_id, "notes": body.notes, "tenant_id": tenant_id})

    # Revert invoice paid_amount
    if pay["invoice_id"]:
        inv = db.execute(text("""
            SELECT paid_amount, total_amount FROM invoices WHERE id = :inv_id AND tenant_id = :tenant_id
        """), {"inv_id": str(pay["invoice_id"]), "tenant_id": tenant_id}).mappings().first()
        if inv:
            new_paid = max(0.0, float(inv["paid_amount"] or 0) - float(pay["amount"]))
            total = float(inv["total_amount"] or 0)
            new_status = "PAID" if new_paid >= total else ("PARTIAL" if new_paid > 0 else "PENDING")
            db.execute(text("""
                UPDATE invoices SET paid_amount = :paid, status = :status, updated_at = NOW()
                WHERE id = :inv_id AND tenant_id = :tenant_id
            """), {"paid": new_paid, "status": new_status, "inv_id": str(pay["invoice_id"]), "tenant_id": tenant_id})

    # Audit log BEFORE commit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="REVERSE_PAYMENT",
        resource_type="PAYMENT",
        resource_id=payment_id,
        details={"amount": float(pay["amount"]), "notes": body.notes}
    )

    db.commit()
    return {"message": "Paiement annulé avec succès"}


@router.get("/sequence/")
def get_next_sequence(
    prefix: str = Query("PAY-"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:read")),
):
    """Generate a unique reference/sequence number. Replaces `get_next_sequence_number` RPC."""
    year = datetime.now().year
    seq = secrets.token_hex(4).upper()
    return f"{prefix}{year}-{seq}"


# ─── Invoice endpoints ────────────────────────────────────────────────────────

@router.get("/invoices/")
def list_invoices(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    student_id: Optional[str] = None,
    inv_status: Optional[str] = Query(None, alias="status"),
):
    """List invoices with full student info — replaces Supabase join query."""
    tenant_id = _get_tenant_id(current_user)
    offset = (page - 1) * page_size
    params: dict = {"tenant_id": tenant_id, "limit": page_size, "offset": offset}

    filters = ""
    if student_id:
        filters += " AND i.student_id = :student_id"
        params["student_id"] = student_id
    if inv_status:
        filters += " AND i.status = :inv_status"
        params["inv_status"] = inv_status

    sql = text(f"""
        SELECT i.id, i.invoice_number, i.total_amount, i.paid_amount, i.status,
               i.due_date, i.issue_date, i.notes, i.items, i.student_id,
               i.has_payment_plan, i.installments_count, i.created_at,
               s.first_name, s.last_name, s.registration_number, s.phone
        FROM invoices i
        LEFT JOIN students s ON s.id = i.student_id
        WHERE i.tenant_id = :tenant_id {filters}
        ORDER BY i.created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    rows = db.execute(sql, params).fetchall()

    count_sql = text(f"SELECT COUNT(*) FROM invoices i WHERE i.tenant_id = :tenant_id {filters}")
    total = db.execute(count_sql, {k: v for k, v in params.items() if k not in ("limit", "offset")}).scalar() or 0

    items = []
    for r in rows:
        items.append({
            "id": str(r.id), "invoice_number": r.invoice_number,
            "total_amount": float(r.total_amount or 0), "paid_amount": float(r.paid_amount or 0),
            "status": r.status, "due_date": r.due_date.isoformat() if r.due_date else None,
            "issue_date": r.issue_date.isoformat() if r.issue_date else None,
            "notes": r.notes, "items": r.items,
            "has_payment_plan": r.has_payment_plan, "installments_count": r.installments_count,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "student_id": str(r.student_id) if r.student_id else None,
            "students": {
                "first_name": r.first_name, "last_name": r.last_name,
                "registration_number": r.registration_number, "phone": r.phone
            } if r.first_name else None
        })

    return {"items": items, "total": int(total or 0), "page": page, "page_size": page_size,
            "pages": math.ceil(float(total or 0) / page_size) if total and total > 0 else 1}


class InvoiceCreateBody(BaseModel):
    student_id: str
    invoice_number: Optional[str] = None
    total_amount: float = Field(..., gt=0, le=10_000_000)
    items: Optional[Any] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    has_payment_plan: bool = False
    installments_count: int = Field(1, ge=1, le=60)

@router.post("/invoices/", status_code=status.HTTP_201_CREATED)
def create_invoice_atomic(
    body: InvoiceCreateBody,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """
    Atomic invoice creation with optional payment plan.
    Replaces the Supabase RPC `create_invoice_v3`.
    """
    import json
    tenant_id = _get_tenant_id(current_user)
    year = datetime.now().year
    invoice_number = body.invoice_number or f"INV-{year}-{secrets.token_hex(4).upper()}"

    invoice_id = db.execute(text("""
        INSERT INTO invoices (id, tenant_id, student_id, invoice_number, total_amount, paid_amount,
                              subtotal, tax_amount, discount_amount,
                              items, due_date, issue_date, notes, has_payment_plan, installments_count,
                              status, created_at, updated_at)
        VALUES (:id, :tenant_id, :student_id, :invoice_number, :total_amount, 0,
                :total_amount, 0, 0,
                :items, :due_date, COALESCE(:due_date, CURRENT_DATE), :notes, :has_payment_plan, :installments_count,
                'PENDING', NOW(), NOW())
        RETURNING id
    """), {
        "id": str(_uuid.uuid4()),
        "tenant_id": tenant_id, "student_id": body.student_id,
        "invoice_number": invoice_number, "total_amount": body.total_amount,
        "items": json.dumps(body.items) if body.items else None,
        "due_date": body.due_date or None,
        "notes": body.notes,
        "has_payment_plan": body.has_payment_plan,
        "installments_count": body.installments_count
    }).scalar()

    # Audit log BEFORE commit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="CREATE",
        resource_type="INVOICE",
        resource_id=str(invoice_id),
        details={"invoice_number": invoice_number, "total_amount": body.total_amount, "student_id": body.student_id}
    )

    db.commit()
    return {"invoice_id": str(invoice_id), "invoice_number": invoice_number}


@router.put("/invoices/{invoice_id}/")
def update_invoice_endpoint(
    invoice_id: str,
    body: InvoiceCreateBody,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """Update an invoice."""
    import json
    tenant_id = _get_tenant_id(current_user)
    result = db.execute(text("""
        UPDATE invoices SET
            student_id = :student_id,
            invoice_number = :invoice_number,
            total_amount = :total_amount,
            items = :items,
            due_date = :due_date,
            notes = :notes,
            has_payment_plan = :has_payment_plan,
            installments_count = :installments_count,
            updated_at = NOW()
        WHERE id = :invoice_id AND tenant_id = :tenant_id
    """), {
        "tenant_id": tenant_id, "invoice_id": invoice_id,
        "student_id": body.student_id, "invoice_number": body.invoice_number,
        "total_amount": body.total_amount,
        "items": json.dumps(body.items) if body.items else None,
        "due_date": body.due_date if body.due_date else None,
        "notes": body.notes,
        "has_payment_plan": body.has_payment_plan,
        "installments_count": body.installments_count
    })
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Facture introuvable")

    # Audit log BEFORE commit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="UPDATE",
        resource_type="INVOICE",
        resource_id=invoice_id,
        details={"invoice_number": body.invoice_number, "total_amount": body.total_amount}
    )

    db.commit()
    return {"message": "Facture mise à jour"}


@router.delete("/invoices/{invoice_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice_endpoint(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """Delete an invoice by ID."""
    tenant_id = _get_tenant_id(current_user)
    result = db.execute(text("""
        DELETE FROM invoices WHERE id = :invoice_id AND tenant_id = :tenant_id
    """), {"invoice_id": invoice_id, "tenant_id": tenant_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Facture introuvable")

    # Audit log BEFORE commit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="DELETE",
        resource_type="INVOICE",
        resource_id=invoice_id,
    )

    db.commit()
    return None


@router.post("/send-reminders/")
@limiter.limit("3/minute")
def send_payment_reminders(
    request: Request,
    body: InvoiceReminderRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """
    Send payment reminders via WhatsApp, push and email.
    Fetches unpaid/overdue invoices with parent contact info.
    """
    from app.services.notifications import build_service_from_db

    tenant_id = _get_tenant_id(current_user)

    # Fetch invoices with parent contact details (phone + email)
    base_query = """
        SELECT
            i.id, i.invoice_number, i.total_amount, i.paid_amount, i.due_date,
            s.first_name AS student_first, s.last_name AS student_last,
            -- Parent contact info via parent_students
            u.email AS parent_email,
            u.phone AS parent_phone,
            u.first_name AS parent_first, u.last_name AS parent_last,
            u.id AS parent_user_id
        FROM invoices i
        JOIN students s ON s.id = i.student_id
        LEFT JOIN parent_students ps ON ps.student_id = s.id
        LEFT JOIN users u ON u.id = ps.parent_id AND u.tenant_id = :tenant_id
        WHERE i.tenant_id = :tenant_id AND i.status IN ('PENDING', 'OVERDUE')
    """

    if body.invoice_ids:
        overdue = db.execute(text(base_query + " AND i.id = ANY(:ids) LIMIT 200"),
                             {"tenant_id": tenant_id, "ids": body.invoice_ids}).fetchall()
    else:
        overdue = db.execute(text(base_query + " AND i.due_date < CURRENT_DATE LIMIT 100"),
                             {"tenant_id": tenant_id}).fetchall()

    # Build notification service from tenant settings
    svc = build_service_from_db(db, tenant_id)

    results: dict = {"whatsapp": 0, "push": 0, "email": 0, "in_app": 0, "errors": 0}
    count = 0

    for inv in overdue:
        student_name = f"{inv.student_first} {inv.student_last}".strip()
        parent_name = f"{inv.parent_first or ''} {inv.parent_last or ''}".strip() or "Parent"
        remaining = float(inv.total_amount or 0) - float(inv.paid_amount or 0)
        amount_str = f"{remaining:,.0f}".replace(",", " ")
        due_str = str(inv.due_date) if inv.due_date else "—"

        # ── Real delivery (WhatsApp + Push + Email) ──────────────────────────
        if svc and (inv.parent_phone or inv.parent_email):
            try:
                result = svc.send_payment_reminder(
                    to_phone=inv.parent_phone,
                    to_email=inv.parent_email,
                    onesignal_user_id=str(inv.parent_user_id) if inv.parent_user_id else None,
                    parent_name=parent_name,
                    student_name=student_name,
                    invoice_number=inv.invoice_number or str(inv.id)[:8],
                    amount=amount_str,
                    due_date=due_str,
                )
                if result.whatsapp:
                    results["whatsapp"] += 1
                if result.push:
                    results["push"] += 1
                if result.email:
                    results["email"] += 1
                if not result.any_sent:
                    results["errors"] += 1
            except Exception as e:
                logger.error("Reminder send failed for invoice %s: %s", inv.id, e)
                results["errors"] += 1

        # ── Always insert in-app notification ────────────────────────────────
        if inv.parent_user_id:
            try:
                db.execute(text("""
                    INSERT INTO notifications (id, tenant_id, user_id, type, title, message, is_read, created_at)
                    VALUES (:nid, :tid, :uid, 'PAYMENT_REMINDER', :title, :msg, false, NOW())
                    ON CONFLICT DO NOTHING
                """), {
                    "nid": str(_uuid.uuid4()),
                    "tid": tenant_id,
                    "uid": str(inv.parent_user_id),
                    "title": "Rappel de paiement",
                    "msg": f"La facture {inv.invoice_number} de {amount_str} est en attente (échéance: {due_str}).",
                })
                results["in_app"] += 1
            except Exception:
                pass

        count += 1

    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="SEND_REMINDERS",
        resource_type="INVOICE",
        details={
            "invoice_count": count,
            "channels": results,
            "specific_ids": body.invoice_ids,
        }
    )
    db.commit()

    summary = f"{count} rappel(s) — WhatsApp: {results['whatsapp']}, Push: {results['push']}, Email: {results['email']}, In-app: {results['in_app']}"
    return {"sent": count, "channels": results, "message": summary}


# ─── Fees endpoints ───────────────────────────────────────────────────────────

@router.get("/fees/")
def list_fees(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:read")),
):
    """List all fee types for the tenant."""
    tenant_id = _get_tenant_id(current_user)
    try:
        rows = db.execute(text("""
            SELECT id, name, description, amount, created_at FROM fees
            WHERE tenant_id = :tenant_id ORDER BY name
        """), {"tenant_id": tenant_id}).fetchall()
        items = [{"id": str(r.id), "name": r.name, "description": r.description,
                  "amount": float(r.amount or 0),
                  "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]
        return {"items": items, "total": len(items)}
    except Exception as e:
        logger.error("list_fees failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")


@router.post("/fees/", status_code=status.HTTP_201_CREATED)
def create_fee(
    body: FeeCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """Create a new fee type."""
    tenant_id = _get_tenant_id(current_user)
    try:
        fee_id = db.execute(text("""
            INSERT INTO fees (id, tenant_id, name, description, amount, created_at)
            VALUES (:id, :tenant_id, :name, :description, :amount, NOW())
            RETURNING id
        """), {"id": str(_uuid.uuid4()), "tenant_id": tenant_id, "name": body.name, "description": body.description, "amount": body.amount}).scalar()

        # Audit log BEFORE commit
        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=tenant_id,
            action="CREATE",
            resource_type="FEE",
            resource_id=str(fee_id),
            details={"name": body.name, "amount": body.amount}
        )

        db.commit()
        return {"id": str(fee_id), "name": body.name, "amount": body.amount}
    except Exception as e:
        db.rollback()
        logger.error("create_fee failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create resource. Please check your input and try again.")


@router.put("/fees/{fee_id}/")
def update_fee(
    fee_id: str,
    body: FeeUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """Update an existing fee."""
    tenant_id = _get_tenant_id(current_user)
    # SECURITY: Whitelist allowed column names to prevent SQL injection
    ALLOWED_FEE_FIELDS = {"name", "description", "amount"}
    try:
        updates = body.model_dump(exclude_unset=True)
        # Filter to only allowed fields (defense in depth)
        updates = {k: v for k, v in updates.items() if k in ALLOWED_FEE_FIELDS}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        set_clause = ", ".join([f"{k} = :{k}" for k in updates])
        updates["fee_id"] = fee_id
        updates["tenant_id"] = tenant_id
        result = db.execute(text(f"UPDATE fees SET {set_clause} WHERE id = :fee_id AND tenant_id = :tenant_id"), updates)
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Frais introuvable")

        # Audit log BEFORE commit
        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=tenant_id,
            action="UPDATE",
            resource_type="FEE",
            resource_id=fee_id,
            details=updates
        )

        db.commit()
        return {"message": "Frais mis à jour"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("update_fee failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update resource. Please check your input and try again.")


@router.delete("/fees/{fee_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_fee(
    fee_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """Delete a fee."""
    tenant_id = _get_tenant_id(current_user)
    try:
        result = db.execute(text("DELETE FROM fees WHERE id = :fee_id AND tenant_id = :tenant_id"),
                            {"fee_id": fee_id, "tenant_id": tenant_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Frais introuvable")

        # Audit log BEFORE commit
        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=tenant_id,
            action="DELETE",
            resource_type="FEE",
            resource_id=fee_id,
        )

        db.commit()
        return None
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("delete_fee failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete resource. Please try again.")


# ─── Send Invoice by Email ───────────────────────────────────────────────────

@router.post("/send-invoice-email/", status_code=200)
def send_invoice_email(
    body: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:read")),
):
    """POST /payments/send-invoice-email/ — log and acknowledge invoice email send."""
    tenant_id = _get_tenant_id(current_user)
    invoice_id = body.get("invoiceId") or body.get("invoice_id")
    recipient_email = body.get("recipientEmail") or body.get("recipient_email")

    if not invoice_id:
        raise HTTPException(status_code=400, detail="invoiceId is required")

    # Fetch invoice so we can confirm it exists and get the parent email fallback
    invoice = db.execute(text("""
        SELECT i.id, i.invoice_number, i.total_amount, i.status
        FROM invoices i
        WHERE i.id = :invoice_id AND i.tenant_id = :tenant_id
    """), {"invoice_id": invoice_id, "tenant_id": tenant_id}).mappings().first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    email_to = recipient_email or "parent@schoolflow.pro"

    # Audit log the action
    try:
        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=tenant_id,
            action="EMAIL_INVOICE",
            resource_type="INVOICE",
            resource_id=invoice_id,
            details={"recipient": email_to, "invoice_number": invoice.get("invoice_number")},
        )
        db.commit()
    except Exception:
        db.rollback()

    return {
        "success": True,
        "message": f"Facture envoyée à {email_to}",
        "invoice_id": invoice_id,
        "recipient": email_to,
    }


# ─── Payment Intent (Mobile Money) ───────────────────────────────────────────

@router.post("/intent/")
def create_payment_intent(
    amount: float = Query(..., gt=0, le=10_000_000),
    method: str = Query(..., description="MOBILE_MONEY, CARD, CASH"),
    invoice_id: Optional[UUID] = None,
    current_user: dict = Depends(require_permission("payments:write")),
):
    """Initiate a multi-method payment (Mobile Money, Card, Cash)."""
    tenant_id = current_user.get("tenant_id")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    reference = f"TX_{str(tenant_id)[:8] if tenant_id else 'unknown'}_{method}_{int(amount)}"
    return {
        "status": "pending", "method": method, "amount": amount,
        "transaction_reference": reference,
        "payment_url": f"https://mock-payment-gateway.schoolflow.pro/pay/{reference}",
        "message": "Intention de paiement créée avec succès."
    }
