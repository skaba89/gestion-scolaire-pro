"""
Alias / thin-wrapper routers for frontend routes that don't match
the existing backend prefix structure.

Each router below maps a frontend-called URL to existing backend logic
(CRUD functions, SQLAlchemy queries, etc.) so we avoid code duplication
while fixing 404s.
"""
import logging
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.security import get_current_user, require_permission


# ─── 3. Enrollments at root (/enrollments/) ───────────────────────────────────

enrollments_alias_router = APIRouter()


@enrollments_alias_router.get("/", response_model=List[dict])
def list_enrollments_alias(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("enrollments:read")),
):
    """GET /enrollments/ — mirrors GET /infrastructure/enrollments/"""
    from app.crud import academic as crud
    return crud.get_enrollments(db, tenant_id=current_user.get("tenant_id"))


class EnrollmentCreateAlias(BaseModel):
    student_id: UUID
    class_id: UUID
    level_id: Optional[UUID] = None
    academic_year_id: Optional[UUID] = None
    status: str = "active"
    enrolled_date: Optional[str] = None


@enrollments_alias_router.post("/", status_code=status.HTTP_201_CREATED)
def create_enrollment_alias(
    obj_in: EnrollmentCreateAlias,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("enrollments:write")),
):
    """POST /enrollments/ — mirrors POST /infrastructure/enrollments/"""
    from app.crud import academic as crud
    from app.schemas.academic import EnrollmentCreate
    return crud.create_enrollment(
        db,
        obj_in=EnrollmentCreate(**obj_in.model_dump()),
        tenant_id=current_user.get("tenant_id"),
    )


