from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import require_permission
from app.crud import academic as crud_academic
from app.schemas.academic import Level, LevelCreate, LevelUpdate

router = APIRouter()

@router.get("/", response_model=List[Level])
def list_levels(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """List all levels for the tenant."""
    return crud_academic.get_levels(db, tenant_id=current_user["tenant_id"])

@router.get("/{level_id}/", response_model=Level)
def get_level(
    level_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get a specific level."""
    level = crud_academic.get_level(db, level_id, tenant_id=current_user["tenant_id"])
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
    return crud_academic.create_level(db, level_in, tenant_id=current_user["tenant_id"])

@router.put("/{level_id}/", response_model=Level)
def update_level(
    level_id: UUID,
    level_in: LevelUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a level."""
    level = crud_academic.update_level(db, level_id, level_in, tenant_id=current_user["tenant_id"])
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
    success = crud_academic.delete_level(db, level_id, tenant_id=current_user["tenant_id"])
    if not success:
        raise HTTPException(status_code=404, detail="Level not found")
    return None
