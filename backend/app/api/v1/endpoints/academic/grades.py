"""Grade endpoints"""
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import math

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.idempotency import get_idempotent_response_or_lock, store_idempotent_response
from app.core.security import get_current_user, require_permission
from app.core.teacher_scope import is_scoped_teacher, teacher_teaches_class
from app.core.tenant_resolution import resolve_current_tenant_id
from app.crud import grade as crud_grade
from app.schemas.grade import Grade, GradeCreate, GradeUpdate, GradeList

router = APIRouter()


def _validate_grade_fks(db: Session, *, tenant_id: str, student_id=None, subject_id=None, assessment_id=None) -> None:
    """FK injection guard (institutional-readiness audit, 2026-09):
    student_id/subject_id/assessment_id were inserted/updated as-is from
    the client with no check they belong to the caller's tenant — a
    TEACHER (grades:write) could attach a grade to another establishment's
    student or assessment, corrupting that tenant's averages/transcripts."""
    if student_id:
        exists = db.execute(text(
            "SELECT 1 FROM students WHERE id = :id AND tenant_id = :tid"
        ), {"id": str(student_id), "tid": tenant_id}).first()
        if not exists:
            raise HTTPException(status_code=404, detail="Élève introuvable dans cet établissement")
    if subject_id:
        exists = db.execute(text(
            "SELECT 1 FROM subjects WHERE id = :id AND tenant_id = :tid"
        ), {"id": str(subject_id), "tid": tenant_id}).first()
        if not exists:
            raise HTTPException(status_code=404, detail="Matière introuvable dans cet établissement")
    if assessment_id:
        exists = db.execute(text(
            "SELECT 1 FROM assessments WHERE id = :id AND tenant_id = :tid"
        ), {"id": str(assessment_id), "tid": tenant_id}).first()
        if not exists:
            raise HTTPException(status_code=404, detail="Évaluation introuvable dans cet établissement")


def _require_teacher_grade_write_scope(
    db: Session, *, tenant_id: str, current_user: dict,
    student_id: UUID, assessment_id: Optional[UUID],
) -> None:
    """Restrict non-privileged teachers to their assigned class/subject/roster.

    A generic grades:write grant is not authorization to enter grades for
    every child in the establishment. Assessments without a class and grades
    without an assessment are administrator-only entry paths.
    """
    if not is_scoped_teacher(current_user):
        return
    if not assessment_id:
        raise HTTPException(status_code=403, detail="Évaluation obligatoire pour un enseignant")
    row = db.execute(text("""
        SELECT a.class_id, a.subject_id
          FROM assessments a
          JOIN enrollments e
            ON e.tenant_id = a.tenant_id
           AND e.class_id = a.class_id
           AND e.student_id = :student_id
           AND UPPER(e.status) = 'ACTIVE'
         WHERE a.id = :assessment_id
           AND a.tenant_id = :tenant_id
         LIMIT 1
    """), {"student_id": str(student_id), "assessment_id": str(assessment_id),
           "tenant_id": tenant_id}).mappings().first()
    if not row or not teacher_teaches_class(
        db, tenant_id=tenant_id, user_id=current_user.get("id"),
        class_id=str(row["class_id"]), subject_id=str(row["subject_id"]) if row["subject_id"] else None,
    ):
        raise HTTPException(status_code=403, detail="Classe, matière ou élève non autorisé pour cet enseignant")


def _allowed_student_ids_for_caller(db: Session, *, current_user: dict, tenant_id: str) -> Optional[set]:
    """Ownership scoping (institutional-readiness audit, 2026-09): STUDENT
    sees only their own grades, PARENT only their children's, ALUMNI only
    their own historical record (same `students` row, status GRADUATED —
    the frontend grants ALUMNI grades:read for exactly this, their own
    report card, never the tenant's current students). Without this, any
    holder of grades:read who wasn't a "staff" role saw every student's
    grades in the tenant. Returns None for a privileged caller (no
    restriction), or the set of student ids the caller may see (possibly
    empty). NOTE: ALUMNI was previously excluded from both the privileged
    bypass and this scoping — it fell through to the unfiltered query at
    the bottom of list_grades, giving alumni tenant-wide grade access;
    fixed by folding it into the STUDENT-style lookup here."""
    roles = set(current_user.get("roles", []))
    user_id = current_user.get("id")
    privileged = roles & {"SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "TEACHER",
                          "DEPARTMENT_HEAD", "SECRETARY", "STAFF"}
    if privileged or not (roles & {"STUDENT", "PARENT", "ALUMNI"}):
        return None
    allowed_ids = set()
    if roles & {"STUDENT", "ALUMNI"}:
        rows = db.execute(text(
            "SELECT id FROM students WHERE tenant_id = :tid AND (user_id = :uid "
            "OR email = (SELECT email FROM users WHERE id = :uid))"
        ), {"tid": tenant_id, "uid": user_id}).fetchall()
        allowed_ids.update(str(r[0]) for r in rows)
    if "PARENT" in roles:
        rows = db.execute(text(
            "SELECT student_id FROM parent_students WHERE tenant_id = :tid AND parent_id = :uid"
        ), {"tid": tenant_id, "uid": user_id}).fetchall()
        allowed_ids.update(str(r[0]) for r in rows)
    return allowed_ids


