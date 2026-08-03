"""Payment, Invoice and Fees endpoints"""
import base64
import csv
import io
import json
import logging
from typing import Optional, List, Any
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
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
from app.core.config import settings
from app.core.security import get_current_user, require_permission
from app.services.payment_gateways import CinetPayGateway, get_gateway
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


def _next_payment_reference(db: Session, tenant_id: str, *, prefix: str = "REC") -> str:
    """Sequential, per-tenant, per-calendar-year receipt reference:
    REC-{year}-{seq:05d}-{tenant_short}. Replaces the previous random-hex
    default (PAY-{hex}) which some administrations flagged as insufficient
    for legal accounting (docs/PAYMENTS_READINESS.md). Atomic via a single
    INSERT ... ON CONFLICT DO UPDATE — safe under concurrent requests
    without an explicit row lock. Existing payments keep their old
    reference untouched; a caller-supplied `reference` still overrides
    this entirely (see register_payment below).

    The trailing {tenant_short} (6 hex chars of the tenant's own id) is
    NOT part of the "sequential" promise — the counter itself is a clean
    1, 2, 3... per tenant per year. It exists solely because
    `payments.reference` is unique PLATFORM-WIDE, not per tenant (found
    by this feature's own test: two different schools' first payment of
    the year both produced "REC-2026-00001" and the second insert failed
    on a UniqueViolation). Changing that column's constraint to a
    composite (tenant_id, reference) unique index would be the cleaner
    long-term fix but touches an existing, working index — out of scope
    for this pass."""
    year = datetime.now().year
    seq = db.execute(text("""
        INSERT INTO payment_reference_counters (id, tenant_id, year, last_value, updated_at)
        VALUES (gen_random_uuid(), :tid, :year, 1, NOW())
        ON CONFLICT (tenant_id, year)
        DO UPDATE SET last_value = payment_reference_counters.last_value + 1, updated_at = NOW()
        RETURNING last_value
    """), {"tid": tenant_id, "year": year}).scalar()
    tenant_short = str(tenant_id).replace("-", "")[:6]
    return f"{prefix}-{year}-{seq:05d}-{tenant_short}"


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


