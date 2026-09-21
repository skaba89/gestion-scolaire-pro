from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import require_permission, user_has_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.crud import academic as crud
from app.schemas.academic import Faculty, FacultyCreate, FacultyUpdate

router = APIRouter()


@router.get("/", response_model=List[Faculty])
def read_faculties(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("faculties:read")),
):
    """Retrieve faculties (top-level academic divisions, LMD module)."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        return []
    return crud.get_faculties(db, tenant_id=tenant_id)


@router.post("/", response_model=Faculty, status_code=status.HTTP_201_CREATED)
def create_faculty(
    *,
    request: Request,
    db: Session = Depends(get_db),
    obj_in: FacultyCreate,
    current_user: dict = Depends(require_permission("faculties:write")),
):
    """Create a new faculty."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    return crud.create_faculty(db, obj_in=obj_in, tenant_id=tenant_id)


@router.get("/{faculty_id}/", response_model=Faculty)
def read_faculty(
    request: Request,
    faculty_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("faculties:read")),
):
    """Get faculty by ID."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    faculty = crud.get_faculty(db, faculty_id=faculty_id, tenant_id=tenant_id)
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty not found")
    return faculty


@router.put("/{faculty_id}/", response_model=Faculty)
def update_faculty(
    *,
    request: Request,
    db: Session = Depends(get_db),
    faculty_id: UUID,
    obj_in: FacultyUpdate,
    current_user: dict = Depends(require_permission("faculties:read")),
):
    """Update a faculty.

    faculties:write holders (TENANT_ADMIN/DIRECTOR) may update any faculty.
    A faculties:read-only holder (DEPARTMENT_HEAD, if their department sits
    under this faculty) has no write path at all yet — same scoping choice
    as departments.py: DEPARTMENT_HEAD manages their own department, not
    the faculty above it.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    faculty = crud.get_faculty(db, faculty_id=faculty_id, tenant_id=tenant_id)
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty not found")
    if not user_has_permission(current_user, "faculties:write"):
        raise HTTPException(status_code=403, detail="Modification de faculté non autorisée")
    return crud.update_faculty(db, faculty_id=faculty_id, obj_in=obj_in, tenant_id=tenant_id)


@router.delete("/{faculty_id}/")
def delete_faculty(
    *,
    request: Request,
    db: Session = Depends(get_db),
    faculty_id: UUID,
    current_user: dict = Depends(require_permission("faculties:write")),
):
    """Delete a faculty."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    success = crud.delete_faculty(db, faculty_id=faculty_id, tenant_id=tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Faculty not found")
    return {"status": "success"}
