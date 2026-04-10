import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit

router = APIRouter()
logger = logging.getLogger(__name__)


# --- Schemas ---

class ClubCreate(BaseModel):
    name: str
    description: Optional[str] = None
    advisor_id: Optional[str] = None
    meeting_day: Optional[str] = None
    meeting_time: Optional[str] = None
    location: Optional[str] = None
    max_members: Optional[int] = None
    is_active: bool = True


class ClubUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    advisor_id: Optional[str] = None
    meeting_day: Optional[str] = None
    meeting_time: Optional[str] = None
    location: Optional[str] = None
    max_members: Optional[int] = None
    is_active: Optional[bool] = None


class AddMemberRequest(BaseModel):
    student_id: str
    role: Optional[str] = "MEMBER"


# --- Clubs CRUD ---

@router.get("/")
def list_clubs(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    rows = db.execute(text("""
        SELECT c.*, p.first_name as advisor_first_name, p.last_name as advisor_last_name
        FROM clubs c
        LEFT JOIN profiles p ON p.id = c.advisor_id
        WHERE c.tenant_id = :tid
        ORDER BY c.name
    """), {"tid": tenant_id}).fetchall()
    return [{
        **dict(r._mapping),
        "advisor": {"first_name": r.advisor_first_name, "last_name": r.advisor_last_name}
    } for r in rows]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_club(
    club: ClubCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new club."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            INSERT INTO clubs (id, tenant_id, name, description, advisor_id, meeting_day, meeting_time,
                               location, max_members, is_active, created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :name, :desc, :advisor, :mday, :mtime, :loc, :max, :active, NOW(), NOW())
            RETURNING id, tenant_id, name, description, advisor_id, meeting_day, meeting_time,
                      location, max_members, is_active, created_at, updated_at
        """), {
            "tid": tenant_id, "name": club.name, "desc": club.description,
            "advisor": club.advisor_id, "mday": club.meeting_day, "mtime": club.meeting_time,
            "loc": club.location, "max": club.max_members, "active": club.is_active,
        }).mappings().first()
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_CLUB", resource_type="CLUB", resource_id=str(result["id"]))
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating club: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{club_id}/")
def update_club(
    club_id: UUID,
    club: ClubUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a club."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        sets = []
        params = {"cid": str(club_id), "tid": tenant_id}
        field_map = {
            "name": club.name, "description": club.description,
            "advisor_id": club.advisor_id, "meeting_day": club.meeting_day,
            "meeting_time": club.meeting_time, "location": club.location,
            "max_members": club.max_members, "is_active": club.is_active,
        }
        for col, val in field_map.items():
            if val is not None:
                sets.append(f"{col} = :{col}")
                params[col] = val
        if not sets:
            raise HTTPException(status_code=400, detail="No fields to update")
        sets.append("updated_at = NOW()")
        query_str = f"""
            UPDATE clubs SET {', '.join(sets)}
            WHERE id = :cid AND tenant_id = :tid
            RETURNING id, tenant_id, name, description, advisor_id, meeting_day, meeting_time,
                      location, max_members, is_active, created_at, updated_at
        """
        result = db.execute(text(query_str), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Club not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_CLUB", resource_type="CLUB", resource_id=str(club_id))
        db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating club: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{club_id}/")
def delete_club(
    club_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a club."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        # Delete memberships first
        db.execute(text("DELETE FROM club_memberships WHERE club_id = :cid AND tenant_id = :tid"),
                   {"cid": str(club_id), "tid": tenant_id})
        result = db.execute(text("DELETE FROM clubs WHERE id = :cid AND tenant_id = :tid"),
                            {"cid": str(club_id), "tid": tenant_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Club not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_CLUB", resource_type="CLUB", resource_id=str(club_id))
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting club: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# --- Memberships ---

@router.get("/memberships/")
def list_memberships(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    rows = db.execute(text("""
        SELECT m.*, s.first_name, s.last_name
        FROM club_memberships m
        JOIN students s ON s.id = m.student_id
        WHERE m.tenant_id = :tid
    """), {"tid": tenant_id}).fetchall()
    return [{
        **dict(r._mapping),
        "student": {"id": r.student_id, "first_name": r.first_name, "last_name": r.last_name}
    } for r in rows]


@router.post("/{club_id}/members/", status_code=status.HTTP_201_CREATED)
def add_club_member(
    club_id: UUID,
    member: AddMemberRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Add a member to a club."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            INSERT INTO club_memberships (id, tenant_id, club_id, student_id, role, joined_at)
            VALUES (gen_random_uuid(), :tid, :cid, :sid, :role, NOW())
            RETURNING id, tenant_id, club_id, student_id, role, joined_at
        """), {
            "tid": tenant_id, "cid": str(club_id),
            "sid": member.student_id, "role": member.role or "MEMBER",
        }).mappings().first()
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="ADD_CLUB_MEMBER", resource_type="CLUB_MEMBERSHIP",
                  resource_id=str(result["id"]))
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding club member: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{club_id}/members/{user_id}/")
def remove_club_member(
    club_id: UUID,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Remove a member from a club."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            DELETE FROM club_memberships
            WHERE club_id = :cid AND student_id = :sid AND tenant_id = :tid
        """), {"cid": str(club_id), "sid": user_id, "tid": tenant_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Membership not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="REMOVE_CLUB_MEMBER", resource_type="CLUB_MEMBERSHIP",
                  resource_id=f"{club_id}/{user_id}")
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing club member: {e}")
        raise HTTPException(status_code=400, detail=str(e))
