from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user, require_permission

router = APIRouter()

@router.get("/")
def list_categories(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    return db.execute(text("SELECT * FROM library_categories WHERE tenant_id = :tid ORDER BY name"), {"tid": tenant_id}).mappings().all()

@router.get("/resources/")
def list_resources(
    category: Optional[str] = None,
    resource_type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    tenant_id = current_user["tenant_id"]
    query = """
        SELECT r.*, c.name as category_name, c.color as category_color,
               u.first_name as uploader_first_name, u.last_name as uploader_last_name
        FROM library_resources r
        LEFT JOIN library_categories c ON c.id = r.category_id
        LEFT JOIN users u ON u.id = r.uploaded_by
        WHERE r.tenant_id = :tid
    """
    params = {"tid": tenant_id}
    if category and category != "all":
        query += " AND r.category_id = :cid"
        params["cid"] = category
    if resource_type and resource_type != "all":
        query += " AND r.resource_type = :rtype"
        params["rtype"] = resource_type
    if search:
        query += " AND (r.title ILIKE :s OR r.description ILIKE :s OR r.author ILIKE :s)"
        params["s"] = f"%{search}%"
    
    query += " ORDER BY r.created_at DESC"
    rows = db.execute(text(query), params).fetchall()
    return [{
        **dict(r._mapping),
        "category": {"id": r.category_id, "name": r.category_name, "color": r.category_color},
        "uploader": {"first_name": r.uploader_first_name, "last_name": r.uploader_last_name}
    } for r in rows]
