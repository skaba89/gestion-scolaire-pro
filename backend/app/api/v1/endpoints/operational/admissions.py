"""
Admissions module — workflow complet:
  DRAFT → SUBMITTED → UNDER_REVIEW → ACCEPTED → CONVERTED_TO_STUDENT
                                    ↘ REJECTED
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from datetime import date, datetime

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── State machine ────────────────────────────────────────────────────────────

VALID_TRANSITIONS: dict = {
    "DRAFT":                ["SUBMITTED"],
    "SUBMITTED":            ["UNDER_REVIEW", "REJECTED"],
    "UNDER_REVIEW":         ["ACCEPTED", "REJECTED"],
    "ACCEPTED":             ["CONVERTED_TO_STUDENT"],
    "REJECTED":             [],
    "CONVERTED_TO_STUDENT": [],
}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AdmissionCreate(BaseModel):
    student_first_name: str
    student_last_name: str
    student_date_of_birth: Optional[date] = None
    student_gender: Optional[str] = None
    student_address: Optional[str] = None
    student_previous_school: Optional[str] = None
    parent_first_name: str
    parent_last_name: str
    parent_email: str
    parent_phone: str
    parent_address: Optional[str] = None
    parent_occupation: Optional[str] = None
    academic_year_id: Optional[str] = None
    level_id: Optional[str] = None
    notes: Optional[str] = None


class StatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


class ConvertPayload(BaseModel):
    registration_number: Optional[str] = None
    class_name: Optional[str] = None


class AdmissionEdit(BaseModel):
    notes: Optional[str] = None
    student_address: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_email: Optional[str] = None
    academic_year_id: Optional[str] = None
    level_id: Optional[str] = None


# ─── Internal helper ──────────────────────────────────────────────────────────

def _fetch(db: Session, admission_id: str, tenant_id: str) -> dict:
    row = db.execute(text("""
        SELECT a.*,
               ay.name AS academic_year_name,
               l.name  AS level_name
        FROM   admission_applications a
        LEFT JOIN academic_years ay ON a.academic_year_id = ay.id
        LEFT JOIN levels         l  ON a.level_id         = l.id
        WHERE  a.id = :id AND a.tenant_id = :tenant_id
    """), {"id": admission_id, "tenant_id": tenant_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")
    return dict(row)


# ─── GET / ────────────────────────────────────────────────────────────────────

@router.get("/")
def list_admissions(
    status: Optional[str] = None,
    academic_year_id: Optional[str] = None,
    level_id: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:read")),
):
    """List admission applications with optional filters."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return {"items": [], "total": 0}
    q = """
        SELECT a.*, ay.name AS academic_year_name, l.name AS level_name
        FROM   admission_applications a
        LEFT JOIN academic_years ay ON a.academic_year_id = ay.id
        LEFT JOIN levels         l  ON a.level_id         = l.id
        WHERE  a.tenant_id = :tenant_id
    """
    params: dict = {"tenant_id": tenant_id}
    if status:
        q += " AND a.status = :status"
        params["status"] = status.upper()
    if academic_year_id:
        q += " AND a.academic_year_id = :ay_id"
        params["ay_id"] = academic_year_id
    if level_id:
        q += " AND a.level_id = :level_id"
        params["level_id"] = level_id
    if search:
        q += """ AND (a.student_first_name ILIKE :search OR a.student_last_name ILIKE :search
                   OR a.parent_email ILIKE :search OR a.parent_phone ILIKE :search)"""
        params["search"] = f"%{search}%"
    q += " ORDER BY a.created_at DESC LIMIT :limit OFFSET :offset"
    params.update({"limit": limit, "offset": offset})
    rows = db.execute(text(q), params).mappings().all()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


# ─── GET /stats ───────────────────────────────────────────────────────────────

