"""Grade endpoints"""
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import math

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.crud import grade as crud_grade
from app.schemas.grade import Grade, GradeCreate, GradeUpdate, GradeList

router = APIRouter()


@router.get("/", response_model=GradeList)
def list_grades(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    student_id: Optional[UUID] = None,
    subject: Optional[str] = None,
    academic_year: Optional[str] = None,
    assessment_id: Optional[UUID] = None,
    class_id: Optional[UUID] = None,
):
    """
    List grades with pagination and filters
    
    Permissions: grades:read
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return GradeList(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
            pages=1,
        )

    # ── Règle métier / confidentialité ────────────────────────────────────
    # STUDENT ne voit que ses propres notes ; PARENT uniquement celles de
    # ses enfants. Sans ce filtre, tout porteur de grades:read voyait les
    # notes de TOUT l'établissement.
    from sqlalchemy import text as sa_text
    roles = set(current_user.get("roles", []))
    user_id = current_user.get("id")
    privileged = roles & {"SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "TEACHER",
                          "DEPARTMENT_HEAD", "SECRETARY", "STAFF"}
    if not privileged and roles & {"STUDENT", "PARENT"}:
        allowed_ids = set()
        if "STUDENT" in roles:
            rows = db.execute(sa_text(
                "SELECT id FROM students WHERE tenant_id = :tid AND (user_id = :uid "
                "OR email = (SELECT email FROM users WHERE id = :uid))"
            ), {"tid": tenant_id, "uid": user_id}).fetchall()
            allowed_ids.update(str(r[0]) for r in rows)
        if "PARENT" in roles:
            rows = db.execute(sa_text(
                "SELECT student_id FROM parent_students WHERE tenant_id = :tid AND parent_id = :uid"
            ), {"tid": tenant_id, "uid": user_id}).fetchall()
            allowed_ids.update(str(r[0]) for r in rows)
        if student_id is not None:
            if str(student_id) not in allowed_ids:
                return GradeList(items=[], total=0, page=page, page_size=page_size, pages=1)
        elif len(allowed_ids) == 1:
            student_id = UUID(next(iter(allowed_ids)))
        elif not allowed_ids:
            return GradeList(items=[], total=0, page=page, page_size=page_size, pages=1)
        else:
            # Parent de plusieurs enfants sans filtre explicite : agréger
            all_items, all_total = [], 0
            for sid in allowed_ids:
                g, t = crud_grade.get_grades(
                    db=db, tenant_id=tenant_id, skip=0, limit=page_size,
                    student_id=UUID(sid), subject=subject,
                    academic_year=academic_year, assessment_id=assessment_id,
                    class_id=class_id,
                )
                all_items.extend(g)
                all_total += t
            return GradeList(items=all_items[:page_size], total=all_total,
                             page=page, page_size=page_size,
                             pages=math.ceil(all_total / page_size) if all_total else 1)

    skip = (page - 1) * page_size
    grades, total = crud_grade.get_grades(
        db=db,
        tenant_id=tenant_id,
        skip=skip,
        limit=page_size,
        student_id=student_id,
        subject=subject,
        academic_year=academic_year,
        assessment_id=assessment_id,
        class_id=class_id,
    )
    
    pages = math.ceil(total / page_size) if total > 0 else 1
    
    return GradeList(
        items=grades,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/student/{student_id}/average/")
def get_student_average(
    student_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
    academic_year: Optional[str] = None,
    semester: Optional[int] = Query(None, ge=1, le=2),
):
    """
    Get student's average grades
    
    Permissions: grades:read
    """
    return crud_grade.get_student_average(
        db=db,
        student_id=student_id,
        tenant_id=current_user.get("tenant_id"),
        academic_year=academic_year,
        semester=semester,
    )


@router.get("/{grade_id}/", response_model=Grade)
def get_grade(
    grade_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
):
    """
    Get grade by ID
    
    Permissions: grades:read
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID required")
    grade = crud_grade.get_grade(db, grade_id, tenant_id)
    if not grade:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grade not found"
        )
    return grade


@router.post("/", response_model=Grade, status_code=status.HTTP_201_CREATED)
def create_grade(
    grade: GradeCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:write")),
):
    """
    Create a new grade
    
    Permissions: grades:write
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID required")
    return crud_grade.create_grade(db, grade, tenant_id)


@router.put("/{grade_id}/", response_model=Grade)
def update_grade(
    grade_id: UUID,
    grade_update: GradeUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:write")),
):
    """
    Update a grade
    
    Permissions: grades:write
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID required")
    updated_grade = crud_grade.update_grade(
        db, grade_id, grade_update, tenant_id
    )
    if not updated_grade:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grade not found"
        )
    return updated_grade


