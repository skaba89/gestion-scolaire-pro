from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import require_permission
from app.crud import academic as crud_academic
from app.schemas.academic import Subject, SubjectCreate, SubjectUpdate
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/", response_model=List[Subject])
def list_subjects(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """List all subjects for the tenant."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    return crud_academic.get_subjects(db, tenant_id=tenant_id)

@router.get("/{subject_id}/", response_model=Subject)
def get_subject(
    subject_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get a specific subject."""
    subject = crud_academic.get_subject(db, subject_id, tenant_id=current_user.get("tenant_id"))
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject

@router.post("/", response_model=Subject, status_code=status.HTTP_201_CREATED)
def create_subject(
    subject_in: SubjectCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new subject."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    return crud_academic.create_subject(db, subject_in, tenant_id=tenant_id)

@router.put("/{subject_id}/", response_model=Subject)
def update_subject(
    subject_id: UUID,
    subject_in: SubjectUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a subject."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    subject = crud_academic.update_subject(db, subject_id, subject_in, tenant_id=tenant_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject

@router.delete("/{subject_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a subject."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    success = crud_academic.delete_subject(db, subject_id, tenant_id=tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Subject not found")
    return None

@router.get("/{subject_id}/levels/")
def get_subject_levels(
    subject_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get all levels associated with a subject."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    from app.models.associations import subject_levels
    rows = db.execute(subject_levels.select().where(
        (subject_levels.c.subject_id == subject_id) & (subject_levels.c.tenant_id == tenant_id)
    )).fetchall()
    return [str(r.level_id) for r in rows]

@router.get("/{subject_id}/departments/")
def get_subject_departments(
    subject_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get all departments associated with a subject."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    from app.models.associations import subject_departments
    rows = db.execute(subject_departments.select().where(
        (subject_departments.c.subject_id == subject_id) & (subject_departments.c.tenant_id == tenant_id)
    )).fetchall()
    return [str(r.department_id) for r in rows]

@router.post("/{subject_id}/levels/{level_id}/")
def assign_subject_to_level(
    subject_id: UUID,
    level_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Assign a subject to a level."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    from app.models.associations import subject_levels
    db.execute(subject_levels.insert().values(
        tenant_id=tenant_id,
        subject_id=subject_id,
        level_id=level_id
    ))
    db.commit()
    return {"status": "success"}

@router.delete("/{subject_id}/levels/{level_id}/")
def remove_subject_from_level(
    subject_id: UUID,
    level_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Remove a subject from a level."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    from app.models.associations import subject_levels
    db.execute(subject_levels.delete().where(
        (subject_levels.c.subject_id == subject_id) & 
        (subject_levels.c.level_id == level_id) & 
        (subject_levels.c.tenant_id == tenant_id)
    ))
    db.commit()
    return {"status": "success"}
