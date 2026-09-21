from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
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