@router.delete("/{grade_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_grade(
    grade_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:write")),
):
    """
    Delete a grade
    
    Permissions: grades:write
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID required")
    success = crud_grade.delete_grade(db, grade_id, tenant_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grade not found"
        )
    return None


# ─── Bulk grades creation ─────────────────────────────────────────────────────

class BulkGradeItem(BaseModel):
    student_id: UUID
    assessment_id: UUID
    score: Optional[float] = None
    comment: Optional[str] = None


class BulkGradesRequest(BaseModel):
    grades: List[BulkGradeItem]

    @field_validator("grades")
    @classmethod
    def validate_grades_limit(cls, v):
        if len(v) == 0:
            raise ValueError("Au moins une note est requise")
        if len(v) > 200:
            raise ValueError("Maximum 200 notes par requête bulk")
        return v


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
def create_bulk_grades(
    body: BulkGradesRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:write")),
):
    """
    Create multiple grades in a single request.
    POST /grades/bulk
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID required")

    # Validate score ranges
    for i, item in enumerate(body.grades):
        if item.score is not None and (item.score < 0 or item.score > 100):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Note #{i+1}: le score doit être entre 0 et 100"
            )

    created = []
    try:
        for item in body.grades:
            row = db.execute(text("""
                INSERT INTO grades (tenant_id, student_id, assessment_id, score, comment, created_at, updated_at)
                VALUES (:tenant_id, :student_id, :assessment_id, :score, :comment, NOW(), NOW())
                RETURNING id, student_id, assessment_id, score, comment, created_at
            """), {
                "tenant_id": tenant_id,
                "student_id": str(item.student_id),
                "assessment_id": str(item.assessment_id),
                "score": item.score,
                "comment": item.comment,
            }).mappings().first()
            created.append(dict(row))

        # Audit log for bulk operation
        try:
            from app.utils.audit import log_audit
            log_audit(
                db,
                user_id=current_user.get("id"),
                tenant_id=tenant_id,
                action="BULK_CREATE",
                resource_type="GRADE",
                resource_id=None,
                details={"count": len(created), "assessment_ids": list(set(str(g.assessment_id) for g in body.grades))},
            )
        except Exception:
            pass  # Don't fail the operation if audit logging fails

        db.commit()
        return {"created": len(created), "grades": created}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to create bulk grades: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


# ─── GET /grade-history ────────────────────────────────────────────────────────

@router.get("/history/")
def list_grade_history(
    grade_id: Optional[str] = None,
    student_id: Optional[str] = None,
    ordering: str = "-created_at",
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
):
    """Return the audit trail of grade changes. GET /grades/history/"""
    tenant_id = current_user.get("tenant_id")
    where = ["tenant_id = :tenant_id"]
    params: dict = {"tenant_id": tenant_id}

    if grade_id:
        where.append("grade_id = :grade_id")
        params["grade_id"] = grade_id
    if student_id:
        where.append("student_id = :student_id")
        params["student_id"] = student_id

    # Whitelist stricte — jamais d'interpolation directe de paramètres utilisateur
    _ALLOWED_ORDER_COLS = {
        "created_at": "gh.created_at",
        "old_score": "gh.old_score",
        "new_score": "gh.new_score",
    }
    _ALLOWED_ORDER_DIRS = {"ASC": "ASC", "DESC": "DESC"}

    raw_col = ordering.lstrip("-") if ordering else "created_at"
    raw_dir = "ASC" if (ordering and not ordering.startswith("-")) else "DESC"

    safe_col = _ALLOWED_ORDER_COLS.get(raw_col, "gh.created_at")
    safe_dir = _ALLOWED_ORDER_DIRS.get(raw_dir, "DESC")

    rows = db.execute(text(f"""
        SELECT gh.id, gh.grade_id, gh.old_score, gh.new_score,
               gh.old_comment, gh.new_comment, gh.change_reason, gh.created_at,
               u.first_name, u.last_name, u.id as user_id
        FROM grade_history gh
        LEFT JOIN users u ON u.id = gh.user_id
        WHERE {' AND '.join(where)}
        ORDER BY {safe_col} {safe_dir}
        LIMIT 200
    """), params).mappings().all()

    return [
        {
            **dict(r),
            "user": {"id": str(r["user_id"]), "first_name": r["first_name"], "last_name": r["last_name"]}
            if r["user_id"] else None,
        }
        for r in rows
    ]
