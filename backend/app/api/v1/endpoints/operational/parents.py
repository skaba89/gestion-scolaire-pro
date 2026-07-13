import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_, text
from sqlalchemy.exc import IntegrityError
from typing import List, Optional, Any
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
import math
import secrets
import json

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user, require_permission
from app.schemas.parents import ParentStudent, ParentStudentCreate
from app.crud import parents as crud_parents
from app.utils.audit import log_audit
from app.services.payment_gateways import CinetPayGateway, get_gateway
from app.models import ParentStudent as ParentStudentModel, User, UserRole

router = APIRouter()

# --- List all parents ---

@router.get("/", response_model=List[dict])
def list_parents(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    search: Optional[str] = Query(None, description="Search by first_name, last_name, or email"),
):
    """List all parents for the tenant. GET /parents/"""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    query = db.query(User).join(
        UserRole,
        and_(
            UserRole.user_id == User.id,
            UserRole.tenant_id == User.tenant_id,
        ),
    ).filter(
        User.tenant_id == tenant_id,
        UserRole.role == "PARENT",
    )
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(
            User.first_name.ilike(pattern),
            User.last_name.ilike(pattern),
            User.email.ilike(pattern),
        ))

    parents = query.order_by(User.last_name, User.first_name).all()
    parent_ids = [parent.id for parent in parents]
    links_by_parent: dict[str, list[str]] = {}
    if parent_ids:
        links = db.query(ParentStudentModel).filter(
            ParentStudentModel.tenant_id == tenant_id,
            ParentStudentModel.parent_id.in_(parent_ids),
        ).all()
        for link in links:
            links_by_parent.setdefault(str(link.parent_id), []).append(str(link.student_id))

    return [
        {
            "id": str(parent.id),
            "tenant_id": str(parent.tenant_id),
            "first_name": parent.first_name,
            "last_name": parent.last_name,
            "email": parent.email,
            "phone": parent.phone,
            "occupation": parent.occupation,
            "address": parent.address,
            "avatar_url": parent.avatar_url,
            "is_active": parent.is_active,
            "is_verified": parent.is_verified,
            "student_ids": links_by_parent.get(str(parent.id), []),
            "created_at": parent.created_at,
            "updated_at": parent.updated_at,
        }
        for parent in parents
    ]

# --- Create parent (POST /parents/) ---

class ParentCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=20)
    occupation: Optional[str] = Field(default=None, max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_parent(
    parent_in: ParentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new parent. POST /parents/"""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    normalized_email = str(parent_in.email).strip().lower()
    if db.query(User).filter(func.lower(User.email) == normalized_email).first():
        raise HTTPException(status_code=409, detail="An account already exists for this email")

    try:
        parent = User(
            tenant_id=tenant_id,
            email=normalized_email,
            username=normalized_email,
            first_name=parent_in.first_name.strip(),
            last_name=parent_in.last_name.strip(),
            phone=parent_in.phone,
            occupation=parent_in.occupation,
            address=parent_in.address,
            password_hash=None,
            is_active=False,
            is_verified=False,
            must_change_password=True,
        )
        db.add(parent)
        db.flush()
        db.add(UserRole(
            tenant_id=tenant_id,
            user_id=parent.id,
            role="PARENT",
        ))
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_PARENT", resource_type="PARENT",
                  resource_id=str(parent.id),
                  details={"first_name": parent_in.first_name, "last_name": parent_in.last_name})
        db.commit()
        db.refresh(parent)
        return {
            "id": str(parent.id),
            "tenant_id": str(tenant_id),
            "first_name": parent.first_name,
            "last_name": parent.last_name,
            "email": parent.email,
            "phone": parent.phone,
            "occupation": parent.occupation,
            "address": parent.address,
            "is_active": parent.is_active,
        }
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account already exists for this email")
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to create parent: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.delete("/pending/{parent_id}/")
def delete_pending_parent(
    parent_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a pending parent identity; active portal accounts are preserved."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")

    parent = db.query(User).join(
        UserRole,
        and_(
            UserRole.user_id == User.id,
            UserRole.tenant_id == User.tenant_id,
        ),
    ).filter(
        User.id == parent_id,
        User.tenant_id == tenant_id,
        UserRole.role == "PARENT",
    ).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")
    if parent.is_active:
        raise HTTPException(status_code=409, detail="Active parent accounts cannot be deleted here")

    db.query(ParentStudentModel).filter(
        ParentStudentModel.parent_id == parent.id,
        ParentStudentModel.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.query(UserRole).filter(
        UserRole.user_id == parent.id,
        UserRole.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="DELETE_PENDING_PARENT",
        resource_type="PARENT",
        resource_id=str(parent.id),
    )
    db.delete(parent)
    db.commit()
    return {"status": "deleted", "id": str(parent_id)}


# --- Existing endpoints ---

@router.get("/children/", response_model=List[ParentStudent])
def read_parent_children(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Retrieve all children associated with the current parent user."""
    return crud_parents.get_parent_children(db, parent_id=current_user.get("id"), tenant_id=current_user.get("tenant_id"))

@router.get("/students/{student_id}/parents/", response_model=List[ParentStudent])
def read_student_parents(
    student_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Retrieve all parents associated with a specific student."""
    return crud_parents.get_student_parents(db, student_id=student_id, tenant_id=current_user.get("tenant_id"))


# --- Relationship Management ---

class LinkRequest(BaseModel):
    parent_id: UUID
    student_id: UUID
    is_primary: bool = False
    relation_type: Optional[str] = None


@router.post("/link/", status_code=status.HTTP_201_CREATED)
def create_parent_student_link(
    link: LinkRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a parent-student link."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        obj_in = ParentStudentCreate(
            parent_id=link.parent_id,
            student_id=link.student_id,
            is_primary=link.is_primary,
            relation_type=link.relation_type,
        )
        result = crud_parents.create_parent_student_link(db, obj_in=obj_in, tenant_id=tenant_id)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_PARENT_STUDENT_LINK", resource_type="PARENT_STUDENT",
                  resource_id=str(result.id))
        db.commit()
        db.refresh(result)
        return result
    except Exception as e:
        db.rollback()
        logger.error("Failed to create parent-student link: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.delete("/link/{link_id}/")
def remove_parent_student_link(
    link_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Remove a parent-student link."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            DELETE FROM parent_students WHERE id = :lid AND tenant_id = :tid
        """), {"lid": str(link_id), "tid": tenant_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Link not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_PARENT_STUDENT_LINK", resource_type="PARENT_STUDENT",
                  resource_id=str(link_id))
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to delete parent-student link: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to delete resource. Please try again.")


@router.get("/unlinked-students/")
def get_unlinked_students(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get students without parent links."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    rows = db.execute(text("""
        SELECT s.id, s.first_name, s.last_name, s.registration_number, s.classroom_id,
               c.name as classroom_name
        FROM students s
        LEFT JOIN classrooms c ON c.id = s.classroom_id
        WHERE s.tenant_id = :tid
          AND s.is_archived = false
          AND s.id NOT IN (
              SELECT DISTINCT student_id FROM parent_students WHERE tenant_id = :tid
          )
        ORDER BY s.last_name, s.first_name
    """), {"tid": tenant_id}).mappings().all()
    return rows


# --- Dashboard (existing) ---

@router.get("/dashboard/")
def get_parent_dashboard(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve all aggregated metrics for the Parent Dashboard."""
    parent_id = current_user.get("id")
    tenant_id = current_user.get("tenant_id")
    if not parent_id or not tenant_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Fetch children IDs for this parent
    children_res = db.execute(text("""
        SELECT student_id, students.first_name, students.last_name, students.registration_number, students.photo_url
        FROM parent_students
        JOIN students ON parent_students.student_id = students.id
        WHERE parent_id = :parent_id AND parent_students.tenant_id = :tenant_id
    """), {"parent_id": parent_id, "tenant_id": tenant_id}).fetchall()

    children_list = [dict(r._mapping) for r in children_res]
    student_ids = [str(c["student_id"]) for c in children_list]

    if not student_ids:
        return {
            "children": [], "unpaidInvoices": [], "upcomingEvents": [],
            "recentGrades": [], "attendanceAlerts": [], "latestScans": [],
            "notifications": [], "unreadMessagesCount": 0
        }

    params_base = {"tenant_id": tenant_id, "student_ids": student_ids}

    # Unpaid Invoices
    query_invoices = text("""
        SELECT * FROM invoices
        WHERE student_id = ANY(:student_ids) AND status IN ('PENDING', 'PARTIAL', 'OVERDUE')
        AND tenant_id = :tenant_id
    """)
    unpaid_invoices = [dict(r._mapping) for r in db.execute(query_invoices, params_base).fetchall()]

    # Recent Grades
    query_grades = text("""
        SELECT g.id, g.score, g.created_at,
               a.name as assessment_name, a.max_score,
               s.name as subject_name,
               st.first_name, st.last_name
        FROM grades g
        JOIN assessments a ON g.assessment_id = a.id
        LEFT JOIN subjects s ON a.subject_id = s.id
        JOIN students st ON g.student_id = st.id
        WHERE g.student_id = ANY(:student_ids) AND g.score IS NOT NULL
        AND g.tenant_id = :tenant_id
        ORDER BY g.created_at DESC LIMIT 5
    """)
    recent_grades = [dict(r._mapping) for r in db.execute(query_grades, params_base).fetchall()]

    # Format grades to match frontend expectation
    formatted_grades = []
    for g in recent_grades:
         formatted_grades.append({
             "id": g["id"], "score": g["score"], "created_at": g["created_at"],
             "assessments": { "max_score": g["max_score"], "name": g["assessment_name"], "subjects": {"name": g["subject_name"]} },
             "students": {"first_name": g["first_name"], "last_name": g["last_name"]}
         })

    # Attendance Alerts
    query_attendance = text("""
        SELECT a.id, a.date, a.status, st.first_name, st.last_name
        FROM attendance a
        JOIN students st ON a.student_id = st.id
        WHERE a.student_id = ANY(:student_ids) AND a.status IN ('ABSENT', 'LATE')
        AND a.tenant_id = :tenant_id
        ORDER BY a.date DESC LIMIT 5
    """)
    attendance_alerts = []
    for a in db.execute(query_attendance, params_base).fetchall():
        row = dict(a._mapping)
        attendance_alerts.append({
            "id": row["id"], "date": row["date"].isoformat() if row["date"] else None, "status": row["status"],
            "students": {"first_name": row["first_name"], "last_name": row["last_name"]}
        })

    # Upcoming Events
    today = datetime.now().date().isoformat()
    upcoming_events = [dict(r._mapping) for r in db.execute(text("""
        SELECT * FROM school_events
        WHERE tenant_id = :tenant_id AND start_date >= :today
        ORDER BY start_date ASC LIMIT 5
    """), {"tenant_id": tenant_id, "today": today}).fetchall()]

    # Notifications
    notifications = [dict(r._mapping) for r in db.execute(text("""
        SELECT * FROM notifications
        WHERE user_id = :parent_id AND is_read = false
        ORDER BY created_at DESC LIMIT 5
    """), {"parent_id": parent_id}).fetchall()]

    # Student Check-ins / Scans
    scans = [dict(r._mapping) for r in db.execute(text("""
        SELECT c.*, st.first_name, st.last_name
        FROM student_check_ins c
        JOIN students st ON c.student_id = st.id
        WHERE c.student_id = ANY(:student_ids)
        AND c.tenant_id = :tenant_id
        ORDER BY c.checked_at DESC LIMIT 10
    """), params_base).fetchall()]

    formatted_scans = []
    for s in scans:
        formatted_scans.append({
            "id": s["id"], "check_in_type": s["check_in_type"], "checked_at": s["checked_at"].isoformat() if s["checked_at"] else None,
            "students": {"first_name": s["first_name"], "last_name": s["last_name"]}
        })

    # Clean lists of dates for JSON response
    def clean_row(row):
        for k, v in row.items():
            if isinstance(v, datetime): row[k] = v.isoformat()
        return row

    return {
        "children": children_list,
        "unpaidInvoices": [clean_row(inv) for inv in unpaid_invoices],
        "upcomingEvents": [clean_row(ev) for ev in upcoming_events],
        "recentGrades": formatted_grades,
        "attendanceAlerts": attendance_alerts,
        "latestScans": formatted_scans,
        "notifications": [clean_row(n) for n in notifications],
        "unreadMessagesCount": 0
    }


# ─── Parent Portal Endpoints ──────────────────────────────────────────────────
# These endpoints are called by the frontend parent portal.


# --- GET /parents/terms/ --- Alias to terms for parent dashboard ---

@router.get("/terms/")
def list_parent_terms(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all terms for the tenant — parent portal alias."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    try:
        rows = db.execute(text(
            "SELECT id, name, start_date, end_date, academic_year_id, sequence_number, "
            "is_active, created_at, updated_at "
            "FROM terms WHERE tenant_id = :tid ORDER BY start_date"
        ), {"tid": tenant_id}).fetchall()
        result = []
        for r in rows:
            d = dict(r._mapping)
            # Annotate academic year name
            ay = db.execute(text(
                "SELECT name FROM academic_years WHERE id = :ayid"
            ), {"ayid": d.get("academic_year_id")}).first()
            d["academic_year"] = {"name": ay.name} if ay else None
            result.append(d)
        return result
    except Exception:
        return []


# --- GET /parents/risk-scores/ --- Student risk scores for parent dashboard ---

@router.get("/risk-scores/")
def get_risk_scores(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Retrieve risk scores for the parent's children."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    if not user_id or not tenant_id:
        return []

    # Get children for this parent
    children = db.execute(text(
        "SELECT student_id FROM parent_students WHERE parent_id = :uid AND tenant_id = :tid"
    ), {"uid": user_id, "tid": tenant_id}).fetchall()
    if not children:
        return []

    child_ids = [str(c.student_id) for c in children]
    placeholders = ",".join([f":id{i}" for i in range(len(child_ids))])
    params = {f"id{i}": cid for i, cid in enumerate(child_ids)}
    params["tid"] = tenant_id

    rows = db.execute(text(
        f"SELECT * FROM student_risk_scores "
        f"WHERE tenant_id = :tid AND student_id IN ({placeholders}) "
        f"ORDER BY calculated_at DESC NULLS LAST"
    ), params).fetchall()
    return [dict(r._mapping) for r in rows]


# --- GET /parents/payment-schedules/ --- Alias to payment schedules ---

@router.get("/payment-schedules/")
def list_parent_payment_schedules(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    student_id: Optional[str] = Query(None),
    invoice_id: Optional[str] = Query(None),
    ps_status: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List payment schedules — parent portal alias scoped to parent's children."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    if not tenant_id:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "pages": 1}

    offset = (page - 1) * page_size
    params: dict = {"tenant_id": tenant_id, "limit": page_size, "offset": offset}

    # If no specific student_id, scope to parent's children
    if not student_id and user_id:
        children = db.execute(text(
            "SELECT student_id FROM parent_students WHERE parent_id = :uid AND tenant_id = :tid"
        ), {"uid": user_id, "tid": tenant_id}).fetchall()
        if not children:
            return {"items": [], "total": 0, "page": page, "page_size": page_size, "pages": 1}
        child_ids = [str(c.student_id) for c in children]
        params["child_ids"] = child_ids
    else:
        child_ids = [student_id] if student_id else []
        params["child_ids"] = child_ids

    extra_where = ""
    if params["child_ids"]:
        extra_where += " AND i.student_id = ANY(:child_ids)"
    if invoice_id:
        extra_where += " AND ps.invoice_id = :invoice_id"
        params["invoice_id"] = invoice_id
    if ps_status:
        extra_where += " AND ps.status = :ps_status"
        params["ps_status"] = ps_status

    sql = text(f"""
        SELECT ps.id, ps.tenant_id, ps.invoice_id, ps.installment_number,
               ps.amount, ps.due_date, ps.paid_date, ps.status, ps.notes,
               ps.created_at, ps.updated_at
        FROM payment_schedules ps
        LEFT JOIN invoices i ON ps.invoice_id = i.id
        WHERE ps.tenant_id = :tenant_id {extra_where}
        ORDER BY ps.installment_number ASC
        LIMIT :limit OFFSET :offset
    """)
    rows = db.execute(sql, params).fetchall()

    count_sql = text(f"""
        SELECT COUNT(*) FROM payment_schedules ps
        LEFT JOIN invoices i ON ps.invoice_id = i.id
        WHERE ps.tenant_id = :tenant_id {extra_where}
    """)
    total = db.execute(
        count_sql,
        {k: v for k, v in params.items() if k not in ("limit", "offset")}
    ).scalar() or 0

    items = []
    for r in rows:
        items.append({
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
        })

    return {
        "items": items,
        "total": int(total or 0),
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(float(total or 0) / page_size) if total and total > 0 else 1,
    }


# --- POST /parents/payments/create/ --- Create payment for an invoice ---

ONLINE_METHODS = {"CINETPAY", "PAYTECH", "MOBILE_MONEY", "CARD", "STRIPE"}


class ParentPaymentCreate(BaseModel):
    invoice_id: str
    amount: float = Field(..., gt=0, le=10_000_000)
    method: str = "CASH"
    reference: Optional[str] = None
    notes: Optional[str] = None
    # Online payment extras (sent by the frontend)
    invoiceNumber: Optional[str] = None
    studentName: Optional[str] = None
    tenantName: Optional[str] = None
    customerPhone: Optional[str] = None
    customerEmail: Optional[str] = None


@router.post("/payments/create/", status_code=status.HTTP_201_CREATED)
def create_parent_payment(
    body: ParentPaymentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Parent creates or initiates a payment against an invoice.

    - CASH / BANK_TRANSFER  → recorded immediately as COMPLETED
    - CINETPAY / PAYTECH    → returns a redirect URL; marked PENDING until webhook confirms
    """
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Verify the invoice belongs to one of the parent's children
    children = db.execute(text(
        "SELECT student_id FROM parent_students WHERE parent_id = :uid AND tenant_id = :tid"
    ), {"uid": user_id, "tid": tenant_id}).fetchall()
    if not children:
        raise HTTPException(status_code=403, detail="No children linked")
    child_ids = [str(c.student_id) for c in children]

    inv = db.execute(text(
        "SELECT id, invoice_number, total_amount, paid_amount, status, student_id, currency "
        "FROM invoices WHERE id = :invoice_id AND tenant_id = :tenant_id"
    ), {"invoice_id": body.invoice_id, "tenant_id": tenant_id}).mappings().first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if str(inv["student_id"]) not in child_ids:
        raise HTTPException(status_code=403, detail="Invoice not linked to your children")
    if inv["status"] == "PAID":
        raise HTTPException(status_code=400, detail="Invoice is already fully paid")

    outstanding = max(
        0.0,
        float(inv["total_amount"] or 0) - float(inv["paid_amount"] or 0),
    )
    if body.amount > outstanding:
        raise HTTPException(status_code=400, detail="Le montant dépasse le reste à payer")

    method_upper = body.method.upper()
    is_online = method_upper in ONLINE_METHODS

    if method_upper in {"CARD", "STRIPE"}:
        raise HTTPException(
            status_code=400,
            detail="Le paiement par carte n'est pas configuré pour cet établissement.",
        )

    # ── Online payment via gateway ────────────────────────────────────────────
    if is_online and method_upper not in ("CARD", "STRIPE"):
        # Fetch tenant settings to get gateway credentials
        tenant_row = db.execute(text(
            "SELECT settings FROM tenants WHERE id = :tid"
        ), {"tid": tenant_id}).mappings().first()
        tenant_settings: dict = {}
        if tenant_row and tenant_row["settings"]:
            raw = tenant_row["settings"]
            tenant_settings = raw if isinstance(raw, dict) else json.loads(raw)

        gateway = get_gateway(method_upper, tenant_settings)
        if not gateway:
            raise HTTPException(
                status_code=400,
                detail=f"La passerelle {method_upper} n'est pas configurée pour cet établissement."
            )

        # Build callback URLs
        backend_url = settings.BACKEND_URL or str(request.base_url).rstrip("/")
        return_url = f"{backend_url}/api/v1/parents/payments/return/?invoice_id={body.invoice_id}"
        gateway_name = "cinetpay" if isinstance(gateway, CinetPayGateway) else "paytech"
        notify_url = f"{backend_url}/api/v1/parents/payments/webhook/{gateway_name}/"

        invoice_number = body.invoiceNumber or str(inv["invoice_number"] or body.invoice_id)
        result = gateway.initiate(
            amount=body.amount,
            currency=str(inv["currency"] or tenant_settings.get("currency", "GNF")),
            invoice_id=body.invoice_id,
            invoice_number=invoice_number,
            student_name=body.studentName or "",
            tenant_name=body.tenantName or "",
            return_url=return_url,
            notify_url=notify_url,
            customer_phone=body.customerPhone,
            customer_email=body.customerEmail,
        )

        if not result.success:
            raise HTTPException(status_code=502, detail=result.error or "Erreur passerelle de paiement")

        # Create a PENDING payment record so we can match the webhook
        try:
            payment_id = db.execute(text("""
                INSERT INTO payments
                    (id, tenant_id, student_id, invoice_id, amount, currency,
                     payment_method, reference, transaction_id, notes, status,
                     payment_date, created_at, updated_at)
                VALUES
                    (:id, :tenant_id, :student_id, :invoice_id, :amount, :currency,
                     'MOBILE_MONEY', :reference, :gateway_ref, :notes, 'PENDING',
                     CURRENT_DATE, NOW(), NOW())
                RETURNING id
            """), {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "student_id": str(inv["student_id"]),
                "invoice_id": body.invoice_id,
                "amount": body.amount,
                "currency": str(inv["currency"] or "GNF"),
                "reference": result.transaction_id,
                "gateway_ref": result.gateway_ref,
                "notes": f"Passerelle {gateway_name}",
            }).scalar()
            log_audit(db, user_id=user_id, tenant_id=tenant_id,
                      action="INITIATE_PAYMENT", resource_type="PAYMENT",
                      resource_id=str(payment_id),
                      details={"invoice_id": body.invoice_id, "method": method_upper,
                               "reference": result.transaction_id, "amount": body.amount})
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error("Failed to create pending payment record: %s", e, exc_info=True)
            # Still return the URL — the webhook will handle reconciliation

        return {
            "url": result.payment_url,
            "status": "pending",
            "reference": result.transaction_id,
            "gateway_ref": result.gateway_ref,
            "method": method_upper,
        }

    # ── Direct payment (CASH / BANK_TRANSFER) ────────────────────────────────
    if method_upper not in {"CASH", "BANK_TRANSFER"}:
        raise HTTPException(status_code=400, detail="Méthode de paiement non prise en charge")

    reference = body.reference or f"PAY-{secrets.token_hex(6).upper()}"
    new_paid = float(inv["paid_amount"] or 0) + body.amount
    new_status = "PAID" if new_paid >= float(inv["total_amount"]) else ("PARTIAL" if new_paid > 0 else "PENDING")

    try:
        payment_id = db.execute(text("""
            INSERT INTO payments
                (id, tenant_id, student_id, invoice_id, amount, currency,
                 payment_method, reference, notes, status, payment_date,
                 created_at, updated_at)
            VALUES
                (:id, :tenant_id, :student_id, :invoice_id, :amount, :currency,
                 :method, :reference, :notes, 'COMPLETED', CURRENT_DATE,
                 NOW(), NOW())
            RETURNING id
        """), {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "student_id": str(inv["student_id"]),
            "invoice_id": body.invoice_id,
            "amount": body.amount,
            "currency": str(inv["currency"] or "GNF"),
            "method": method_upper,
            "reference": reference,
            "notes": body.notes,
        }).scalar()

        db.execute(text("""
            UPDATE invoices SET paid_amount = :paid, status = :status, updated_at = NOW()
            WHERE id = :invoice_id AND tenant_id = :tenant_id
        """), {"paid": new_paid, "status": new_status,
               "invoice_id": body.invoice_id, "tenant_id": tenant_id})

        log_audit(db, user_id=user_id, tenant_id=tenant_id,
                  action="REGISTER_PAYMENT", resource_type="PAYMENT",
                  resource_id=str(payment_id),
                  details={"invoice_id": body.invoice_id, "amount": body.amount, "method": method_upper})
        db.commit()
        return {"id": str(payment_id), "reference": reference,
                "status": new_status, "paid_amount": new_paid}
    except Exception as e:
        db.rollback()
        logger.error("Failed to create payment: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")


# ─── Payment webhooks (gateway callbacks) ─────────────────────────────────────

def _gateway_amount_matches(expected: float, received: float) -> bool:
    """Reject empty, partial or altered gateway confirmations."""
    if expected <= 0 or received <= 0:
        return False
    return abs(expected - received) <= 0.01


def _confirm_gateway_payment(db: Session, transaction_id: str, amount: float, tenant_id_hint: Optional[str] = None):
    """
    Shared logic: find the pending payment by reference and mark it COMPLETED,
    then update the invoice accordingly.
    """
    payment = db.execute(text("""
        SELECT p.id, p.invoice_id, p.tenant_id, p.amount
        FROM payments p
        WHERE p.reference = :ref AND p.status = 'PENDING'
        LIMIT 1
    """), {"ref": transaction_id}).mappings().first()

    if not payment:
        logger.warning("Webhook: no pending payment found for ref %s", transaction_id)
        return False

    tenant_id = str(payment["tenant_id"])
    invoice_id = str(payment["invoice_id"])
    pay_amount = float(payment["amount"])

    if tenant_id_hint and tenant_id != str(tenant_id_hint):
        logger.warning("Webhook tenant mismatch for ref %s", transaction_id)
        return False
    if not _gateway_amount_matches(pay_amount, float(amount or 0)):
        logger.warning(
            "Webhook amount mismatch for ref %s: expected=%s received=%s",
            transaction_id,
            pay_amount,
            amount,
        )
        return False

    inv = db.execute(text(
        "SELECT total_amount, paid_amount FROM invoices WHERE id = :id AND tenant_id = :tid"
    ), {"id": invoice_id, "tid": tenant_id}).mappings().first()
    if not inv:
        logger.error("Webhook: invoice %s not found", invoice_id)
        return False

    new_paid = float(inv["paid_amount"] or 0) + pay_amount
    new_status = "PAID" if new_paid >= float(inv["total_amount"]) else "PARTIAL"

    db.execute(text(
        "UPDATE payments SET status = 'COMPLETED', updated_at = NOW() WHERE id = :pid"
    ), {"pid": str(payment["id"])})
    db.execute(text(
        "UPDATE invoices SET paid_amount = :paid, status = :status, updated_at = NOW() "
        "WHERE id = :id AND tenant_id = :tid"
    ), {"paid": new_paid, "status": new_status, "id": invoice_id, "tid": tenant_id})
    return True


@router.post("/payments/webhook/cinetpay/")
async def cinetpay_webhook(request: Request, db: Session = Depends(get_db)):
    """
    CinetPay IPN (Instant Payment Notification) webhook.
    CinetPay POSTs this URL when a payment is completed.
    No auth required — we verify by re-checking with CinetPay's /check endpoint.
    """
    try:
        payload = await request.json()
    except Exception:
        # CinetPay sometimes sends form-encoded
        form = await request.form()
        payload = dict(form)

    logger.info("CinetPay webhook received: %s", payload)

    # Find the tenant from the invoice so we can load credentials
    transaction_id = payload.get("cpm_trans_id") or payload.get("transaction_id", "")
    if not transaction_id:
        return {"status": "ignored", "reason": "no transaction_id"}

    # Load payment record to find the tenant
    payment_row = db.execute(text(
        "SELECT p.tenant_id FROM payments p WHERE p.reference = :ref LIMIT 1"
    ), {"ref": transaction_id}).mappings().first()

    if payment_row:
        tenant_id = str(payment_row["tenant_id"])
        tenant_row = db.execute(text(
            "SELECT settings FROM tenants WHERE id = :tid"
        ), {"tid": tenant_id}).mappings().first()
        tenant_settings: dict = {}
        if tenant_row and tenant_row["settings"]:
            raw = tenant_row["settings"]
            tenant_settings = raw if isinstance(raw, dict) else json.loads(raw)

        from app.services.payment_gateways import CinetPayGateway
        api_key = tenant_settings.get("cinetPayApiKey", "")
        site_id = tenant_settings.get("cinetPaySiteId", "")
        if api_key and site_id:
            gw = CinetPayGateway(api_key=api_key, site_id=site_id)
            if not gw.verify_webhook(payload, {}):
                logger.warning("CinetPay webhook verification failed for %s", transaction_id)
                return {"status": "rejected", "reason": "verification failed"}
            pay_status = gw.parse_webhook_status(payload)
            if pay_status == "COMPLETED":
                amount = gw.extract_amount(payload) or 0
                confirmed = _confirm_gateway_payment(db, transaction_id, amount)
                if confirmed:
                    db.commit()
                    logger.info("CinetPay payment confirmed: %s", transaction_id)
                    return {"status": "ok"}

    return {"status": "processed"}


@router.post("/payments/webhook/paytech/")
async def paytech_webhook(request: Request, db: Session = Depends(get_db)):
    """PayTech IPN webhook."""
    try:
        payload = await request.json()
    except Exception:
        form = await request.form()
        payload = dict(form)

    logger.info("PayTech webhook received: %s", payload)
    transaction_id = payload.get("ref_command", "")
    if not transaction_id:
        return {"status": "ignored"}

    payment_row = db.execute(text(
        "SELECT p.tenant_id FROM payments p WHERE p.reference = :ref LIMIT 1"
    ), {"ref": transaction_id}).mappings().first()

    if payment_row:
        tenant_id = str(payment_row["tenant_id"])
        tenant_row = db.execute(text(
            "SELECT settings FROM tenants WHERE id = :tid"
        ), {"tid": tenant_id}).mappings().first()
        tenant_settings: dict = {}
        if tenant_row and tenant_row["settings"]:
            raw = tenant_row["settings"]
            tenant_settings = raw if isinstance(raw, dict) else json.loads(raw)

        from app.services.payment_gateways import PayTechGateway
        api_key = tenant_settings.get("paytechApiKey", "")
        secret_key = tenant_settings.get("paytechSecretKey", "")
        if api_key and secret_key:
            gw = PayTechGateway(api_key=api_key, secret_key=secret_key)
            if gw.verify_webhook(payload, dict(request.headers)):
                pay_status = gw.parse_webhook_status(payload)
                if pay_status == "COMPLETED":
                    amount = gw.extract_amount(payload) or 0
                    confirmed = _confirm_gateway_payment(db, transaction_id, amount)
                    if confirmed:
                        db.commit()
                        logger.info("PayTech payment confirmed: %s", transaction_id)
                        return {"status": "ok"}

    return {"status": "processed"}


@router.get("/payments/return/")
def payment_return(
    invoice_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Return URL after gateway redirect.
    The parent is sent back here after paying on the gateway page.
    We redirect them to the invoices page — the webhook handles status update.
    """
    # In production this would redirect to the frontend
    return {
        "message": "Paiement en cours de traitement. Vérifiez votre espace dans quelques instants.",
        "invoice_id": invoice_id,
    }


# --- POST /parents/report-cards/generate/ --- Generate report card (stub) ---

class ReportCardGenerateRequest(BaseModel):
    student_id: str
    term_id: Optional[str] = None


@router.post("/report-cards/generate/")
def generate_report_card(
    body: ReportCardGenerateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate a report card for a student (parent portal stub).
    Returns aggregated grades and attendance data for the requested term."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Verify the student belongs to this parent
    link = db.execute(text(
        "SELECT 1 FROM parent_students "
        "WHERE parent_id = :uid AND student_id = :sid AND tenant_id = :tid"
    ), {"uid": user_id, "sid": body.student_id, "tid": tenant_id}).first()
    if not link:
        raise HTTPException(status_code=403, detail="Student not linked to your account")

    # Fetch student info
    student = db.execute(text(
        "SELECT s.id, s.first_name, s.last_name, s.registration_number, c.name as classroom_name "
        "FROM students s LEFT JOIN classrooms c ON c.id = s.classroom_id "
        "WHERE s.id = :sid AND s.tenant_id = :tid"
    ), {"sid": body.student_id, "tid": tenant_id}).mappings().first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Fetch grades with assessment/subject info
    params: dict = {"student_id": body.student_id, "tenant_id": tenant_id}
    term_filter = ""
    if body.term_id:
        term_filter = " AND a.term_id = :term_id"
        params["term_id"] = body.term_id

    grades = db.execute(text(f"""
        SELECT g.score, g.created_at,
               a.name as assessment_name, a.max_score, a.assessment_type,
               s.name as subject_name
        FROM grades g
        JOIN assessments a ON g.assessment_id = a.id
        LEFT JOIN subjects s ON a.subject_id = s.id
        WHERE g.student_id = :student_id AND g.tenant_id = :tenant_id
        AND g.score IS NOT NULL {term_filter}
        ORDER BY s.name, a.name
    """), params).fetchall()

    # Fetch attendance summary
    att_params: dict = {"student_id": body.student_id, "tenant_id": tenant_id}
    att_term_filter = ""
    if body.term_id:
        att_term_filter = " AND a.term_id = :term_id"
        att_params["term_id"] = body.term_id

    attendance_summary = db.execute(text(f"""
        SELECT a.status, COUNT(*) as count
        FROM attendance a
        WHERE a.student_id = :student_id AND a.tenant_id = :tenant_id
        {att_term_filter}
        GROUP BY a.status
    """), att_params).fetchall()

    # Build report card
    subjects_data = {}
    for g in grades:
        subj = g.subject_name or "Unknown"
        if subj not in subjects_data:
            subjects_data[subj] = {"grades": [], "average": 0.0, "count": 0}
        score = float(g.score or 0)
        max_score = float(g.max_score or 20)
        subjects_data[subj]["grades"].append({
            "assessment": g.assessment_name,
            "score": score,
            "max_score": max_score,
            "percentage": round((score / max_score * 100), 1) if max_score > 0 else 0,
        })
        subjects_data[subj]["count"] += 1

    # Compute averages
    for subj in subjects_data.values():
        if subj["grades"]:
            subj["average"] = round(
                sum(g["percentage"] for g in subj["grades"]) / len(subj["grades"]), 1
            )

    return {
        "student": {
            "id": str(student["id"]),
            "first_name": student["first_name"],
            "last_name": student["last_name"],
            "registration_number": student["registration_number"],
            "classroom": student["classroom_name"],
        },
        "term_id": body.term_id,
        "generated_at": datetime.now().isoformat(),
        "subjects": subjects_data,
        "attendance_summary": {row.status: row.count for row in attendance_summary},
    }


# --- POST /parents/invoices/pdf/ --- Generate invoice PDF (stub) ---

@router.post("/invoices/pdf/")
def generate_invoice_pdf(
    invoice_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate a PDF for an invoice (parent portal stub).
    Returns invoice data ready for client-side PDF generation."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Verify invoice belongs to parent's child
    children = db.execute(text(
        "SELECT student_id FROM parent_students WHERE parent_id = :uid AND tenant_id = :tid"
    ), {"uid": user_id, "tid": tenant_id}).fetchall()
    child_ids = [str(c.student_id) for c in children]

    inv = db.execute(text("""
        SELECT i.*, s.first_name, s.last_name, s.registration_number, s.phone
        FROM invoices i
        LEFT JOIN students s ON s.id = i.student_id
        WHERE i.id = :invoice_id AND i.tenant_id = :tenant_id
    """), {"invoice_id": invoice_id, "tenant_id": tenant_id}).mappings().first()

    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if str(inv["student_id"]) not in child_ids:
        raise HTTPException(status_code=403, detail="Invoice not linked to your children")

    # Get payment schedules for this invoice
    schedules = db.execute(text("""
        SELECT installment_number, amount, due_date, paid_date, status
        FROM payment_schedules
        WHERE invoice_id = :invoice_id AND tenant_id = :tenant_id
        ORDER BY installment_number
    """), {"invoice_id": invoice_id, "tenant_id": tenant_id}).fetchall()

    # Get payments for this invoice
    payments = db.execute(text("""
        SELECT id, amount, payment_date, payment_method, reference
        FROM payments
        WHERE invoice_id = :invoice_id AND tenant_id = :tenant_id AND status = 'COMPLETED'
        ORDER BY payment_date DESC
    """), {"invoice_id": invoice_id, "tenant_id": tenant_id}).fetchall()

    def _clean(row):
        d = dict(row._mapping) if hasattr(row, '_mapping') else dict(row)
        for k, v in d.items():
            if isinstance(v, datetime):
                d[k] = v.isoformat()
        return d

    return {
        "invoice": _clean(inv),
        "schedules": [_clean(s) for s in schedules],
        "payments": [_clean(p) for p in payments],
        "generated_at": datetime.now().isoformat(),
        "message": "Invoice data ready for PDF generation",
    }


# --- GET /parents/appointments/ --- List appointments ---

@router.get("/appointments/")
def list_parent_appointments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List parent-teacher appointments."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "pages": 1}

    offset = (page - 1) * page_size
    params = {"tenant_id": tenant_id, "parent_id": user_id, "limit": page_size, "offset": offset}

    try:
        rows = db.execute(text("""
            SELECT a.*,
                   t.first_name as teacher_first_name, t.last_name as teacher_last_name,
                   s.first_name as student_first_name, s.last_name as student_last_name
            FROM appointments a
            LEFT JOIN users t ON a.teacher_id = t.id
            LEFT JOIN students s ON a.student_id = s.id
            WHERE a.tenant_id = :tenant_id AND a.parent_id = :parent_id
            ORDER BY a.appointment_date DESC, a.appointment_time DESC
            LIMIT :limit OFFSET :offset
        """), params).fetchall()

        total = db.execute(text("""
            SELECT COUNT(*) FROM appointments
            WHERE tenant_id = :tenant_id AND parent_id = :parent_id
        """), {"tenant_id": tenant_id, "parent_id": user_id}).scalar() or 0

        items = []
        for r in rows:
            d = dict(r._mapping)
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
            items.append(d)

        return {
            "items": items,
            "total": int(total or 0),
            "page": page,
            "page_size": page_size,
            "pages": math.ceil(float(total or 0) / page_size) if total and total > 0 else 1,
        }
    except Exception:
        # Table may not exist yet — return empty
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "pages": 1}


# --- POST /parents/appointments/ --- Create appointment ---

class AppointmentCreate(BaseModel):
    teacher_id: Optional[str] = None
    student_id: Optional[str] = None
    appointment_date: str
    appointment_time: Optional[str] = None
    slot_id: Optional[str] = None
    notes: Optional[str] = None
    status: str = "REQUESTED"


@router.post("/appointments/", status_code=status.HTTP_201_CREATED)
def create_parent_appointment(
    body: AppointmentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a parent-teacher appointment request."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # If student_id provided, verify it's linked to this parent
    if body.student_id:
        link = db.execute(text(
            "SELECT 1 FROM parent_students "
            "WHERE parent_id = :uid AND student_id = :sid AND tenant_id = :tid"
        ), {"uid": user_id, "sid": body.student_id, "tid": tenant_id}).first()
        if not link:
            raise HTTPException(status_code=403, detail="Student not linked to your account")

    try:
        import uuid
        appointment_id = str(uuid.uuid4())
        db.execute(text("""
            INSERT INTO appointments (
                id, tenant_id, parent_id, teacher_id, student_id,
                appointment_date, appointment_time, slot_id, notes, status,
                created_at, updated_at
            ) VALUES (
                :id, :tenant_id, :parent_id, :teacher_id, :student_id,
                :appointment_date::date, :appointment_time::time, :slot_id, :notes, :status,
                NOW(), NOW()
            ) RETURNING id
        """), {
            "id": appointment_id,
            "tenant_id": tenant_id,
            "parent_id": user_id,
            "teacher_id": body.teacher_id,
            "student_id": body.student_id,
            "appointment_date": body.appointment_date,
            "appointment_time": body.appointment_time,
            "slot_id": body.slot_id,
            "notes": body.notes,
            "status": body.status,
        })

        log_audit(db, user_id=user_id, tenant_id=tenant_id,
                  action="CREATE_APPOINTMENT", resource_type="APPOINTMENT",
                  resource_id=appointment_id,
                  details={"teacher_id": body.teacher_id, "student_id": body.student_id,
                           "date": body.appointment_date})
        db.commit()
        return {"id": appointment_id, "status": body.status, "message": "Appointment request created"}
    except Exception as e:
        db.rollback()
        logger.error("Failed to create appointment: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


# --- GET /parents/appointment-slots/ --- List available appointment slots ---

@router.get("/appointment-slots/")
def list_parent_appointment_slots(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    teacher_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """List available appointment slots for booking."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []

    try:
        params: dict = {"tenant_id": tenant_id}
        extra = ""
        if teacher_id:
            extra += " AND teacher_id = :teacher_id"
            params["teacher_id"] = teacher_id
        if date_from:
            extra += " AND date >= :date_from::date"
            params["date_from"] = date_from
        if date_to:
            extra += " AND date <= :date_to::date"
            params["date_to"] = date_to

        rows = db.execute(text(f"""
            SELECT * FROM appointment_slots
            WHERE tenant_id = :tenant_id AND is_active = true {extra}
            ORDER BY date, start_time
        """), params).fetchall()

        items = []
        for r in rows:
            d = dict(r._mapping)
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
            items.append(d)
        return items
    except Exception:
        return []


# --- POST /parents/appointment-slots/ --- Create appointment slot ---

class AppointmentSlotCreate(BaseModel):
    teacher_id: Optional[str] = None
    date: str
    start_time: str
    end_time: str
    max_appointments: int = 1
    location: Optional[str] = None


@router.post("/appointment-slots/", status_code=status.HTTP_201_CREATED)
def create_parent_appointment_slot(
    body: AppointmentSlotCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create an appointment slot (parent portal).
    Typically used by admin/teachers to make slots available for booking."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        import uuid
        slot_id = str(uuid.uuid4())
        db.execute(text("""
            INSERT INTO appointment_slots (
                id, tenant_id, teacher_id, date, start_time, end_time,
                max_appointments, location, is_active,
                created_at, updated_at
            ) VALUES (
                :id, :tenant_id, :teacher_id, :date::date,
                :start_time::time, :end_time::time,
                :max_appointments, :location, true, NOW(), NOW()
            ) RETURNING id
        """), {
            "id": slot_id,
            "tenant_id": tenant_id,
            "teacher_id": body.teacher_id,
            "date": body.date,
            "start_time": body.start_time,
            "end_time": body.end_time,
            "max_appointments": body.max_appointments,
            "location": body.location,
        })

        log_audit(db, user_id=user_id, tenant_id=tenant_id,
                  action="CREATE_APPOINTMENT_SLOT", resource_type="APPOINTMENT_SLOT",
                  resource_id=slot_id,
                  details={"date": body.date, "start": body.start_time, "end": body.end_time})
        db.commit()
        return {"id": slot_id, "message": "Appointment slot created"}
    except Exception as e:
        db.rollback()
        logger.error("Failed to create appointment slot: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")
