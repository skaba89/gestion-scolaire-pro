from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import text
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import require_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.crud import academic as crud
from app.schemas.academic import Semester, SemesterCreate, SemesterUpdate

router = APIRouter()


@router.get("/", response_model=List[Semester])
def read_semesters(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("terms:read")),
):
    """List semesters (LMD module — the university counterpart of terms)."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        return []
    return crud.get_semesters(db, tenant_id=tenant_id)


@router.post("/", response_model=Semester, status_code=status.HTTP_201_CREATED)
def create_semester(
    *,
    request: Request,
    db: Session = Depends(get_db),
    obj_in: SemesterCreate,
    current_user: dict = Depends(require_permission("terms:write")),
):
    """Create a new semester."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    return crud.create_semester(db, obj_in=obj_in, tenant_id=tenant_id)


@router.get("/{semester_id}/", response_model=Semester)
def read_semester(
    request: Request,
    semester_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("terms:read")),
):
    """Get a semester by ID."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    semester = crud.get_semester(db, semester_id=semester_id, tenant_id=tenant_id)
    if not semester:
        raise HTTPException(status_code=404, detail="Semester not found")
    return semester


@router.put("/{semester_id}/", response_model=Semester)
def update_semester(
    *,
    request: Request,
    db: Session = Depends(get_db),
    semester_id: UUID,
    obj_in: SemesterUpdate,
    current_user: dict = Depends(require_permission("terms:write")),
):
    """Update a semester."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    semester = crud.update_semester(db, semester_id=semester_id, obj_in=obj_in, tenant_id=tenant_id)
    if not semester:
        raise HTTPException(status_code=404, detail="Semester not found")
    return semester


@router.get("/{semester_id}/progression/{student_id}/")
def get_semester_progression_eligibility(
    request: Request,
    semester_id: UUID,
    student_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
):
    """Can `student_id` enroll in `semester_id`'s subjects yet? Lets the
    frontend show the credit-progression gate (app/services/progression.py)
    BEFORE the student attempts registration, rather than only surfacing it
    as a 422 from POST /student-subjects/.

    Ownership check reuses transcripts.py's own rule verbatim (same data
    sensitivity: a student's earned-credits detail) rather than duplicating
    a second, potentially diverging definition of "may view this student's
    academic standing".
    """
    from app.api.v1.endpoints.academic.transcripts import _can_view_transcript
    from app.services.progression import check_semester_progression_eligibility

    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Contexte établissement requis")

    student = db.execute(text(
        "SELECT id FROM students WHERE id = :sid AND tenant_id = :tid"
    ), {"sid": str(student_id), "tid": tenant_id}).first()
    if not student:
        raise HTTPException(status_code=404, detail="Élève/étudiant introuvable")
    if not _can_view_transcript(db, current_user=current_user, student_id=str(student_id), tenant_id=tenant_id):
        raise HTTPException(status_code=403, detail="Accès non autorisé")

    semester = crud.get_semester(db, semester_id=semester_id, tenant_id=tenant_id)
    if not semester:
        raise HTTPException(status_code=404, detail="Semester not found")

    return check_semester_progression_eligibility(
        db, tenant_id=tenant_id, student_id=str(student_id), target_semester_id=str(semester_id),
    )


@router.delete("/{semester_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_semester(
    *,
    request: Request,
    db: Session = Depends(get_db),
    semester_id: UUID,
    current_user: dict = Depends(require_permission("terms:write")),
):
    """Delete a semester."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    success = crud.delete_semester(db, semester_id=semester_id, tenant_id=tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Semester not found")
    return None
