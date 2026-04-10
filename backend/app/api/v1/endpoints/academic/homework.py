"""Homework endpoints"""
import logging
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
from datetime import datetime, date

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ────────────────────────────────────────────────────────────────

class HomeworkCreate(BaseModel):
    title: str
    description: Optional[str] = None
    class_id: Optional[str] = None
    subject_id: Optional[str] = None
    due_date: Optional[str] = None
    is_published: bool = True
    content: Optional[str] = None


class HomeworkUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    class_id: Optional[str] = None
    subject_id: Optional[str] = None
    due_date: Optional[str] = None
    is_published: Optional[bool] = None
    content: Optional[str] = None


class SubmissionCreate(BaseModel):
    homework_id: str
    student_id: str
    content: Optional[str] = None


class GradeSubmission(BaseModel):
    grade: Optional[float] = None
    feedback: Optional[str] = None


# ─── GET /homework ──────────────────────────────────────────────────────────

@router.get("/")
def list_homework(
    class_id: Optional[str] = None,
    subject_id: Optional[str] = None,
    search: Optional[str] = None,
    due_date_from: Optional[str] = None,
    due_date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:read")),
):
    """List homework with optional filters."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "pages": 1}

    where = ["h.tenant_id = :tenant_id"]
    params: dict = {"tenant_id": tenant_id, "limit": page_size, "offset": (page - 1) * page_size}

    if class_id:
        where.append("h.class_id = :class_id")
        params["class_id"] = class_id
    if subject_id:
        where.append("h.subject_id = :subject_id")
        params["subject_id"] = subject_id
    if search:
        where.append("h.title ILIKE :search")
        params["search"] = f"%{search}%"
    if due_date_from:
        where.append("h.due_date >= :due_date_from")
        params["due_date_from"] = due_date_from
    if due_date_to:
        where.append("h.due_date <= :due_date_to")
        params["due_date_to"] = due_date_to

    where_sql = " AND ".join(where)

    items_sql = text(f"""
        SELECT h.*, s.name as subject_name, p.first_name as teacher_first, p.last_name as teacher_last
        FROM homework h
        LEFT JOIN subjects s ON h.subject_id = s.id
        LEFT JOIN users p ON h.teacher_id = p.id
        WHERE {where_sql}
        ORDER BY h.due_date ASC NULLS LAST, h.created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    rows = db.execute(items_sql, params).mappings().all()

    count_sql = text(f"SELECT COUNT(*) FROM homework h WHERE {where_sql}")
    total = db.execute(count_sql, {k: v for k, v in params.items() if k not in ("limit", "offset")}).scalar() or 0

    items = []
    for r in rows:
        item = dict(r)
        if isinstance(item.get("due_date"), datetime):
            item["due_date"] = item["due_date"].isoformat()
        if isinstance(item.get("created_at"), datetime):
            item["created_at"] = item["created_at"].isoformat()
        items.append(item)

    import math
    return {
        "items": items,
        "total": int(total),
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total > 0 else 1,
    }


# ─── GET /homework/{homework_id} ────────────────────────────────────────────

