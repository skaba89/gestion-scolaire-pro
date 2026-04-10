from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID

from app.core.database import get_db
from app.core.security import require_permission
from app.crud import academic as crud_academic
from app.schemas.academic import Level, LevelCreate, LevelUpdate, Subject

router = APIRouter()

@router.get("/", response_model=List[Level])
def list_levels(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """List all levels for the tenant."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    return crud_academic.get_levels(db, tenant_id=tenant_id)

@router.get("/{level_id}/", response_model=Level)
def get_level(
    level_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get a specific level."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    level = crud_academic.get_level(db, level_id, tenant_id=tenant_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    return level

@router.post("/", response_model=Level, status_code=status.HTTP_201_CREATED)
def create_level(
    level_in: LevelCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new level."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    return crud_academic.create_level(db, level_in, tenant_id=tenant_id)

@router.put("/{level_id}/", response_model=Level)
def update_level(
    level_id: UUID,
    level_in: LevelUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a level."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    level = crud_academic.update_level(db, level_id, level_in, tenant_id=tenant_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    return level

@router.delete("/{level_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_level(
    level_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a level."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    success = crud_academic.delete_level(db, level_id, tenant_id=tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Level not found")
    return None


@router.get("/{level_id}/subjects/", response_model=List[Subject])
def get_level_subjects(
    level_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get subjects associated with a specific level."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    # Verify level exists
    level = crud_academic.get_level(db, level_id, tenant_id=tenant_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    # Fetch subjects linked to this level via subject_levels association table
    subjects = [dict(r) for r in db.execute(text("""
        SELECT s.*
        FROM subjects s
        JOIN subject_levels sl ON sl.subject_id = s.id
        WHERE sl.level_id = :lid AND s.tenant_id = :tid
        ORDER BY s.name
    """), {"lid": str(level_id), "tid": tenant_id}).mappings().all()]
    return subjects
