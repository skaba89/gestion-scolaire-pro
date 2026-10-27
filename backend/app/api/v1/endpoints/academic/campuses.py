from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import require_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.crud import academic as crud_academic
from app.models.campus import Campus as CampusModel
from app.models.tenant import Tenant
from app.services.plan_catalog import PLANS_BY_SLUG
from app.services.saas_quota_service import SaaSQuotaService
from app.schemas.academic import Campus, CampusCreate, CampusUpdate
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def _enforce_campus_limit(db: Session, tenant_id) -> None:
    """Grille du 2026-10-26 : Standard / Medium / Premium = un établissement,
    Entreprise = plusieurs (max_campuses de l'offre ; None = illimité).
    Sans ce contrôle, une offre Premium valait une offre Entreprise."""
    tenant = db.query(Tenant).filter(Tenant.id == str(tenant_id)).first()
    if tenant is None:
        return
    limit = SaaSQuotaService(db).get_limits(tenant).get("max_campuses")
    if limit is None:
        return
    count = db.query(CampusModel).filter(CampusModel.tenant_id == str(tenant_id)).count()
    if count >= limit:
        enterprise = PLANS_BY_SLUG["enterprise"]["name"]
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error_code": "PLAN_LIMIT_CAMPUSES",
                "message": (
                    f"Votre offre permet {limit} établissement(s) ({count} déjà créé(s)). "
                    f"Plusieurs établissements : offre {enterprise}, sur devis."
                ),
                "limit": limit,
                "current": count,
                "upgrade_url": "/admin/billing",
            },
        )

@router.get("/", response_model=List[Campus])
def list_campuses(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """List all campuses for the tenant."""
    resolved = resolve_current_tenant_id(request, current_user, db)
    if not resolved:
        return []
    tenant_id = str(resolved)
    return crud_academic.get_campuses(db, tenant_id=tenant_id)

@router.get("/{campus_id}/", response_model=Campus)
def get_campus(
    request: Request,
    campus_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get a specific campus."""
    resolved = resolve_current_tenant_id(request, current_user, db)
    if not resolved:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    tenant_id = str(resolved)
    campus = crud_academic.get_campus(db, campus_id, tenant_id=tenant_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    return campus

@router.post("/", response_model=Campus, status_code=status.HTTP_201_CREATED)
def create_campus(
    request: Request,
    campus_in: CampusCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new campus."""
    resolved = resolve_current_tenant_id(request, current_user, db)
    if not resolved:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    tenant_id = str(resolved)
    _enforce_campus_limit(db, tenant_id)
    return crud_academic.create_campus(db, campus_in, tenant_id=tenant_id)

@router.put("/{campus_id}/", response_model=Campus)
def update_campus(
    request: Request,
    campus_id: UUID,
    campus_in: CampusUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a campus."""
    resolved = resolve_current_tenant_id(request, current_user, db)
    if not resolved:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    tenant_id = str(resolved)
    campus = crud_academic.update_campus(db, campus_id, campus_in, tenant_id=tenant_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    return campus

@router.delete("/{campus_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_campus(
    request: Request,
    campus_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a campus."""
    resolved = resolve_current_tenant_id(request, current_user, db)
    if not resolved:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    tenant_id = str(resolved)
    success = crud_academic.delete_campus(db, campus_id, tenant_id=tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Campus not found")
    return None
