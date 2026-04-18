from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
import logging

from app.core.database import get_db
from app.core.security import require_permission
from app.crud import academic as crud_academic
from app.schemas.academic import Term, TermCreate, TermUpdate

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/", response_model=List[Term])
def list_terms(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """List all terms for the tenant."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    try:
        terms = crud_academic.get_terms(db, tenant_id=tenant_id)
        # Annotate each term with its academic year name
        from app.models.academic_year import AcademicYear
        result = []
        for t in terms:
            ay = db.query(AcademicYear).filter(AcademicYear.id == t.academic_year_id).first()
            term_dict = {
                "id": t.id,
                "tenant_id": t.tenant_id,
                "academic_year_id": t.academic_year_id,
                "academic_year": {"name": ay.name} if ay else None,
                "name": t.name,
                "start_date": t.start_date,
                "end_date": t.end_date,
                "sequence_number": t.sequence_number,
                "is_active": t.is_active,
                "created_at": t.created_at,
                "updated_at": t.updated_at,
            }
            result.append(term_dict)
        return result
    except Exception as e:
        logger.error("Error fetching terms: %s", e)
        return []

@router.get("/{term_id}/", response_model=Term)
def get_term(
    term_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get a specific term."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    term = crud_academic.get_term(db, term_id, tenant_id=tenant_id)
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
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    return crud_academic.create_term(db, term_in, tenant_id=tenant_id)

@router.put("/{term_id}/", response_model=Term)
def update_term(
    term_id: UUID,
    term_in: TermUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a term."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    term = crud_academic.update_term(db, term_id, term_in, tenant_id=tenant_id)
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
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    success = crud_academic.delete_term(db, term_id, tenant_id=tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Term not found")
    return None
