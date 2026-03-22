from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.crud import academic as crud
from app.schemas.academic import Department, DepartmentCreate, DepartmentUpdate

router = APIRouter()

@router.get("/", response_model=List[Department])
def read_departments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Retrieve departments."""
    return crud.get_departments(db, tenant_id=current_user.get("tenant_id"))

@router.post("/", response_model=Department)
def create_department(
    *,
    db: Session = Depends(get_db),
    obj_in: DepartmentCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create new department."""
    return crud.create_department(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))

@router.get("/{dept_id}/", response_model=Department)
def read_department(
    dept_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get department by ID."""
    dept = crud.get_department(db, dept_id=dept_id, tenant_id=current_user.get("tenant_id"))
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept

@router.put("/{dept_id}/", response_model=Department)
def update_department(
    *,
    db: Session = Depends(get_db),
    dept_id: UUID,
    obj_in: DepartmentUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update a department."""
    dept = crud.update_department(db, dept_id=dept_id, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept

@router.delete("/{dept_id}/")
def delete_department(
    *,
    db: Session = Depends(get_db),
    dept_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """Delete a department."""
    success = crud.delete_department(db, dept_id=dept_id, tenant_id=current_user.get("tenant_id"))
    if not success:
        raise HTTPException(status_code=404, detail="Department not found")
    return {"status": "success"}
