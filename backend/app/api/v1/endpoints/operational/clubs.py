import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.utils.audit import log_audit
from app.crud import club as crud_club
from app.schemas.club import (
    ClubCreate, ClubUpdate, ClubOut,
    ClubMembershipCreate, ClubMembershipOut,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _require_tenant(request: Request, current_user: dict, db: Session) -> UUID:
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    return tenant_id


# --- Clubs CRUD ---

@router.get("/", response_model=List[ClubOut])
def list_clubs(request: Request, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        return []
    return crud_club.get_clubs(db, tenant_id)


@router.post("/", response_model=ClubOut, status_code=status.HTTP_201_CREATED)
def create_club(
    request: Request,
    club: ClubCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new club."""
    tenant_id = _require_tenant(request, current_user, db)
    try:
        db_obj = crud_club.create_club(db, club, tenant_id)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_CLUB", resource_type="CLUB", resource_id=str(db_obj.id))
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception as e:
        db.rollback()
        logger.error("Error creating club: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.put("/{club_id}/", response_model=ClubOut)
def update_club(
    request: Request,
    club_id: UUID,
    club: ClubUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a club."""
    tenant_id = _require_tenant(request, current_user, db)
    if not any(v is not None for v in club.model_dump().values()):
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        db_obj = crud_club.get_club(db, club_id, tenant_id)
        if not db_obj:
            raise HTTPException(status_code=404, detail="Club not found")
        db_obj = crud_club.update_club(db, db_obj, club)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_CLUB", resource_type="CLUB", resource_id=str(club_id))
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating club: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


@router.delete("/{club_id}/")
def delete_club(
    request: Request,
    club_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a club."""
    tenant_id = _require_tenant(request, current_user, db)
    try:
        db_obj = crud_club.get_club(db, club_id, tenant_id)
        if not db_obj:
            raise HTTPException(status_code=404, detail="Club not found")
        crud_club.delete_club(db, db_obj)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_CLUB", resource_type="CLUB", resource_id=str(club_id))
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error deleting club: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to delete resource. Please try again.")


# --- Memberships ---

@router.get("/memberships/", response_model=List[ClubMembershipOut])
def list_memberships(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        return []
    return crud_club.get_memberships(db, tenant_id, page=page, page_size=page_size)


@router.post("/memberships/", response_model=ClubMembershipOut, status_code=status.HTTP_201_CREATED)
def add_club_member(
    request: Request,
    member: ClubMembershipCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Add a member to a club.

    Route fixée en migrant vers l'ORM : le frontend (src/pages/admin/Clubs.tsx)
    appelle POST /clubs/memberships/ avec club_id+student_id dans le corps
    depuis toujours, mais la route qui existait ici était
    POST /clubs/{club_id}/members/ (club_id dans l'URL) — un 404
    systématique, jamais réellement exercé en production (aucun autre
    consommateur de l'ancienne forme). Alignée sur le vrai contrat appelé.
    """
    tenant_id = _require_tenant(request, current_user, db)
    if not crud_club.get_club(db, member.club_id, tenant_id):
        raise HTTPException(status_code=404, detail="Club not found")
    try:
        db_obj = crud_club.add_club_member(db, member, tenant_id)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="ADD_CLUB_MEMBER", resource_type="CLUB_MEMBERSHIP",
                  resource_id=str(db_obj.id))
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception as e:
        db.rollback()
        logger.error("Error adding club member: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.delete("/memberships/{membership_id}/")
def remove_club_member(
    request: Request,
    membership_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Remove a member from a club (by membership id — see add_club_member docstring)."""
    tenant_id = _require_tenant(request, current_user, db)
    try:
        db_obj = crud_club.get_membership(db, membership_id, tenant_id)
        if not db_obj:
            raise HTTPException(status_code=404, detail="Membership not found")
        crud_club.remove_club_member(db, db_obj)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="REMOVE_CLUB_MEMBER", resource_type="CLUB_MEMBERSHIP",
                  resource_id=str(membership_id))
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error removing club member: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to delete resource. Please try again.")
