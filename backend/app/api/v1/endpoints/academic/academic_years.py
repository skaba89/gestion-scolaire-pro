import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import require_permission
from app.crud import academic as crud_academic
from app.schemas.academic import AcademicYear, AcademicYearCreate, AcademicYearUpdate

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/", response_model=List[AcademicYear])
def list_academic_years(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """List all academic years for the tenant."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        logger.warning("No tenant_id found in current_user")
        return []
    
    try:
        return crud_academic.get_academic_years(db, tenant_id=tenant_id)
    except Exception as e:
        logger.error("Error listing academic years: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch academic years"
        )

@router.get("/{ay_id}/", response_model=AcademicYear)
def get_academic_year(
    ay_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get a specific academic year."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    ay = crud_academic.get_academic_year(db, ay_id, tenant_id=tenant_id)
    if not ay:
        raise HTTPException(status_code=404, detail="Academic year not found")
    return ay

@router.post("/", response_model=AcademicYear, status_code=status.HTTP_201_CREATED)
def create_academic_year(
    ay_in: AcademicYearCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new academic year."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    return crud_academic.create_academic_year(db, ay_in, tenant_id=tenant_id)

@router.put("/{ay_id}/", response_model=AcademicYear)
def update_academic_year(
    ay_id: UUID,
    ay_in: AcademicYearUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update an academic year."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    ay = crud_academic.update_academic_year(db, ay_id, ay_in, tenant_id=tenant_id)
    if not ay:
        raise HTTPException(status_code=404, detail="Academic year not found")
    return ay

@router.delete("/{ay_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_academic_year(
    ay_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete an academic year."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    success = crud_academic.delete_academic_year(db, ay_id, tenant_id=tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Academic year not found")
    return None