@router.get("/", response_model=GradeList)
def list_grades(
    request: Request,
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
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
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
    # ses enfants ; ALUMNI uniquement les siennes. Sans ce filtre, tout
    # porteur de grades:read voyait les notes de TOUT l'établissement.
    allowed_ids = _allowed_student_ids_for_caller(db, current_user=current_user, tenant_id=tenant_id)
    if allowed_ids is not None:
        if student_id is not None:
            if str(student_id) not in allowed_ids:
                return GradeList(items=[], total=0, page=page, page_size=page_size, pages=1)
        elif len(allowed_ids) == 1:
            student_id = UUID(next(iter(allowed_ids)))
        elif not allowed_ids:
            return GradeList(items=[], total=0, page=page, page_size=page_size, pages=1)
        else:
            # Apply a single paginated query across all authorized children.
            # The previous per-child skip=0 calls returned first-page rows
            # again for page > 1 and could starve another child's grades.
            grades, total = crud_grade.get_grades(
                db=db, tenant_id=tenant_id,
                skip=(page - 1) * page_size, limit=page_size,
                student_ids={UUID(sid) for sid in allowed_ids},
                subject=subject, academic_year=academic_year,
                assessment_id=assessment_id, class_id=class_id,
            )
            return GradeList(
                items=grades, total=total, page=page, page_size=page_size,
                pages=math.ceil(total / page_size) if total else 1,
            )

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
    request: Request,
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
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    allowed_ids = _allowed_student_ids_for_caller(db, current_user=current_user, tenant_id=tenant_id)
    if allowed_ids is not None and str(student_id) not in allowed_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return crud_grade.get_student_average(
        db=db,
        student_id=student_id,
        tenant_id=tenant_id,
        academic_year=academic_year,
        semester=semester,
    )


@router.get("/{grade_id}/", response_model=Grade)
def get_grade(
    request: Request,
    grade_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
):
    """
    Get grade by ID

    Permissions: grades:read
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID required")
    grade = crud_grade.get_grade(db, grade_id, tenant_id)
    if not grade:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grade not found"
        )
    allowed_ids = _allowed_student_ids_for_caller(db, current_user=current_user, tenant_id=tenant_id)
    if allowed_ids is not None and str(grade.student_id) not in allowed_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not found")
    return grade


@router.post("/", response_model=Grade, status_code=status.HTTP_201_CREATED)
def create_grade(
    request: Request,
    grade: GradeCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:write")),
):
    """
    Create a new grade
    
    Permissions: grades:write
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID required")
    _validate_grade_fks(
        db, tenant_id=tenant_id, student_id=grade.student_id,
        subject_id=grade.subject_id, assessment_id=grade.assessment_id,
    )

    _require_teacher_grade_write_scope(
        db, tenant_id=tenant_id, current_user=current_user,
        student_id=grade.student_id, assessment_id=grade.assessment_id,
    )

    idem_key = request.headers.get("x-idempotency-key")
    request_body = grade.model_dump(mode="json")
    if idem_key:
        cached = get_idempotent_response_or_lock(
            db, tenant_id=tenant_id, user_id=current_user.get("id"), key=idem_key,
            method="POST", endpoint="/grades/", request_body=request_body,
        )
        if cached is not None:
            return cached[0]

    created = crud_grade.create_grade(db, grade, tenant_id)
    if idem_key:
        response_body = Grade.model_validate(created).model_dump(mode="json")
        store_idempotent_response(
            db, tenant_id=tenant_id, user_id=current_user.get("id"), key=idem_key,
            method="POST", endpoint="/grades/", request_body=request_body,
            response_body=response_body, status_code=201,
        )
    return created


@router.put("/{grade_id}/", response_model=Grade)
def update_grade(
    request: Request,
    grade_id: UUID,
    grade_update: GradeUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:write")),
):
    """
    Update a grade
    
    Permissions: grades:write
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID required")
    _validate_grade_fks(
        db, tenant_id=tenant_id, student_id=grade_update.student_id,
        subject_id=grade_update.subject_id, assessment_id=grade_update.assessment_id,
    )
    # Validate authorization for the existing row AND the final student /
    # assessment pair, so a teacher cannot transfer a grade to a class
    # outside their own or edit one that was never theirs.
    if is_scoped_teacher(current_user):
        current_grade = crud_grade.get_grade(db, grade_id, tenant_id)
        if not current_grade:
            raise HTTPException(status_code=404, detail="Grade not found")
        _require_teacher_grade_write_scope(
            db, tenant_id=tenant_id, current_user=current_user,
            student_id=current_grade.student_id, assessment_id=current_grade.assessment_id,
        )
        _require_teacher_grade_write_scope(
            db, tenant_id=tenant_id, current_user=current_user,
            student_id=grade_update.student_id or current_grade.student_id,
            assessment_id=grade_update.assessment_id or current_grade.assessment_id,
        )
        if grade_update.subject_id is not None and grade_update.subject_id != current_grade.subject_id:
            raise HTTPException(status_code=403, detail="Modification de matière réservée à l'administration")
    try:
        updated_grade = crud_grade.update_grade(
            db, grade_id, grade_update, tenant_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    if not updated_grade:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grade not found"
        )
    return updated_grade


@router.delete("/{grade_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_grade(
    request: Request,
    grade_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:write")),
):
    """
    Delete a grade
    
    Permissions: grades:write
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID required")
    if is_scoped_teacher(current_user):
        current_grade = crud_grade.get_grade(db, grade_id, tenant_id)
        if not current_grade:
            raise HTTPException(status_code=404, detail="Grade not found")
        _require_teacher_grade_write_scope(
            db, tenant_id=tenant_id, current_user=current_user,
            student_id=current_grade.student_id, assessment_id=current_grade.assessment_id,
        )
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
    request: Request,
    body: BulkGradesRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:write")),
):
    """
    Create multiple grades in a single request.
    POST /grades/bulk
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID required")

    # BUSINESS-RULE FIX (institutional-readiness audit, 2026-09): this
    # validated score against a hardcoded 0-100 range, but BulkGradeItem
    # never carries a max_score and the raw INSERT below never sets one
    # either — the `grades` table's own column default is 20.0 (see
    # 20260424_0003_ensure_core_table_columns.py), matching every other
    # grade in this app (GradeBase.max_score default, same 20.0). A score
    # of e.g. 85 passed this check yet produced a >400% grade once stored
    # against that real max_score, corrupting averages/transcripts.
    BULK_GRADE_DEFAULT_MAX_SCORE = 20.0
    for i, item in enumerate(body.grades):
        if item.score is not None and (item.score < 0 or item.score > BULK_GRADE_DEFAULT_MAX_SCORE):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Note #{i+1}: le score doit être entre 0 et {BULK_GRADE_DEFAULT_MAX_SCORE:g}"
            )
        _validate_grade_fks(
            db, tenant_id=tenant_id, student_id=item.student_id, assessment_id=item.assessment_id,
        )

        _require_teacher_grade_write_scope(
            db, tenant_id=tenant_id, current_user=current_user,
            student_id=item.student_id, assessment_id=item.assessment_id,
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
    request: Request,
    grade_id: Optional[str] = None,
    student_id: Optional[str] = None,
    ordering: str = "-created_at",
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
):
    """Return the audit trail of grade changes. GET /grades/history/"""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    where = ["gh.tenant_id = :tenant_id"]
    params: dict = {"tenant_id": tenant_id}

    # A grades:read grant alone is not tenant-wide authorization: students
    # can only inspect their own revisions; parents only their children's.
    # Apply this on the SQL query itself, including when filtering by grade_id.
    allowed_ids = _allowed_student_ids_for_caller(
        db, current_user=current_user, tenant_id=tenant_id,
    )
    if allowed_ids is not None:
        if not allowed_ids:
            return []
        if student_id is not None and str(student_id) not in allowed_ids:
            return []
        placeholders = []
        for index, allowed_id in enumerate(sorted(allowed_ids)):
            key = f"allowed_sid_{index}"
            params[key] = allowed_id
            placeholders.append(f":{key}")
        where.append(f"gh.student_id IN ({', '.join(placeholders)})")

    if grade_id:
        where.append("gh.grade_id = :grade_id")
        params["grade_id"] = grade_id
    if student_id:
        where.append("gh.student_id = :student_id")
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
