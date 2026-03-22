from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user, require_permission

router = APIRouter()

@router.get("/")
def list_clubs(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
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

@router.get("/memberships/")
def list_memberships(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
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