@router.get("/export/")
def export_payments_csv(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:read")),
    student_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
):
    """Export CSV des paiements — Phase 1 (commercialisation), pièce
    explicitement demandée par l'audit et absente jusqu'ici (seuls les
    agrégats /analytics/ étaient exportables, jamais la liste brute des
    paiements). Même filtre tenant_id que list_payments/register_payment ;
    aucune limite de page ici par construction (c'est un export), mais
    borné à 5000 lignes pour éviter un export incontrôlé sur un tenant à
    très fort volume — au-delà, recommander un export par période.
    """
    tenant_id = _get_tenant_id(current_user)
    params: dict = {"tenant_id": tenant_id}
    extra = ""
    if student_id:
        extra += " AND p.student_id = :student_id"
        params["student_id"] = student_id
    if status_filter:
        extra += " AND p.status = :status_filter"
        params["status_filter"] = status_filter

    rows = db.execute(text(f"""
        SELECT p.reference, p.payment_date, p.amount, p.currency, p.payment_method, p.status,
               s.first_name, s.last_name, s.registration_number, i.invoice_number
        FROM payments p
        LEFT JOIN students s ON p.student_id = s.id
        LEFT JOIN invoices i ON p.invoice_id = i.id
        WHERE p.tenant_id = :tenant_id {extra}
        ORDER BY p.payment_date DESC
        LIMIT 5000
    """), params).fetchall()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["reference", "date", "eleve", "matricule", "facture", "montant", "devise", "mode", "statut"])
    for r in rows:
        writer.writerow([
            r.reference or "", r.payment_date.isoformat() if r.payment_date else "",
            f"{r.first_name or ''} {r.last_name or ''}".strip(), r.registration_number or "",
            r.invoice_number or "", r.amount, r.currency or "GNF", r.payment_method, r.status,
        ])
    buffer.seek(0)
    content = "﻿" + buffer.getvalue()  # BOM for Excel UTF-8 compatibility

    log_audit(
        db, user_id=current_user.get("id"), tenant_id=tenant_id,
        action="EXPORT_PAYMENTS", resource_type="PAYMENT",
        details={"count": len(rows), "student_id": student_id, "status": status_filter},
    )
    db.commit()

    date_str = datetime.now().strftime("%Y%m%d")
    return StreamingResponse(
        iter([content.encode("utf-8-sig")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="paiements_{date_str}.csv"'},
    )


def _receipt_html(*, tenant_name: str, receipt_number: str, student_name: str,
                   registration_number: str, amount: float, currency: str,
                   payment_date: str, method: str, status_label: str, reversed_notes: str = "") -> str:
    """Minimal, print-friendly HTML receipt — same base64-encoded-HTML
    pattern already used for bulletins (school_life.py:generate-report-
    card/v2/), so the frontend can reuse the exact same "open + browser
    print-to-PDF" flow instead of introducing a new PDF rendering path."""
    esc = lambda s: (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    reversed_block = (
        f'<p style="color:#b91c1c;font-weight:bold;">Paiement annulé — {esc(reversed_notes)}</p>'
        if status_label == "REVERSED" else ""
    )
    return f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Reçu {esc(receipt_number)}</title>
<style>
body {{ font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; color: #1f2937; }}
h1 {{ font-size: 20px; border-bottom: 2px solid #1f2937; padding-bottom: 8px; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
td {{ padding: 6px 0; }}
td:first-child {{ color: #6b7280; width: 40%; }}
.amount {{ font-size: 24px; font-weight: bold; margin-top: 16px; }}
</style></head><body>
<h1>{esc(tenant_name)}</h1>
<p>Reçu de paiement N° <strong>{esc(receipt_number)}</strong></p>
{reversed_block}
<table>
<tr><td>Élève / Étudiant</td><td>{esc(student_name)}</td></tr>
<tr><td>N° d'inscription</td><td>{esc(registration_number)}</td></tr>
<tr><td>Date</td><td>{esc(payment_date)}</td></tr>
<tr><td>Mode de paiement</td><td>{esc(method)}</td></tr>
<tr><td>Statut</td><td>{esc(status_label)}</td></tr>
</table>
<p class="amount">{amount:,.0f} {esc(currency)}</p>
</body></html>"""


@router.get("/{payment_id}/receipt/")
def get_payment_receipt(
    payment_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:read")),
):
    """Reçu de paiement numéroté (numéro = la référence unique déjà générée
    à l'enregistrement du paiement — voir reference dans register_payment).
    Retourne du HTML encodé en base64, même format que les bulletins, pour
    que le frontend imprime en PDF via la même mécanique déjà en place."""
    tenant_id = _get_tenant_id(current_user)

    row = db.execute(text("""
        SELECT p.reference, p.amount, p.currency, p.payment_date, p.payment_method, p.status, p.notes,
               s.first_name, s.last_name, s.registration_number,
               t.name AS tenant_name
        FROM payments p
        LEFT JOIN students s ON p.student_id = s.id
        LEFT JOIN tenants t ON p.tenant_id = t.id
        WHERE p.id = :pid AND p.tenant_id = :tid
    """), {"pid": payment_id, "tid": tenant_id}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Paiement introuvable")

    html_content = _receipt_html(
        tenant_name=row["tenant_name"] or "",
        receipt_number=row["reference"] or payment_id,
        student_name=f"{row['first_name'] or ''} {row['last_name'] or ''}".strip(),
        registration_number=row["registration_number"] or "",
        amount=float(row["amount"] or 0),
        currency=row["currency"] or "GNF",
        payment_date=row["payment_date"].isoformat() if row["payment_date"] else "",
        method=row["payment_method"] or "",
        status_label=row["status"] or "",
        reversed_notes=row["notes"] or "",
    )
    encoded = base64.b64encode(html_content.encode("utf-8")).decode("ascii")
    return {"html": encoded, "format": "html", "receipt_number": row["reference"] or payment_id}


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
    reference = body.reference or _next_payment_reference(db, tenant_id)

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

    # ── Règle métier : un PARENT ne voit que les factures de SES enfants ──
    roles = set(current_user.get("roles", []))
    privileged = roles & {"SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "ACCOUNTANT",
                          "SECRETARY", "STAFF"}
    if "PARENT" in roles and not privileged:
        child_rows = db.execute(text(
            "SELECT student_id FROM parent_students WHERE tenant_id = :tid AND parent_id = :uid"
        ), {"tid": tenant_id, "uid": current_user.get("id")}).fetchall()
        child_ids = [str(r[0]) for r in child_rows]
        if not child_ids:
            return {"items": [], "total": 0, "page": page, "page_size": page_size, "pages": 0}
        filters += " AND i.student_id = ANY(:parent_children)"
        params["parent_children"] = child_ids

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


def _deliver_reminders_background(svc, deliveries: list) -> None:
    """Send push/email (and WhatsApp as a fallback — see below) reminders
    outside the request path.

    Up to 200 invoices × several external calls each can take minutes;
    the HTTP worker must not be held for that.

    WhatsApp is normally sent separately via the tracked Arq pipeline
    (send_payment_reminders() enqueues send_whatsapp_notification per
    invoice, logged in notification_events with retry/webhook-status
    tracking) — each delivery dict here carries a "_skip_whatsapp" flag
    set to True when that enqueue succeeded, so this path doesn't send
    WhatsApp a second time. If the enqueue failed (e.g. Redis down),
    "_skip_whatsapp" is False and WhatsApp goes out through this
    untracked path instead, same as before this pipeline existed —
    push/email are unaffected either way.
    """
    results = {"whatsapp": 0, "push": 0, "email": 0, "errors": 0}
    original_whatsapp = getattr(svc, "whatsapp", None)
    for delivery in deliveries:
        skip_whatsapp = delivery.pop("_skip_whatsapp", False)
        svc.whatsapp = None if skip_whatsapp else original_whatsapp
        try:
            result = svc.send_payment_reminder(**delivery)
            if result.whatsapp:
                results["whatsapp"] += 1
            if result.push:
                results["push"] += 1
            if result.email:
                results["email"] += 1
            if not result.any_sent:
                results["errors"] += 1
        except Exception as e:
            logger.error(
                "Reminder send failed for invoice %s: %s",
                delivery.get("invoice_number"), e,
            )
            results["errors"] += 1
    svc.whatsapp = original_whatsapp
    logger.info("Reminder delivery finished: %s", results)


@router.post("/send-reminders/")
@limiter.limit("3/minute")
async def send_payment_reminders(
    request: Request,
    body: InvoiceReminderRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """
    Send payment reminders via WhatsApp, push and email.
    Fetches unpaid/overdue invoices with parent contact info.
    External delivery runs as a background task after the response.
    """
    from app.core.jobs import enqueue_job
    from app.services.notifications import build_service_from_db

    tenant_id = _get_tenant_id(current_user)

    # Fetch invoices with parent contact details (phone + email)
    base_query = """
        SELECT
            i.id, i.invoice_number, i.total_amount, i.paid_amount, i.due_date,
            s.id AS student_id, s.first_name AS student_first, s.last_name AS student_last,
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

    results: dict = {"in_app": 0}
    deliveries: list = []
    count = 0

    for inv in overdue:
        student_name = f"{inv.student_first} {inv.student_last}".strip()
        parent_name = f"{inv.parent_first or ''} {inv.parent_last or ''}".strip() or "Parent"
        remaining = float(inv.total_amount or 0) - float(inv.paid_amount or 0)
        amount_str = f"{remaining:,.0f}".replace(",", " ")
        due_str = str(inv.due_date) if inv.due_date else "—"

        invoice_number = inv.invoice_number or str(inv.id)[:8]

        # ── WhatsApp: tracked pipeline (notification_events + retry + webhook
        # status), one job per invoice, idempotent on invoice id so calling
        # this endpoint twice for the same invoice never double-sends.
        whatsapp_queued = False
        if inv.parent_phone:
            job_id = await enqueue_job(
                "send_whatsapp_notification",
                tenant_id=str(tenant_id),
                event_type="payment_reminder",
                to_phone=inv.parent_phone,
                template_key="payment_reminder",
                body_vars=[parent_name, invoice_number, amount_str, due_str, (svc.school_name if svc else "SchoolFlow Pro")],
                fallback_text=(
                    f"Rappel de paiement : la facture {invoice_number} de {amount_str} "
                    f"est en attente (échéance : {due_str})."
                ),
                student_id=str(inv.student_id) if inv.student_id else None,
                parent_id=str(inv.parent_user_id) if inv.parent_user_id else None,
                _job_id=f"wa:payment_reminder:{inv.id}",
            )
            whatsapp_queued = job_id is not None

        # ── Push + Email (+ WhatsApp fallback if the enqueue above failed) —
        # queued for background via the older untracked path.
        if svc and (inv.parent_phone or inv.parent_email):
            deliveries.append({
                "to_phone": inv.parent_phone,
                "to_email": inv.parent_email,
                "onesignal_user_id": str(inv.parent_user_id) if inv.parent_user_id else None,
                "parent_name": parent_name,
                "student_name": student_name,
                "invoice_number": invoice_number,
                "amount": amount_str,
                "due_date": due_str,
                "_skip_whatsapp": whatsapp_queued,
            })

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
            "queued_deliveries": len(deliveries),
            "in_app": results["in_app"],
            "specific_ids": body.invoice_ids,
        }
    )
    db.commit()

    if deliveries:
        background_tasks.add_task(_deliver_reminders_background, svc, deliveries)

    summary = (
        f"{count} rappel(s) — In-app: {results['in_app']}, "
        f"WhatsApp/Push/Email: {len(deliveries)} envoi(s) en cours en arrière-plan"
    )
    return {
        "sent": count,
        "queued": len(deliveries),
        "channels": results,
        "message": summary,
    }


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
    request: Request,
    amount: float = Query(..., gt=0, le=10_000_000),
    method: str = Query(..., description="MOBILE_MONEY, CINETPAY, PAYTECH"),
    invoice_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """Create a real online payment intent, confirmed later by a signed webhook.

    The invoice is deliberately not marked as paid here.  A PENDING payment is
    persisted first so the CinetPay/PayTech webhook can reconcile it safely.
    """
    tenant_id = _get_tenant_id(current_user)
    if not invoice_id:
        raise HTTPException(status_code=400, detail="Une facture est requise")

    method_upper = method.upper()
    if method_upper not in {"MOBILE_MONEY", "CINETPAY", "PAYTECH"}:
        raise HTTPException(
            status_code=400,
            detail="Cette méthode ne peut pas être initiée en ligne",
        )

    invoice = db.execute(text("""
        SELECT i.id, i.invoice_number, i.student_id, i.total_amount,
               i.paid_amount, i.status, COALESCE(i.currency, 'GNF') AS currency,
               s.first_name, s.last_name,
               t.name AS tenant_name, t.slug AS tenant_slug, t.settings AS tenant_settings
        FROM invoices i
        JOIN students s ON s.id = i.student_id AND s.tenant_id = i.tenant_id
        JOIN tenants t ON t.id = i.tenant_id
        WHERE i.id = :invoice_id AND i.tenant_id = :tenant_id
    """), {"invoice_id": str(invoice_id), "tenant_id": tenant_id}).mappings().first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Facture introuvable")
    if str(invoice["status"]).upper().endswith("PAID"):
        raise HTTPException(status_code=400, detail="Cette facture est déjà soldée")

    outstanding = max(
        0.0,
        float(invoice["total_amount"] or 0) - float(invoice["paid_amount"] or 0),
    )
    if amount > outstanding:
        raise HTTPException(
            status_code=400,
            detail="Le montant dépasse le reste à payer",
        )

    raw_settings = invoice["tenant_settings"] or {}
    try:
        tenant_settings = raw_settings if isinstance(raw_settings, dict) else json.loads(raw_settings)
    except (TypeError, json.JSONDecodeError):
        logger.warning("Invalid payment settings for tenant %s", tenant_id)
        tenant_settings = {}

    gateway = get_gateway(method_upper, tenant_settings)
    if not gateway:
        raise HTTPException(
            status_code=400,
            detail="Aucune passerelle Mobile Money n'est configurée pour cet établissement",
        )

    gateway_name = "cinetpay" if isinstance(gateway, CinetPayGateway) else "paytech"
    backend_url = settings.BACKEND_URL or str(request.base_url).rstrip("/")
    return_url = (
        f"{settings.FRONTEND_URL}/{invoice['tenant_slug']}/admin/finances"
        f"?payment=processing&invoice_id={invoice_id}"
    )
    notify_url = f"{backend_url}/api/v1/parents/payments/webhook/{gateway_name}/"

    result = gateway.initiate(
        amount=amount,
        currency=str(invoice["currency"] or "GNF"),
        invoice_id=str(invoice_id),
        invoice_number=str(invoice["invoice_number"] or invoice_id),
        student_name=f"{invoice['first_name'] or ''} {invoice['last_name'] or ''}".strip(),
        tenant_name=str(invoice["tenant_name"] or ""),
        return_url=return_url,
        notify_url=notify_url,
    )
    if not result.success or not result.payment_url:
        raise HTTPException(
            status_code=502,
            detail=result.error or "La passerelle de paiement est indisponible",
        )

    payment_id = str(_uuid.uuid4())
    try:
        db.execute(text("""
            INSERT INTO payments
                (id, tenant_id, student_id, invoice_id, amount, currency,
                 payment_date, payment_method, status, reference,
                 transaction_id, notes, created_at, updated_at)
            VALUES
                (:id, :tenant_id, :student_id, :invoice_id, :amount, :currency,
                 CURRENT_DATE, 'MOBILE_MONEY', 'PENDING', :reference,
                 :gateway_ref, :notes, NOW(), NOW())
        """), {
            "id": payment_id,
            "tenant_id": tenant_id,
            "student_id": str(invoice["student_id"]),
            "invoice_id": str(invoice_id),
            "amount": amount,
            "currency": str(invoice["currency"] or "GNF"),
            "reference": result.transaction_id,
            "gateway_ref": result.gateway_ref,
            "notes": f"Passerelle {gateway_name}",
        })
        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=tenant_id,
            action="INITIATE_PAYMENT",
            resource_type="PAYMENT",
            resource_id=payment_id,
            details={
                "invoice_id": str(invoice_id),
                "method": "MOBILE_MONEY",
                "gateway": gateway_name,
                "reference": result.transaction_id,
                "amount": amount,
            },
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Unable to persist payment intent: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Impossible d'enregistrer l'intention de paiement",
        ) from exc

    return {
        "status": "pending",
        "method": "MOBILE_MONEY",
        "gateway": gateway_name.upper(),
        "amount": amount,
        "transaction_reference": result.transaction_id,
        "payment_url": result.payment_url,
        "message": "Paiement initié. La facture sera mise à jour après confirmation de l'opérateur.",
    }
