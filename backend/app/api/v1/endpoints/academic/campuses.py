from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import require_permission
from app.crud import academic as crud_academic
from app.schemas.academic import Campus, CampusCreate, CampusUpdate

router = APIRouter()

@router.get("/", response_model=List[Campus])
def list_campuses(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """List all campuses for the tenant."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    return crud_academic.get_campuses(db, tenant_id=tenant_id)

@router.get("/{campus_id}/", response_model=Campus)
def get_campus(
    campus_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get a specific campus."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    campus = crud_academic.get_campus(db, campus_id, tenant_id=tenant_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    return campus

@router.post("/", response_model=Campus, status_code=status.HTTP_201_CREATED)
def create_campus(
    campus_in: CampusCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new campus."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    return crud_academic.create_campus(db, campus_in, tenant_id=tenant_id)

@router.put("/{campus_id}/", response_model=Campus)
def update_campus(
    campus_id: UUID,
    campus_in: CampusUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a campus."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    campus = crud_academic.update_campus(db, campus_id, campus_in, tenant_id=tenant_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    return campus

@router.delete("/{campus_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_campus(
    campus_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a campus."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    success = crud_academic.delete_campus(db, campus_id, tenant_id=tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Campus not found")
    return None
