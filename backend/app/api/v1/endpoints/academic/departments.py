from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user, require_permission, user_has_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.crud import academic as crud
from app.schemas.academic import Department, DepartmentCreate, DepartmentUpdate
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY/FUNCTIONAL FIX (institutional-readiness audit, 2026-09): every
# route here used to check settings:read/settings:write instead of the
# dedicated departments:read/departments:write permissions that already
# existed in ROLE_PERMISSIONS (app/core/security.py) — a "dead" granular
# permission nobody actually checked, same class of bug found in
# levels.py. It happened to work for TENANT_ADMIN/DIRECTOR only because
# they also hold settings:write, but DEPARTMENT_HEAD — a role the
# frontend describes as having "Gestion complète du département"
# (src/lib/permissions.ts, "department:own") — holds neither
# departments:write nor settings:write, so they could never edit even
# their own department.

@router.get("/", response_model=List[Department])
def read_departments(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("departments:read")),
):
    """Retrieve departments."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        return []
    return crud.get_departments(db, tenant_id=tenant_id)

@router.post("/", response_model=Department)
def create_department(
    *,
    request: Request,
    db: Session = Depends(get_db),
    obj_in: DepartmentCreate,
    current_user: dict = Depends(require_permission("departments:write")),
):
    """Create new department."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    return crud.create_department(db, obj_in=obj_in, tenant_id=tenant_id)

@router.get("/{dept_id}/", response_model=Department)
def read_department(
    request: Request,
    dept_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("departments:read")),
):
    """Get department by ID."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    dept = crud.get_department(db, dept_id=dept_id, tenant_id=tenant_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept

@router.put("/{dept_id}/", response_model=Department)
def update_department(
    *,
    request: Request,
    db: Session = Depends(get_db),
    dept_id: UUID,
    obj_in: DepartmentUpdate,
    current_user: dict = Depends(require_permission("departments:read")),
):
    """Update a department.

    departments:write holders (TENANT_ADMIN/DIRECTOR) may update any
    department. A departments:read-only holder (DEPARTMENT_HEAD) may only
    update the department they actually head — matching the frontend's
    "department:own" scoping — never an arbitrary one just because they
    happen to know its id.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    dept = crud.get_department(db, dept_id=dept_id, tenant_id=tenant_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    if not user_has_permission(current_user, "departments:write"):
        if str(dept.head_id) != str(current_user.get("id")):
            raise HTTPException(status_code=403, detail="Vous ne dirigez pas ce département")
    dept = crud.update_department(db, dept_id=dept_id, obj_in=obj_in, tenant_id=tenant_id)
    return dept

@router.delete("/{dept_id}/")
def delete_department(
    *,
    request: Request,
    db: Session = Depends(get_db),
    dept_id: UUID,
    current_user: dict = Depends(require_permission("departments:write")),
):
    """Delete a department."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    success = crud.delete_department(db, dept_id=dept_id, tenant_id=tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Department not found")
    return {"status": "success"}