@router.get("/stats/")
def get_stats(
    academic_year_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:read")),
):
    """Counts per status for dashboard cards."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return {
            "DRAFT": 0, "SUBMITTED": 0, "UNDER_REVIEW": 0,
            "ACCEPTED": 0, "REJECTED": 0, "CONVERTED_TO_STUDENT": 0, "total": 0,
        }
    q = "SELECT status, COUNT(*) AS total FROM admission_applications WHERE tenant_id = :tenant_id"
    params: dict = {"tenant_id": tenant_id}
    if academic_year_id:
        q += " AND academic_year_id = :ay_id"
        params["ay_id"] = academic_year_id
    q += " GROUP BY status"
    rows = db.execute(text(q), params).mappings().all()
    counts = {r["status"]: r["total"] for r in rows}
    return {
        "DRAFT":                counts.get("DRAFT", 0),
        "SUBMITTED":            counts.get("SUBMITTED", 0),
        "UNDER_REVIEW":         counts.get("UNDER_REVIEW", 0),
        "ACCEPTED":             counts.get("ACCEPTED", 0),
        "REJECTED":             counts.get("REJECTED", 0),
        "CONVERTED_TO_STUDENT": counts.get("CONVERTED_TO_STUDENT", 0),
        "total":                sum(counts.values()),
    }


# ─── GET /{id} ────────────────────────────────────────────────────────────────

@router.get("/{admission_id}/")
def get_admission(
    admission_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:read")),
):
    return _fetch(db, admission_id, current_user.get("tenant_id"))


# ─── POST / ───────────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
def create_admission(
    payload: AdmissionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new admission application (starts as DRAFT)."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    row = db.execute(text("""
        INSERT INTO admission_applications (
            id, tenant_id, academic_year_id, level_id,
            student_first_name, student_last_name, student_date_of_birth,
            student_gender, student_address, student_previous_school,
            parent_first_name, parent_last_name, parent_email, parent_phone,
            parent_address, parent_occupation, status, notes, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), :tenant_id, :academic_year_id, :level_id,
            :student_first_name, :student_last_name, :student_date_of_birth,
            :student_gender, :student_address, :student_previous_school,
            :parent_first_name, :parent_last_name, :parent_email, :parent_phone,
            :parent_address, :parent_occupation, 'DRAFT', :notes, NOW(), NOW()
        ) RETURNING *
    """), {
        "tenant_id": tenant_id, "academic_year_id": payload.academic_year_id,
        "level_id": payload.level_id,
        "student_first_name": payload.student_first_name, "student_last_name": payload.student_last_name,
        "student_date_of_birth": payload.student_date_of_birth, "student_gender": payload.student_gender,
        "student_address": payload.student_address, "student_previous_school": payload.student_previous_school,
        "parent_first_name": payload.parent_first_name, "parent_last_name": payload.parent_last_name,
        "parent_email": payload.parent_email, "parent_phone": payload.parent_phone,
        "parent_address": payload.parent_address, "parent_occupation": payload.parent_occupation,
        "notes": payload.notes,
    }).mappings().first()
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="ADMISSION_CREATED", resource_type="ADMISSION", resource_id=str(row["id"]))
    db.commit()
    return dict(row)


# ─── PATCH /{id}/status ───────────────────────────────────────────────────────

@router.patch("/{admission_id}/status/")
def transition_status(
    admission_id: str,
    payload: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:write")),
):
    """Move an application through its lifecycle with state machine validation."""
    tenant_id = current_user.get("tenant_id")
    app = _fetch(db, admission_id, tenant_id)
    current_status = app["status"]
    new_status = payload.status.upper()
    allowed = VALID_TRANSITIONS.get(current_status, [])
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=(
            f"Cannot transition from '{current_status}' to '{new_status}'. "
            f"Allowed: {allowed if allowed else 'none — terminal state'}"
        ))
    extra = ""
    extra_params: dict = {}
    if new_status == "SUBMITTED":
        extra = ", submitted_at = NOW()"
    if new_status in ("ACCEPTED", "REJECTED", "UNDER_REVIEW"):
        extra = ", reviewed_at = NOW(), reviewed_by = :reviewer"
        extra_params["reviewer"] = current_user.get("id")
    db.execute(text(f"""
        UPDATE admission_applications
        SET status = :status, notes = COALESCE(:notes, notes), updated_at = NOW() {extra}
        WHERE id = :id AND tenant_id = :tenant_id
    """), {"status": new_status, "notes": payload.notes,
           "id": admission_id, "tenant_id": tenant_id, **extra_params})
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action=f"ADMISSION_{new_status}", resource_type="ADMISSION",
              resource_id=admission_id, details={"from": current_status, "to": new_status})
    db.commit()
    return _fetch(db, admission_id, tenant_id)


# ─── POST /{id}/convert ───────────────────────────────────────────────────────

@router.post("/{admission_id}/convert/")
def convert_to_student(
    admission_id: str,
    payload: ConvertPayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:write")),
):
    """
    Convert an ACCEPTED application into a Student record.
    Copies personal + parent data and marks the application as CONVERTED_TO_STUDENT.
    """
    tenant_id = current_user.get("tenant_id")
    app = _fetch(db, admission_id, tenant_id)
    if app["status"] != "ACCEPTED":
        raise HTTPException(status_code=400,
            detail=f"Only ACCEPTED applications can be converted (current: {app['status']})")

    # Auto-generate registration number
    reg_number = payload.registration_number
    if not reg_number:
        year = datetime.now().year
        seq = (db.execute(text(
            "SELECT COUNT(*) FROM students WHERE tenant_id = :tid"
        ), {"tid": tenant_id}).scalar() or 0) + 1
        reg_number = f"STU-{year}-{seq:04d}"

    # Map gender safely
    raw_gender = (app.get("student_gender") or "").upper()
    gender = raw_gender if raw_gender in ("MALE", "FEMALE", "OTHER") else "OTHER"
    # date_of_birth is NOT NULL in students — fallback to today if missing
    dob = app.get("student_date_of_birth") or date.today()

    student = db.execute(text("""
        INSERT INTO students (
            tenant_id, registration_number,
            first_name, last_name, date_of_birth, gender,
            address, level, class_name, academic_year, status,
            parent_name, parent_phone, parent_email,
            created_at, updated_at
        ) VALUES (
            :tenant_id, :reg_number,
            :first_name, :last_name, :dob, :gender,
            :address, :level, :class_name, :academic_year, 'ACTIVE',
            :parent_name, :parent_phone, :parent_email,
            NOW(), NOW()
        ) RETURNING id, registration_number, first_name, last_name
    """), {
        "tenant_id":   tenant_id, "reg_number": reg_number,
        "first_name":  app["student_first_name"], "last_name": app["student_last_name"],
        "dob":         dob, "gender": gender,
        "address":     app.get("student_address"),
        "level":       app.get("level_name") or "",
        "class_name":  payload.class_name,
        "academic_year": app.get("academic_year_name"),
        "parent_name": f"{app['parent_first_name']} {app['parent_last_name']}",
        "parent_phone": app["parent_phone"],
        "parent_email": app["parent_email"],
    }).mappings().first()

    student_id = str(student["id"])
    db.execute(text("""
        UPDATE admission_applications
        SET status = 'CONVERTED_TO_STUDENT', converted_student_id = :student_id,
            reviewed_by = :reviewer, reviewed_at = NOW(), updated_at = NOW()
        WHERE id = :id AND tenant_id = :tenant_id
    """), {"student_id": student_id, "reviewer": current_user.get("id"),
           "id": admission_id, "tenant_id": tenant_id})

    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="ADMISSION_CONVERTED", resource_type="ADMISSION", resource_id=admission_id,
              details={"student_id": student_id, "registration_number": reg_number})
    db.commit()

    return {
        "message": "Application converted to student successfully",
        "student_id": student_id,
        "registration_number": reg_number,
        "student_name": f"{student['first_name']} {student['last_name']}",
    }


# ─── PATCH /{id} — edit DRAFT fields ─────────────────────────────────────────

@router.patch("/{admission_id}/")
def edit_admission(
    admission_id: str,
    payload: AdmissionEdit,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:write")),
):
    """Update editable fields on a DRAFT application."""
    tenant_id = current_user.get("tenant_id")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No updatable fields provided")
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    result = db.execute(text(f"""
        UPDATE admission_applications
        SET {set_clause}, updated_at = NOW()
        WHERE id = :id AND tenant_id = :tenant_id AND status = 'DRAFT'
        RETURNING id
    """), {"id": admission_id, "tenant_id": tenant_id, **updates})
    if not result.rowcount:
        raise HTTPException(status_code=400,
            detail="Application not found or not in DRAFT status")
    db.commit()
    return _fetch(db, admission_id, tenant_id)


# ─── DELETE /{id} — DRAFT only ────────────────────────────────────────────────

@router.delete("/{admission_id}/", status_code=204)
def delete_admission(
    admission_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("admissions:write")),
):
    """Delete a DRAFT application only."""
    tenant_id = current_user.get("tenant_id")
    result = db.execute(text("""
        DELETE FROM admission_applications
        WHERE id = :id AND tenant_id = :tenant_id AND status = 'DRAFT'
        RETURNING id
    """), {"id": admission_id, "tenant_id": tenant_id})
    if not result.rowcount:
        raise HTTPException(status_code=400,
            detail="Application not found or not in DRAFT status")
    db.commit()
@router.post("/public/apply/", status_code=201)
def public_apply(
    payload: dict,
    db: Session = Depends(get_db),
):
    """Public endpoint to submit an admission application (starts as SUBMITTED)."""
    tenant_id = payload.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Missing tenant_id")
    
    # Verify tenant exists and is active
    from app.models import Tenant
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id, Tenant.is_active == True).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found or inactive")

    row = db.execute(text("""
        INSERT INTO admission_applications (
            id, tenant_id, academic_year_id, level_id,
            student_first_name, student_last_name, student_date_of_birth,
            student_gender, student_address, student_previous_school,
            parent_first_name, parent_last_name, parent_email, parent_phone,
            parent_address, parent_occupation, status, notes, 
            submitted_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), :tenant_id, :academic_year_id, :level_id,
            :student_first_name, :student_last_name, :student_date_of_birth,
            :student_gender, :student_address, :student_previous_school,
            :parent_first_name, :parent_last_name, :parent_email, :parent_phone,
            :parent_address, :parent_occupation, 'SUBMITTED', :notes,
            NOW(), NOW(), NOW()
        ) RETURNING *
    """), {
        "tenant_id": tenant_id, 
        "academic_year_id": payload.get("academic_year_id"),
        "level_id": payload.get("level_id"),
        "student_first_name": payload.get("student_first_name"), 
        "student_last_name": payload.get("student_last_name"),
        "student_date_of_birth": payload.get("student_date_of_birth"), 
        "student_gender": payload.get("student_gender"),
        "student_address": payload.get("student_address"), 
        "student_previous_school": payload.get("student_previous_school"),
        "parent_first_name": payload.get("parent_first_name"), 
        "parent_last_name": payload.get("parent_last_name"),
        "parent_email": payload.get("parent_email"), 
        "parent_phone": payload.get("parent_phone"),
        "parent_address": payload.get("parent_address"), 
        "parent_occupation": payload.get("parent_occupation"),
        "notes": payload.get("notes"),
    }).mappings().first()
    
    db.commit()
    return dict(row)
