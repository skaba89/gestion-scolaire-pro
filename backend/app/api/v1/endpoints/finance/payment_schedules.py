"""Payment Schedules CRUD endpoints"""
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
import math

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_tenant_id(current_user: dict):
    """Return tenant_id or raise 400 if not set (SUPER_ADMIN must select a tenant)."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun établissement sélectionné. Veuillez d'abord sélectionner un établissement.",
        )
    return tenant_id


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PaymentScheduleCreate(BaseModel):
    # SECURITY: tenant_id removed — always derived from current_user to prevent cross-tenant injection
    invoice_id: str
    installment_number: int
    amount: float = Field(0.0, ge=0, le=10_000_000)
    due_date: str
    status: str = "PENDING"
    notes: Optional[str] = None
    paid_date: Optional[str] = None


class PaymentScheduleUpdate(BaseModel):
    installment_number: Optional[int] = None
    amount: Optional[float] = Field(None, ge=0, le=10_000_000)
    due_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    paid_date: Optional[str] = None

    @classmethod
    def validate_amounts(cls, values):
        """Ensure amount is non-negative if provided."""
        if values.get('amount') is not None and values['amount'] < 0:
            raise ValueError('amount must be non-negative')
        return values


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _row_to_dict(r) -> dict:
    """Convert a DB row to a JSON-friendly dict."""
    return {
        "id": str(r.id),
        "tenant_id": str(r.tenant_id) if r.tenant_id else None,
        "invoice_id": str(r.invoice_id) if r.invoice_id else None,
        "installment_number": r.installment_number,
        "amount": float(r.amount or 0),
        "due_date": r.due_date.isoformat() if r.due_date else None,
        "paid_date": r.paid_date.isoformat() if r.paid_date else None,
        "status": r.status,
        "notes": r.notes,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/")
def list_payment_schedules(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    student_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
    ps_status: Optional[str] = Query(None, alias="status"),
    ordering: Optional[str] = Query("installment_number"),
):
    """List payment schedules with optional filters and pagination."""
    tenant_id = _get_tenant_id(current_user)
    offset = (page - 1) * page_size
    params: dict = {"tenant_id": tenant_id, "limit": page_size, "offset": offset}

    extra_where = ""
    if invoice_id:
        extra_where += " AND ps.invoice_id = :invoice_id"
        params["invoice_id"] = invoice_id
    if ps_status:
        extra_where += " AND ps.status = :ps_status"
        params["ps_status"] = ps_status
    if student_id:
        extra_where += " AND i.student_id = :student_id"
        params["student_id"] = student_id

    # Build ORDER BY safely
    allowed_order = {
        "installment_number": "ps.installment_number ASC",
        "-installment_number": "ps.installment_number DESC",
        "due_date": "ps.due_date ASC",
        "-due_date": "ps.due_date DESC",
        "amount": "ps.amount ASC",
        "-amount": "ps.amount DESC",
        "status": "ps.status ASC",
        "-status": "ps.status DESC",
        "created_at": "ps.created_at ASC",
        "-created_at": "ps.created_at DESC",
    }
    order_clause = allowed_order.get(ordering, "ps.installment_number ASC")

    sql = text(f"""
        SELECT ps.id, ps.tenant_id, ps.invoice_id, ps.installment_number,
               ps.amount, ps.due_date, ps.paid_date, ps.status, ps.notes,
               ps.created_at, ps.updated_at
        FROM payment_schedules ps
        LEFT JOIN invoices i ON ps.invoice_id = i.id
        WHERE ps.tenant_id = :tenant_id {extra_where}
        ORDER BY {order_clause}
        LIMIT :limit OFFSET :offset
    """)
    rows = db.execute(sql, params).fetchall()

    count_sql = text(f"""
        SELECT COUNT(*) FROM payment_schedules ps
        LEFT JOIN invoices i ON ps.invoice_id = i.id
        WHERE ps.tenant_id = :tenant_id {extra_where}
    """)
    total = db.execute(count_sql, {k: v for k, v in params.items() if k not in ("limit", "offset")}).scalar() or 0

    items = [_row_to_dict(r) for r in rows]

    return {
        "items": items,
        "total": int(total or 0),
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(float(total or 0) / page_size) if total and total > 0 else 1,
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_payment_schedules(
    body: List[PaymentScheduleCreate],
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """Create one or more payment schedules (bulk insert)."""
    tenant_id = _get_tenant_id(current_user)
    user_id = current_user.get("id")
    created_ids = []

    try:
        for schedule in body:
            # SECURITY: Always use tenant_id from current_user, never from request body
            sid = db.execute(text("""
                INSERT INTO payment_schedules
                    (tenant_id, invoice_id, installment_number, amount, due_date,
                     paid_date, status, notes, created_at, updated_at)
                VALUES
                    (:tenant_id, :invoice_id, :installment_number, :amount, :due_date::date,
                     :paid_date::timestamptz, :status, :notes, NOW(), NOW())
                RETURNING id
            """), {
                "tenant_id": tenant_id,
                "invoice_id": schedule.invoice_id,
                "installment_number": schedule.installment_number,
                "amount": schedule.amount,
                "due_date": schedule.due_date,
                "paid_date": schedule.paid_date,
                "status": schedule.status,
                "notes": schedule.notes,
            }).scalar()
            created_ids.append(str(sid))

        # Audit log BEFORE commit
        log_audit(
            db,
            user_id=user_id,
            tenant_id=tenant_id,
            action="CREATE",
            resource_type="PAYMENT_SCHEDULE",
            resource_id=created_ids[0] if created_ids else None,
            details={"count": len(created_ids), "ids": created_ids}
        )

        db.commit()
        return {"ids": created_ids, "count": len(created_ids)}
    except Exception as e:
        db.rollback()
        logger.error("create_payment_schedules failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create payment schedules.")


@router.get("/{schedule_id}")
def get_payment_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:read")),
):
    """Get a single payment schedule by ID."""
    tenant_id = _get_tenant_id(current_user)
    row = db.execute(text("""
        SELECT ps.id, ps.tenant_id, ps.invoice_id, ps.installment_number,
               ps.amount, ps.due_date, ps.paid_date, ps.status, ps.notes,
               ps.created_at, ps.updated_at
        FROM payment_schedules ps
        WHERE ps.id = :schedule_id AND ps.tenant_id = :tenant_id
    """), {"schedule_id": schedule_id, "tenant_id": tenant_id}).first()

    if not row:
        raise HTTPException(status_code=404, detail="Échéancier introuvable")

    return _row_to_dict(row)


@router.put("/{schedule_id}")
def update_payment_schedule(
    schedule_id: str,
    body: PaymentScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """Update a payment schedule by ID."""
    tenant_id = _get_tenant_id(current_user)
    user_id = current_user.get("id")

    # Check existence
    existing = db.execute(text("""
        SELECT id FROM payment_schedules
        WHERE id = :schedule_id AND tenant_id = :tenant_id
    """), {"schedule_id": schedule_id, "tenant_id": tenant_id}).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Échéancier introuvable")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")

    set_parts = []
    params = {"schedule_id": schedule_id, "tenant_id": tenant_id}

    if "installment_number" in updates:
        set_parts.append("installment_number = :installment_number")
        params["installment_number"] = updates["installment_number"]
    if "amount" in updates:
        set_parts.append("amount = :amount")
        params["amount"] = updates["amount"]
    if "due_date" in updates:
        set_parts.append("due_date = :due_date::date")
        params["due_date"] = updates["due_date"]
    if "status" in updates:
        set_parts.append("status = :status")
        params["status"] = updates["status"]
    if "notes" in updates:
        set_parts.append("notes = :notes")
        params["notes"] = updates["notes"]
    if "paid_date" in updates:
        set_parts.append("paid_date = :paid_date::timestamptz")
        params["paid_date"] = updates["paid_date"]

    set_parts.append("updated_at = NOW()")
    set_clause = ", ".join(set_parts)

    db.execute(text(f"""
        UPDATE payment_schedules SET {set_clause}
        WHERE id = :schedule_id AND tenant_id = :tenant_id
    """), params)

    # Audit log BEFORE commit
    log_audit(
        db,
        user_id=user_id,
        tenant_id=tenant_id,
        action="UPDATE",
        resource_type="PAYMENT_SCHEDULE",
        resource_id=schedule_id,
        details=updates,
    )

    db.commit()
    return {"message": "Échéancier mis à jour", "id": schedule_id}


@router.delete("/")
def delete_payment_schedules_by_filter(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
    invoice_id: Optional[str] = Query(None),
):
    """
    Delete payment schedules by filter (e.g. invoice_id).
    Used by the frontend to clear all schedules for an invoice before recreating them.
    """
    tenant_id = _get_tenant_id(current_user)
    user_id = current_user.get("id")

    if not invoice_id:
        raise HTTPException(status_code=400, detail="Le paramètre invoice_id est requis pour la suppression en masse")

    params = {"tenant_id": tenant_id, "invoice_id": invoice_id}

    # Count what will be deleted
    count = db.execute(text("""
        SELECT COUNT(*) FROM payment_schedules
        WHERE tenant_id = :tenant_id AND invoice_id = :invoice_id
    """), params).scalar() or 0

    if count == 0:
        return {"deleted": 0, "message": "Aucun échéancier à supprimer"}

    db.execute(text("""
        DELETE FROM payment_schedules
        WHERE tenant_id = :tenant_id AND invoice_id = :invoice_id
    """), params)

    # Audit log BEFORE commit
    log_audit(
        db,
        user_id=user_id,
        tenant_id=tenant_id,
        action="DELETE",
        resource_type="PAYMENT_SCHEDULE",
        resource_id=invoice_id,
        details={"invoice_id": invoice_id, "count": count},
    )

    db.commit()
    return {"deleted": count, "message": f"{count} échéancier(s) supprimé(s)"}


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """Delete a single payment schedule by ID."""
    tenant_id = _get_tenant_id(current_user)
    user_id = current_user.get("id")

    result = db.execute(text("""
        DELETE FROM payment_schedules
        WHERE id = :schedule_id AND tenant_id = :tenant_id
    """), {"schedule_id": schedule_id, "tenant_id": tenant_id})

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Échéancier introuvable")

    # Audit log BEFORE commit
    log_audit(
        db,
        user_id=user_id,
        tenant_id=tenant_id,
        action="DELETE",
        resource_type="PAYMENT_SCHEDULE",
        resource_id=schedule_id,
    )

    db.commit()
    return None
