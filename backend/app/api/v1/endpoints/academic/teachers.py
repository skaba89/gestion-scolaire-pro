import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit

router = APIRouter()
logger = logging.getLogger(__name__)


class TeacherAssignmentCreate(BaseModel):
    teacher_id: str
    class_id: Optional[str] = None
    subject_id: Optional[str] = None


class TeacherAssignmentUpdate(BaseModel):
    class_id: Optional[str] = None
    subject_id: Optional[str] = None


@router.get("/")
def list_teachers(
    search: Optional[str] = None,
    class_id: Optional[str] = None,
    subject_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """List teacher assignments with pagination and filters."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "pages": 0}

    where_clauses = ["ta.tenant_id = :tid"]
    params = {"tid": tenant_id}

    if class_id:
        where_clauses.append("ta.class_id = :class_id")
        params["class_id"] = class_id
    if subject_id:
        where_clauses.append("ta.subject_id = :subject_id")
        params["subject_id"] = subject_id
    if search:
        where_clauses.append("(u.first_name ILIKE :s OR u.last_name ILIKE :s OR u.email ILIKE :s)")
        params["s"] = f"%{search}%"

    where_sql = " AND ".join(where_clauses)

    # Count
    count_result = db.execute(text(f"""
        SELECT COUNT(*) FROM teacher_assignments ta
        JOIN users u ON u.id = ta.teacher_id
        WHERE {where_sql}
    """), params).scalar()

    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    rows = db.execute(text(f"""
        SELECT ta.*,
               u.first_name as teacher_first_name, u.last_name as teacher_last_name, u.email as teacher_email,
               c.name as class_name,
               s.name as subject_name
        FROM teacher_assignments ta
        JOIN users u ON u.id = ta.teacher_id
        LEFT JOIN classrooms c ON c.id = ta.class_id
        LEFT JOIN subjects s ON s.id = ta.subject_id
        WHERE {where_sql}
        ORDER BY u.last_name, u.first_name
        LIMIT :limit OFFSET :offset
    """), params).fetchall()

    import math
    total = count_result or 0
    pages = math.ceil(total / page_size) if total > 0 else 0

    items = [{
        **dict(r._mapping),
        "teacher": {"id": r.teacher_id, "first_name": r.teacher_first_name, "last_name": r.teacher_last_name, "email": r.teacher_email},
        "classrooms": {"id": r.class_id, "name": r.class_name} if r.class_id else None,
        "subjects": {"id": r.subject_id, "name": r.subject_name} if r.subject_id else None,
    } for r in rows]

    return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": pages}


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_teacher_assignment(
    assignment: TeacherAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new teacher assignment."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            INSERT INTO teacher_assignments (id, tenant_id, teacher_id, class_id, subject_id, created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :teacher_id, :class_id, :subject_id, NOW(), NOW())
            RETURNING id, tenant_id, teacher_id, class_id, subject_id, created_at, updated_at
        """), {
            "tid": tenant_id,
            "teacher_id": assignment.teacher_id,
            "class_id": assignment.class_id,
            "subject_id": assignment.subject_id,
        }).mappings().first()
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_TEACHER_ASSIGNMENT", resource_type="TEACHER_ASSIGNMENT",
                  resource_id=str(result["id"]))
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        logger.error("Error creating teacher assignment: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.put("/{assignment_id}/")
def update_teacher_assignment(
    assignment_id: UUID,
    assignment: TeacherAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a teacher assignment."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        sets = []
        params = {"aid": str(assignment_id), "tid": tenant_id}
        if assignment.class_id is not None:
            sets.append("class_id = :class_id")
            params["class_id"] = assignment.class_id
        if assignment.subject_id is not None:
            sets.append("subject_id = :subject_id")
            params["subject_id"] = assignment.subject_id
        if not sets:
            raise HTTPException(status_code=400, detail="No fields to update")
        sets.append("updated_at = NOW()")
        query_str = f"""
            UPDATE teacher_assignments SET {', '.join(sets)}
            WHERE id = :aid AND tenant_id = :tid
            RETURNING id, tenant_id, teacher_id, class_id, subject_id, created_at, updated_at
        """
        result = db.execute(text(query_str), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Teacher assignment not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_TEACHER_ASSIGNMENT", resource_type="TEACHER_ASSIGNMENT",
                  resource_id=str(assignment_id))
        db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating teacher assignment: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


@router.delete("/{assignment_id}/")
def delete_teacher_assignment(
    assignment_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a teacher assignment."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text(
            "DELETE FROM teacher_assignments WHERE id = :aid AND tenant_id = :tid"
        ), {"aid": str(assignment_id), "tid": tenant_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Teacher assignment not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_TEACHER_ASSIGNMENT", resource_type="TEACHER_ASSIGNMENT",
                  resource_id=str(assignment_id))
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error deleting teacher assignment: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to delete resource. Please try again.")


# --- Teacher Dashboard (existing) ---

@router.get("/dashboard/")
def get_teacher_dashboard(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve all aggregated metrics for the Teacher Dashboard."""
    teacher_id = current_user.get("id")
    tenant_id = current_user.get("tenant_id")

    if not teacher_id or not tenant_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # 1. Classes and Subjects (Assignments)
    assignments = [dict(r) for r in db.execute(text("""
        SELECT ta.id, ta.class_id, ta.subject_id,
               c.id as class_id, c.name as class_name,
               s.id as subject_id, s.name as subject_name
        FROM teacher_assignments ta
        LEFT JOIN classrooms c ON ta.class_id = c.id
        LEFT JOIN subjects s ON ta.subject_id = s.id
        WHERE ta.teacher_id = :teacher_id AND ta.tenant_id = :tenant_id
    """), {"teacher_id": teacher_id, "tenant_id": tenant_id}).mappings().all()]

    formatted_assignments = []
    for a in assignments:
        formatted_assignments.append({
            "id": str(a["id"]),
            "class_id": str(a["class_id"]) if a["class_id"] else None,
            "subject_id": str(a["subject_id"]) if a["subject_id"] else None,
            "classrooms": {"id": str(a["class_id"]), "name": a["class_name"]} if a["class_id"] else None,
            "subjects": {"id": str(a["subject_id"]), "name": a["subject_name"]} if a["subject_id"] else None
        })

    # 2. Schedule
    schedule = [dict(r) for r in db.execute(text("""
        SELECT sh.id, sh.day_of_week, sh.start_time, sh.end_time,
               s.id as subject_id, s.name as subject_name,
               c.id as class_id, c.name as class_name
        FROM schedule sh
        LEFT JOIN subjects s ON sh.subject_id = s.id
        LEFT JOIN classrooms c ON sh.class_id = c.id
        WHERE sh.teacher_id = :teacher_id AND sh.tenant_id = :tenant_id
        ORDER BY sh.day_of_week, sh.start_time
    """), {"teacher_id": teacher_id, "tenant_id": tenant_id}).mappings().all()]

    formatted_schedule = []
    for s in schedule:
        formatted_schedule.append({
            "id": str(s["id"]),
            "day_of_week": int(s["day_of_week"]),
            "start_time": s["start_time"],
            "end_time": s["end_time"],
            "subjects": {"id": str(s["subject_id"]), "name": s["subject_name"]} if s["subject_id"] else None,
            "classrooms": {"id": str(s["class_id"]), "name": s["class_name"]} if s["class_id"] else None,
        })

    # 3. Recent assessments for this teacher's assigned subjects
    assessments = [dict(r) for r in db.execute(text("""
        SELECT DISTINCT a.id, a.name, a.max_score, a.assessment_type, a.date,
               s.name as subject_name
        FROM assessments a
        LEFT JOIN subjects s ON a.subject_id = s.id
        INNER JOIN teacher_assignments ta ON ta.subject_id = a.subject_id
        WHERE ta.teacher_id = :teacher_id AND a.tenant_id = :tenant_id
        ORDER BY a.created_at DESC LIMIT 5
    """), {"teacher_id": teacher_id, "tenant_id": tenant_id}).mappings().all()]

    formatted_assessments = []
    for a in assessments:
        formatted_assessments.append({
            "id": str(a["id"]),
            "name": a["name"],
            "max_score": float(a["max_score"]) if a["max_score"] else None,
            "type": a["assessment_type"],
            "date": a["date"].isoformat() if a["date"] and isinstance(a["date"], datetime) else a["date"],
            "subjects": {"name": a["subject_name"]} if a["subject_name"] else None
        })

    return {
        "assignments": formatted_assignments,
        "schedule": formatted_schedule,
        "assessments": formatted_assessments
    }