@router.get("/{homework_id}/")
def get_homework(
    homework_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:read")),
):
    """Get a single homework with its submissions."""
    tenant_id = current_user.get("tenant_id")
    row = db.execute(text("""
        SELECT h.*, s.name as subject_name, p.first_name as teacher_first, p.last_name as teacher_last
        FROM homework h
        LEFT JOIN subjects s ON h.subject_id = s.id
        LEFT JOIN users p ON h.teacher_id = p.id
        WHERE h.id = :id AND h.tenant_id = :tenant_id
    """), {"id": homework_id, "tenant_id": tenant_id}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Homework not found")

    result = dict(row)
    if isinstance(result.get("due_date"), datetime):
        result["due_date"] = result["due_date"].isoformat()
    if isinstance(result.get("created_at"), datetime):
        result["created_at"] = result["created_at"].isoformat()

    # Fetch submissions
    submissions = db.execute(text("""
        SELECT * FROM homework_submissions
        WHERE homework_id = :homework_id AND tenant_id = :tenant_id
        ORDER BY submitted_at DESC
    """), {"homework_id": homework_id, "tenant_id": tenant_id}).mappings().all()

    result["submissions"] = []
    for sub in submissions:
        s = dict(sub)
        if isinstance(s.get("submitted_at"), datetime):
            s["submitted_at"] = s["submitted_at"].isoformat()
        if isinstance(s.get("graded_at"), datetime):
            s["graded_at"] = s["graded_at"].isoformat()
        result["submissions"].append(s)

    return result


# ─── GET /homework/submissions/{student_id} ─────────────────────────────────

@router.get("/submissions/{student_id}/")
def get_student_submissions(
    student_id: str,
    homework_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:read")),
):
    """Get homework submissions for a student."""
    tenant_id = current_user.get("tenant_id")
    where = ["hs.tenant_id = :tenant_id", "hs.student_id = :student_id"]
    params: dict = {"tenant_id": tenant_id, "student_id": student_id}

    if homework_id:
        where.append("hs.homework_id = :homework_id")
        params["homework_id"] = homework_id

    where_sql = " AND ".join(where)
    rows = db.execute(text(f"""
        SELECT hs.* FROM homework_submissions hs
        WHERE {where_sql}
        ORDER BY hs.submitted_at DESC
    """), params).mappings().all()

    items = []
    for r in rows:
        s = dict(r)
        if isinstance(s.get("submitted_at"), datetime):
            s["submitted_at"] = s["submitted_at"].isoformat()
        if isinstance(s.get("graded_at"), datetime):
            s["graded_at"] = s["graded_at"].isoformat()
        items.append(s)

    return items


# ─── POST /homework ─────────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_homework(
    body: HomeworkCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:write")),
):
    """Create new homework."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")

    try:
        result = db.execute(text("""
            INSERT INTO homework (tenant_id, title, description, class_id, subject_id,
                                  due_date, is_published, content, teacher_id, created_at, updated_at)
            VALUES (:tenant_id, :title, :description, :class_id, :subject_id,
                    :due_date, :is_published, :content, :teacher_id, NOW(), NOW())
            RETURNING id
        """), {
            "tenant_id": tenant_id,
            "title": body.title,
            "description": body.description,
            "class_id": body.class_id,
            "subject_id": body.subject_id,
            "due_date": body.due_date,
            "is_published": body.is_published,
            "content": body.content,
            "teacher_id": user_id,
        }).scalar()

        log_audit(
            db, user_id=user_id, tenant_id=tenant_id,
            action="CREATE", resource_type="HOMEWORK", resource_id=str(result),
            details={"title": body.title, "class_id": body.class_id}
        )
        db.commit()
        return {"id": str(result), "message": "Homework created"}
    except Exception as e:
        db.rollback()
        logger.error("create_homework failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


# ─── PUT /homework/{homework_id} ────────────────────────────────────────────

@router.put("/{homework_id}/")
def update_homework(
    homework_id: str,
    body: HomeworkUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:write")),
):
    """Update homework."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join([f"{k} = :{k}" for k in updates])
    updates["id"] = homework_id
    updates["tenant_id"] = tenant_id

    result = db.execute(text(f"""
        UPDATE homework SET {set_clause}, updated_at = NOW()
        WHERE id = :id AND tenant_id = :tenant_id
    """), updates)

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Homework not found")

    log_audit(
        db, user_id=user_id, tenant_id=tenant_id,
        action="UPDATE", resource_type="HOMEWORK", resource_id=homework_id,
        details=updates
    )
    db.commit()
    return {"message": "Homework updated"}


# ─── DELETE /homework/{homework_id} ─────────────────────────────────────────

@router.delete("/{homework_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_homework(
    homework_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:write")),
):
    """Delete homework."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")

    result = db.execute(text("""
        DELETE FROM homework WHERE id = :id AND tenant_id = :tenant_id
    """), {"id": homework_id, "tenant_id": tenant_id})

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Homework not found")

    log_audit(
        db, user_id=user_id, tenant_id=tenant_id,
        action="DELETE", resource_type="HOMEWORK", resource_id=homework_id,
    )
    db.commit()


# ─── POST /homework/{homework_id}/submit ────────────────────────────────────

@router.post("/{homework_id}/submit/", status_code=status.HTTP_201_CREATED)
def submit_homework(
    homework_id: str,
    body: SubmissionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Submit homework (student)."""
    tenant_id = current_user.get("tenant_id")

    try:
        result = db.execute(text("""
            INSERT INTO homework_submissions (tenant_id, homework_id, student_id, content, submitted_at)
            VALUES (:tenant_id, :homework_id, :student_id, :content, NOW())
            RETURNING id
        """), {
            "tenant_id": tenant_id,
            "homework_id": homework_id,
            "student_id": body.student_id,
            "content": body.content,
        }).scalar()

        db.commit()
        return {"id": str(result), "message": "Homework submitted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ─── POST /homework/submissions/{submission_id}/grade ───────────────────────

@router.post("/submissions/{submission_id}/grade/")
def grade_submission(
    submission_id: str,
    body: GradeSubmission,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("homework:write")),
):
    """Grade a homework submission."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")

    result = db.execute(text("""
        UPDATE homework_submissions
        SET grade = :grade, feedback = :feedback, graded_at = NOW(), graded_by = :graded_by
        WHERE id = :id AND tenant_id = :tenant_id
        RETURNING id
    """), {
        "id": submission_id,
        "tenant_id": tenant_id,
        "grade": body.grade,
        "feedback": body.feedback,
        "graded_by": user_id,
    })

    if not result.scalar():
        raise HTTPException(status_code=404, detail="Submission not found")

    log_audit(
        db, user_id=user_id, tenant_id=tenant_id,
        action="GRADE", resource_type="HOMEWORK_SUBMISSION", resource_id=submission_id,
        details={"grade": body.grade}
    )
    db.commit()
    return {"message": "Submission graded"}
