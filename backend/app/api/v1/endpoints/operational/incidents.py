from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user, require_permission

router = APIRouter()

@router.get("/")
def list_incidents(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    rows = db.execute(text("""
        SELECT i.*, 
               u1.first_name as reporter_first_name, u1.last_name as reporter_last_name,
               u2.first_name as resolver_first_name, u2.last_name as resolver_last_name
        FROM incidents i
        LEFT JOIN users u1 ON u1.id = i.reported_by
        LEFT JOIN users u2 ON u2.id = i.resolved_by
        WHERE i.tenant_id = :tid
        ORDER BY i.occurred_at DESC
    """), {"tid": tenant_id}).fetchall()
    
    # In a real app we'd also fetch involved parties and actions separately
    return [{
        **dict(r._mapping),
        "reporter": {"first_name": r.reporter_first_name, "last_name": r.reporter_last_name},
        "resolver": {"first_name": r.resolver_first_name, "last_name": r.resolver_last_name},
        "parties": [], # Placeholder
        "actions": []  # Placeholder
    } for r in rows]