@enrollments_alias_router.get("/counts/")
def enrollment_counts_alias(
    class_ids: List[UUID] = Query(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GET /enrollments/counts/ — mirrors GET /infrastructure/enrollments/counts/"""
    tenant_id = current_user.get("tenant_id")
    if not class_ids:
        return {}
    rows = db.execute(text("""
        SELECT class_id, COUNT(*) as count
        FROM enrollments
        WHERE tenant_id = :tenant_id AND class_id = ANY(:class_ids) AND status = 'active'
        GROUP BY class_id
    """), {"tenant_id": tenant_id, "class_ids": class_ids}).fetchall()
    return {str(r.class_id): r.count for r in rows}


# ─── 4. Invoices at root (/invoices/) ─────────────────────────────────────────

invoices_alias_router = APIRouter()


@invoices_alias_router.get("/")
def list_invoices_alias(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    student_id: Optional[str] = None,
    status: Optional[str] = Query(None),
):
    """GET /invoices/ — mirrors GET /payments/invoices/"""
    import math
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    offset = (page - 1) * page_size
    params: dict = {"tenant_id": tenant_id, "limit": page_size, "offset": offset}

    filters = ""
    if student_id:
        filters += " AND i.student_id = :student_id"
        params["student_id"] = student_id
    if status:
        filters += " AND i.status = :inv_status"
        params["inv_status"] = status

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
            "status": r.status,
            "due_date": r.due_date.isoformat() if r.due_date else None,
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


class InvoiceCreateAlias(BaseModel):
    student_id: str
    invoice_number: Optional[str] = None
    total_amount: float
    items: Optional[Any] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    has_payment_plan: bool = False
    installments_count: int = 1


@invoices_alias_router.post("/", status_code=status.HTTP_201_CREATED)
def create_invoice_alias(
    body: InvoiceCreateAlias,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """POST /invoices/ — mirrors POST /payments/invoices/"""
    import json, secrets
    from app.utils.audit import log_audit
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    year = datetime.now().year
    invoice_number = body.invoice_number or f"INV-{year}-{secrets.token_hex(4).upper()}"

    invoice_id = db.execute(text("""
        INSERT INTO invoices (tenant_id, student_id, invoice_number, total_amount, paid_amount,
                              items, due_date, notes, has_payment_plan, installments_count,
                              status, issue_date, created_at, updated_at)
        VALUES (:tenant_id, :student_id, :invoice_number, :total_amount, 0,
                :items, :due_date, :notes, :has_payment_plan, :installments_count,
                'PENDING', NOW(), NOW(), NOW())
        RETURNING id
    """), {
        "tenant_id": tenant_id, "student_id": body.student_id,
        "invoice_number": invoice_number, "total_amount": body.total_amount,
        "items": json.dumps(body.items) if body.items else None,
        "due_date": body.due_date if body.due_date else None,
        "notes": body.notes,
        "has_payment_plan": body.has_payment_plan,
        "installments_count": body.installments_count
    }).scalar()

    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="CREATE", resource_type="INVOICE",
              resource_id=str(invoice_id),
              details={"invoice_number": invoice_number, "total_amount": body.total_amount})
    db.commit()
    return {"invoice_id": str(invoice_id), "invoice_number": invoice_number}


@invoices_alias_router.put("/{invoice_id}/")
def update_invoice_alias(
    invoice_id: str,
    body: InvoiceCreateAlias,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """PUT /invoices/{id}/ — mirrors PUT /payments/invoices/{id}/"""
    import json
    from app.utils.audit import log_audit
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    result = db.execute(text("""
        UPDATE invoices SET
            student_id = :student_id, invoice_number = :invoice_number,
            total_amount = :total_amount, items = :items, due_date = :due_date,
            notes = :notes, has_payment_plan = :has_payment_plan,
            installments_count = :installments_count, updated_at = NOW()
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
        raise HTTPException(status_code=404, detail="Invoice not found")
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="UPDATE", resource_type="INVOICE", resource_id=invoice_id)
    db.commit()
    return {"message": "Invoice updated"}


@invoices_alias_router.delete("/{invoice_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice_alias(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("payments:write")),
):
    """DELETE /invoices/{id}/ — mirrors DELETE /payments/invoices/{id}/"""
    from app.utils.audit import log_audit
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    result = db.execute(text("""
        DELETE FROM invoices WHERE id = :invoice_id AND tenant_id = :tenant_id
    """), {"invoice_id": invoice_id, "tenant_id": tenant_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="DELETE", resource_type="INVOICE", resource_id=invoice_id)
    db.commit()
    return None


# ─── 5. Class Sessions (/class-sessions/) ─────────────────────────────────────

class_sessions_router = APIRouter()


@class_sessions_router.get("/")
def list_class_sessions(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GET /class-sessions/ — list class sessions."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    try:
        rows = db.execute(text("""
            SELECT cs.*,
                   sub.name as subject_name,
                   r.name as room_name,
                   u.first_name as teacher_first_name,
                   u.last_name as teacher_last_name,
                   c.name as class_name
            FROM class_sessions cs
            LEFT JOIN subjects sub ON sub.id = cs.subject_id
            LEFT JOIN rooms r ON r.id = cs.room_id
            LEFT JOIN users u ON u.id = cs.teacher_id
            LEFT JOIN classrooms c ON c.id = cs.class_id
            WHERE cs.tenant_id = :tenant_id
            ORDER BY cs.start_time DESC
        """), {"tenant_id": tenant_id}).fetchall()
        return [
            {
                **dict(r._mapping),
                "subject": {"name": r.subject_name} if r.subject_name else None,
                "room": {"name": r.room_name} if r.room_name else None,
                "teacher": {"first_name": r.teacher_first_name, "last_name": r.teacher_last_name} if r.teacher_first_name else None,
                "classroom": {"name": r.class_name} if r.class_name else None,
            }
            for r in rows
        ]
    except Exception:
        # class_sessions table may not exist yet — return empty
        return []


@class_sessions_router.get("/active/")
def list_active_class_sessions(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GET /class-sessions/active/ — list currently active sessions."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    try:
        rows = db.execute(text("""
            SELECT cs.*,
                   sub.name as subject_name,
                   r.name as room_name,
                   u.first_name as teacher_first_name,
                   u.last_name as teacher_last_name,
                   c.name as class_name
            FROM class_sessions cs
            LEFT JOIN subjects sub ON sub.id = cs.subject_id
            LEFT JOIN rooms r ON r.id = cs.room_id
            LEFT JOIN users u ON u.id = cs.teacher_id
            LEFT JOIN classrooms c ON c.id = cs.class_id
            WHERE cs.tenant_id = :tenant_id
              AND cs.status = 'ACTIVE'
              AND cs.end_time >= NOW()
            ORDER BY cs.start_time ASC
        """), {"tenant_id": tenant_id}).fetchall()
        return [
            {
                **dict(r._mapping),
                "subject": {"name": r.subject_name} if r.subject_name else None,
                "room": {"name": r.room_name} if r.room_name else None,
                "teacher": {"first_name": r.teacher_first_name, "last_name": r.teacher_last_name} if r.teacher_first_name else None,
                "classroom": {"name": r.class_name} if r.class_name else None,
            }
            for r in rows
        ]
    except Exception:
        return []


# ─── 6. School Events standalone (/school-events/) ────────────────────────────

school_events_router = APIRouter()


@school_events_router.get("/")
def list_school_events(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    start_after: Optional[datetime] = Query(None),
):
    """GET /school-events/ — mirrors GET /school-life/events/"""
    from app.crud import school_life as crud_sl
    try:
        return crud_sl.get_events(db, tenant_id=current_user.get("tenant_id"), start_after=start_after)
    except Exception:
        db.rollback()
        return []


# ─── 7. Student-Parents link (/student-parents/) ──────────────────────────────

student_parents_router = APIRouter()


class StudentParentLinkRequest(BaseModel):
    parent_id: UUID
    student_id: UUID
    is_primary: bool = False
    relation_type: Optional[str] = None


@student_parents_router.post("/", status_code=status.HTTP_201_CREATED)
def create_student_parent_link(
    link: StudentParentLinkRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """POST /student-parents/ — mirrors POST /parents/link/"""
    from app.schemas.parents import ParentStudentCreate
    from app.crud import parents as crud_parents
    from app.utils.audit import log_audit
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


@student_parents_router.delete("/")
def delete_student_parent_link(
    parent_id: Optional[UUID] = Query(None),
    student_id: Optional[UUID] = Query(None),
    link_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """DELETE /student-parents/ — mirrors DELETE /parents/link/{id}/"""
    from app.utils.audit import log_audit
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        if link_id:
            result = db.execute(text("""
                DELETE FROM parent_students WHERE id = :lid AND tenant_id = :tid
            """), {"lid": str(link_id), "tid": tenant_id})
        elif parent_id and student_id:
            result = db.execute(text("""
                DELETE FROM parent_students
                WHERE parent_id = :pid AND student_id = :sid AND tenant_id = :tid
            """), {"pid": str(parent_id), "sid": str(student_id), "tid": tenant_id})
        else:
            raise HTTPException(status_code=400, detail="Provide link_id or both parent_id and student_id")

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Link not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_PARENT_STUDENT_LINK", resource_type="PARENT_STUDENT",
                  resource_id=str(link_id) if link_id else f"{parent_id}-{student_id}")
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to delete parent-student link: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to delete resource. Please try again.")


# ─── 8. Student Subjects (/student-subjects/) ─────────────────────────────────

student_subjects_router = APIRouter()


class StudentSubjectAssign(BaseModel):
    student_id: UUID
    subject_ids: List[UUID]
    class_id: Optional[UUID] = None


@student_subjects_router.post("/", status_code=status.HTTP_201_CREATED)
def assign_subjects_to_student(
    body: StudentSubjectAssign,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """POST /student-subjects/ — assign subjects to a student."""
    from app.utils.audit import log_audit
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        assigned = []
        for subject_id in body.subject_ids:
            # Check if already assigned to avoid duplicates
            existing = db.execute(text("""
                SELECT 1 FROM student_subjects
                WHERE student_id = :sid AND subject_id = :subid AND tenant_id = :tid
            """), {"sid": str(body.student_id), "subid": str(subject_id), "tid": tenant_id}).first()
            if not existing:
                db.execute(text("""
                    INSERT INTO student_subjects (student_id, subject_id, tenant_id, created_at)
                    VALUES (:sid, :subid, :tid, NOW())
                    ON CONFLICT DO NOTHING
                """), {"sid": str(body.student_id), "subid": str(subject_id), "tid": tenant_id})
                assigned.append(str(subject_id))
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="ASSIGN_SUBJECTS_TO_STUDENT", resource_type="STUDENT_SUBJECT",
                  resource_id=str(body.student_id),
                  details={"subject_ids": [str(s) for s in body.subject_ids]})
        db.commit()
        return {"assigned": assigned, "total": len(assigned)}
    except Exception as e:
        db.rollback()
        logger.error("Failed to assign subjects to student: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


# ─── 9. Push Subscriptions alias (/push-subscriptions/) ───────────────────────

push_subscriptions_router = APIRouter()


class PushSubscriptionUpsert(BaseModel):
    endpoint: str
    keys_auth: Optional[str] = None
    keys_p256dh: Optional[str] = None
    keys: Optional[dict] = None


@push_subscriptions_router.post("/upsert/", status_code=status.HTTP_200_OK)
def upsert_push_subscription(
    subscription_in: PushSubscriptionUpsert,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """POST /push-subscriptions/upsert/ — mirrors POST /notifications/subscriptions/"""
    from app.models import PushSubscription
    user_id = current_user.get("id")
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="User must belong to a tenant")

    existing = db.query(PushSubscription).filter(
        PushSubscription.user_id == user_id,
        PushSubscription.endpoint == subscription_in.endpoint
    ).first()

    if existing:
        # Update
        update_data = subscription_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(existing, field):
                setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return existing

    # Create new
    new_sub = PushSubscription(
        endpoint=subscription_in.endpoint,
        user_id=user_id,
        tenant_id=tenant_id,
    )
    if subscription_in.keys:
        new_sub.keys = subscription_in.keys
    db.add(new_sub)
    db.commit()
    db.refresh(new_sub)
    return new_sub


@push_subscriptions_router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
def delete_push_subscription(
    endpoint: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """DELETE /push-subscriptions/ — mirrors DELETE /notifications/subscriptions/"""
    from app.models import PushSubscription
    user_id = current_user.get("id")
    query = db.query(PushSubscription).filter(PushSubscription.user_id == user_id)
    if endpoint:
        query = query.filter(PushSubscription.endpoint == endpoint)
    query.delete()
    db.commit()
    return None


# ─── 10. User Presence (/presence/) ───────────────────────────────────────────

presence_router = APIRouter()


class PresenceUpdate(BaseModel):
    user_id: str
    status: str  # "online", "offline", "away"
    metadata: Optional[Dict[str, Any]] = None


@presence_router.put("/")
def update_presence(
    body: PresenceUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """PUT /presence/ — update user presence status."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")

    # Only allow updating own presence (or admin)
    if body.user_id != user_id:
        roles = current_user.get("roles", [])
        if "TENANT_ADMIN" not in roles and "SUPER_ADMIN" not in roles:
            raise HTTPException(status_code=403, detail="Can only update your own presence")

    try:
        db.execute(text("""
            INSERT INTO user_presence (user_id, tenant_id, status, metadata, updated_at)
            VALUES (:user_id, :tenant_id, :status, :metadata::jsonb, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                status = :status,
                metadata = :metadata::jsonb,
                updated_at = NOW()
        """), {
            "user_id": body.user_id,
            "tenant_id": tenant_id,
            "status": body.status,
            "metadata": __import__("json").dumps(body.metadata) if body.metadata else None,
        })
        db.commit()
        return {"user_id": body.user_id, "status": body.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        db.rollback()
        logger.error("Failed to update presence: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


# ─── 13. Rooms at root (/rooms/) ─────────────────────────────────────────────

rooms_alias_router = APIRouter()


class RoomCreateAlias(BaseModel):
    name: str
    capacity: Optional[int] = None
    campus_id: Optional[UUID] = None


@rooms_alias_router.get("/", response_model=List[dict])
def list_rooms_alias(
    tenant_id: Optional[str] = Query(None),
    ordering: Optional[str] = Query(None, description="Field to order by (e.g. name)"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GET /rooms/ — mirrors GET /infrastructure/rooms/"""
    from app.crud import academic as crud
    tid = tenant_id or current_user.get("tenant_id")
    if not tid:
        return []
    results = crud.get_rooms(db, tenant_id=tid)
    rooms_list = [{k: str(v) if isinstance(v, UUID) else v for k, v in r.__dict__.items() if not k.startswith('_')} for r in results]
    if ordering:
        # SECURITY: Whitelist allowed ordering fields to prevent injection
        ALLOWED_ROOM_ORDER_FIELDS = {"name", "capacity", "created_at", "type", "campus_id"}
        reverse = ordering.startswith('-')
        field = ordering.lstrip('-')
        if field not in ALLOWED_ROOM_ORDER_FIELDS:
            field = "name"  # Default to safe ordering
        rooms_list.sort(key=lambda x: x.get(field, ''), reverse=reverse)
    return rooms_list


@rooms_alias_router.post("/", status_code=status.HTTP_201_CREATED)
def create_room_alias(
    obj_in: RoomCreateAlias,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("rooms:write")),
):
    """POST /rooms/ — mirrors POST /infrastructure/rooms/"""
    from app.crud import academic as crud
    from app.schemas.academic import RoomCreate
    return crud.create_room(db, obj_in=RoomCreate(**obj_in.model_dump()), tenant_id=current_user.get("tenant_id"))


@rooms_alias_router.get("/count/")
def count_rooms_alias(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GET /rooms/count/ — mirrors GET /infrastructure/rooms/count/"""
    from sqlalchemy import text
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return 0
    return db.execute(text("SELECT COUNT(*) FROM rooms WHERE tenant_id = :tid"), {"tid": tenant_id}).scalar() or 0


# ─── 14. Classrooms at root (/classrooms/) ─────────────────────────────────────

classrooms_alias_router = APIRouter()


class ClassroomCreateAlias(BaseModel):
    name: str
    capacity: Optional[int] = None
    level_id: Optional[UUID] = None
    campus_id: Optional[UUID] = None
    department_ids: Optional[List[UUID]] = None


@classrooms_alias_router.get("/", response_model=List[dict])
def list_classrooms_alias(
    level_id: Optional[str] = Query(None),
    department_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GET /classrooms/ — mirrors GET /infrastructure/classrooms/ with optional filters."""
    from app.crud import academic as crud
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    results = crud.get_classrooms(db, tenant_id=tenant_id)
    classrooms = [{k: str(v) if isinstance(v, UUID) else v for k, v in r.__dict__.items() if not k.startswith('_')} for r in results]

    # Filter by level_id if provided
    if level_id:
        classrooms = [c for c in classrooms if str(c.get('level_id')) == str(level_id)]

    # Filter by department_id if provided
    if department_id:
        # Classrooms linked to departments via classroom_departments table
        dept_class_ids = db.execute(text("""
            SELECT class_id FROM classroom_departments WHERE department_id = :dept_id AND tenant_id = :tid
        """), {"dept_id": department_id, "tid": tenant_id}).fetchall()
        allowed_ids = {str(r[0]) for r in dept_class_ids}
        classrooms = [c for c in classrooms if str(c.get('id')) in allowed_ids]

    return classrooms


@classrooms_alias_router.post("/", status_code=status.HTTP_201_CREATED)
def create_classroom_alias(
    obj_in: ClassroomCreateAlias,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("classrooms:write")),
):
    """POST /classrooms/ — mirrors POST /infrastructure/classrooms/"""
    from app.crud import academic as crud
    from app.schemas.academic import ClassroomCreate
    data = obj_in.model_dump()
    return crud.create_classroom(db, obj_in=ClassroomCreate(**data), tenant_id=current_user.get("tenant_id"))


# ─── 15. Schedule Slots at root (/schedule-slots/) ─────────────────────────────

schedule_slots_alias_router = APIRouter()


@schedule_slots_alias_router.get("/", response_model=List[dict])
def list_schedule_slots_alias(
    class_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GET /schedule-slots/ — mirrors GET /schedule/"""
    from sqlalchemy import text as sql_text
    tid = tenant_id or current_user.get("tenant_id")
    if not tid:
        return []

    where_clauses = ["s.tenant_id = :tenant_id"]
    params = {"tenant_id": tid}

    if class_id and class_id != "none":
        where_clauses.append("s.class_id = :class_id")
        params["class_id"] = class_id

    where_sql = " AND ".join(where_clauses)
    sql = sql_text(f"""
        SELECT
            s.*,
            sub.name as subject_name,
            r.name as room_name,
            u.first_name as teacher_first_name,
            u.last_name as teacher_last_name
        FROM schedule s
        LEFT JOIN subjects sub ON sub.id = s.subject_id
        LEFT JOIN rooms r ON r.id = s.room_id
        LEFT JOIN users u ON u.id = s.teacher_id
        WHERE {where_sql}
        ORDER BY s.day_of_week, s.start_time
    """)

    try:
        rows = db.execute(sql, params).fetchall()
        return [
            {
                **dict(r._mapping),
                "subject": {"name": r.subject_name} if r.subject_name else None,
                "room": {"name": r.room_name} if r.room_name else None,
                "teacher": {"first_name": r.teacher_first_name, "last_name": r.teacher_last_name} if r.teacher_first_name else None,
                "start_time": r.start_time.strftime("%H:%M") if r.start_time else None,
                "end_time": r.end_time.strftime("%H:%M") if r.end_time else None,
            }
            for r in rows
        ]
    except Exception:
        return []


# ─── 12. Parents list (/parents/ GET root) ───────────────────────────────────
# NOTE: This is added directly in parents.py — see the modification there.
# The alias below is kept in case parents.py already has a GET / that would clash.

parents_list_alias_router = APIRouter()


@parents_list_alias_router.get("/")
def list_all_parents(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    search: Optional[str] = Query(None),
):
    """GET /parents/ — list all parents for the tenant."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    params: dict = {"tenant_id": tenant_id}
    extra = ""
    if search:
        extra = " AND (p.first_name ILIKE :search OR p.last_name ILIKE :search OR p.email ILIKE :search)"
        params["search"] = f"%{search}%"
    rows = db.execute(text(f"""
        SELECT p.*,
               COALESCE(
                   ARRAY_AGG(DISTINCT ps.student_id) FILTER (WHERE ps.student_id IS NOT NULL),
                   ARRAY[]::uuid[]
               ) AS student_ids
        FROM parents p
        LEFT JOIN parent_students ps ON ps.parent_id = p.id AND ps.tenant_id = p.tenant_id
        WHERE p.tenant_id = :tenant_id {extra}
        GROUP BY p.id
        ORDER BY p.last_name, p.first_name
    """), params).mappings().all()
    return rows


# =============================================================================
# Achievement Definitions  /achievement-definitions/
# =============================================================================

achievement_router = APIRouter()

class AchievementDefCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    category: str = "general"
    points_value: int = 10
    trigger_type: str = "manual"
    trigger_threshold: int = 1
    is_active: bool = True


@achievement_router.get("/")
def list_achievement_definitions(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = current_user.get("tenant_id")
    rows = db.execute(text("""
        SELECT id, tenant_id, name, description, icon, category, points_value,
               trigger_type, trigger_threshold, is_active, created_at
        FROM achievement_definitions
        WHERE tenant_id = :tid ORDER BY created_at DESC
    """), {"tid": tenant_id}).mappings().all()
    return [dict(r) for r in rows]


@achievement_router.post("/", status_code=201)
def create_achievement_definition(
    body: AchievementDefCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = current_user.get("tenant_id")
    row = db.execute(text("""
        INSERT INTO achievement_definitions
            (tenant_id, name, description, icon, category, points_value, trigger_type, trigger_threshold, is_active)
        VALUES (:tid, :name, :desc, :icon, :cat, :pts, :ttype, :thresh, :active)
        RETURNING id, name, description, icon, category, points_value, trigger_type, trigger_threshold, is_active, created_at
    """), {
        "tid": tenant_id, "name": body.name, "desc": body.description,
        "icon": body.icon, "cat": body.category, "pts": body.points_value,
        "ttype": body.trigger_type, "thresh": body.trigger_threshold,
        "active": body.is_active,
    }).mappings().first()
    db.commit()
    return dict(row)


@achievement_router.patch("/{achievement_id}/")
def update_achievement_definition(
    achievement_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = current_user.get("tenant_id")
    allowed = {"name", "description", "icon", "category", "points_value", "trigger_type", "trigger_threshold", "is_active"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields")
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = achievement_id
    updates["tid"] = tenant_id
    row = db.execute(text(f"""
        UPDATE achievement_definitions SET {set_clause}
        WHERE id = :id AND tenant_id = :tid
        RETURNING id, name, is_active
    """), updates).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.commit()
    return dict(row)


@achievement_router.delete("/{achievement_id}/", status_code=204)
def delete_achievement_definition(
    achievement_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = current_user.get("tenant_id")
    db.execute(text("DELETE FROM achievement_definitions WHERE id = :id AND tenant_id = :tid"),
               {"id": achievement_id, "tid": tenant_id})
    db.commit()


# =============================================================================
# Student Achievements  /student-achievements/
# =============================================================================

student_achievement_router = APIRouter()


@student_achievement_router.get("/")
def list_student_achievements(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    student_id: Optional[str] = Query(None),
):
    tenant_id = current_user.get("tenant_id")
    extra = ""
    params: dict = {"tid": tenant_id}
    if student_id:
        extra = " AND sa.student_id = :sid"
        params["sid"] = student_id
    rows = db.execute(text(f"""
        SELECT sa.id, sa.student_id, sa.achievement_id, sa.earned_at,
               ad.name as achievement_name, ad.icon, ad.points_value
        FROM student_achievements sa
        JOIN achievement_definitions ad ON ad.id = sa.achievement_id
        WHERE sa.tenant_id = :tid {extra}
        ORDER BY sa.earned_at DESC LIMIT 500
    """), params).mappings().all()
    return [dict(r) for r in rows]


@student_achievement_router.post("/", status_code=201)
def award_student_achievement(
    body: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    try:
        row = db.execute(text("""
            INSERT INTO student_achievements (tenant_id, student_id, achievement_id, awarded_by)
            VALUES (:tid, :sid, :aid, :awarded_by)
            ON CONFLICT (student_id, achievement_id) DO NOTHING
            RETURNING id, student_id, achievement_id, earned_at
        """), {
            "tid": tenant_id,
            "sid": body.get("student_id"),
            "aid": body.get("achievement_id"),
            "awarded_by": str(user_id) if user_id else None,
        }).mappings().first()
        db.commit()
        return dict(row) if row else {"status": "already_awarded"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# Gamification process-event  /gamification/process-event/
# =============================================================================

gamification_router = APIRouter()


@gamification_router.post("/process-event/")
def process_gamification_event(
    body: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Process a gamification event and award matching achievements."""
    tenant_id = current_user.get("tenant_id")
    event_type = body.get("event_type", "")
    student_id = body.get("student_id")

    if not student_id or not event_type:
        raise HTTPException(status_code=400, detail="student_id and event_type required")

    # Find matching achievement definitions for this event type
    rows = db.execute(text("""
        SELECT id, name, points_value FROM achievement_definitions
        WHERE tenant_id = :tid AND is_active = TRUE AND trigger_type = :etype
    """), {"tid": tenant_id, "etype": event_type}).mappings().all()

    awarded = []
    for ach in rows:
        try:
            result = db.execute(text("""
                INSERT INTO student_achievements (tenant_id, student_id, achievement_id)
                VALUES (:tid, :sid, :aid)
                ON CONFLICT (student_id, achievement_id) DO NOTHING
                RETURNING id
            """), {"tid": tenant_id, "sid": student_id, "aid": str(ach["id"])}).mappings().first()
            if result:
                awarded.append({"achievement_id": str(ach["id"]), "name": ach["name"]})
        except Exception:
            pass

    db.commit()
    return {"event_type": event_type, "student_id": student_id, "achievements_awarded": awarded}
