from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import require_permission
from app.crud import academic as crud_academic
from app.schemas.academic import Term, TermCreate, TermUpdate

router = APIRouter()

@router.get("/", response_model=List[Term])
def list_terms(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """List all terms for the tenant."""
    return crud_academic.get_terms(db, tenant_id=current_user["tenant_id"])

@router.get("/{term_id}/", response_model=Term)
def get_term(
    term_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get a specific term."""
    term = crud_academic.get_term(db, term_id, tenant_id=current_user["tenant_id"])
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")
    return term

@router.post("/", response_model=Term, status_code=status.HTTP_201_CREATED)
def create_term(
    term_in: TermCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new term."""
    return crud_academic.create_term(db, term_in, tenant_id=current_user["tenant_id"])

@router.put("/{term_id}/", response_model=Term)
def update_term(
    term_id: UUID,
    term_in: TermUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a term."""
    term = crud_academic.update_term(db, term_id, term_in, tenant_id=current_user["tenant_id"])
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")
    return term

@router.delete("/{term_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_term(
    term_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a term."""
    success = crud_academic.delete_term(db, term_id, tenant_id=current_user["tenant_id"])
    if not success:
        raise HTTPException(status_code=404, detail="Term not found")
    return None
