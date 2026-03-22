from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.core.security import require_permission
from app.schemas.audit import AuditLog

router = APIRouter()

@router.get("/", response_model=List[AuditLog])
def list_audit_logs(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
):
    """List audit logs for the current tenant with filtering and pagination."""
    tenant_id = current_user.get("tenant_id")
    offset = (page - 1) * page_size
    
    where_clauses = ["tenant_id = :tenant_id"]
    params = {"tenant_id": tenant_id, "limit": page_size, "offset": offset}
    
    if user_id:
        where_clauses.append("user_id = :user_id")
        params["user_id"] = user_id
    if action:
        where_clauses.append("action = :action")
        params["action"] = action
    if resource_type:
        where_clauses.append("resource_type = :resource_type")
        params["resource_type"] = resource_type

    where_sql = " AND ".join(where_clauses)
    sql = text(f"""
        SELECT id, tenant_id, user_id, action, resource_type, resource_id, details, ip_address, created_at
        FROM audit_logs
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    
    rows = db.execute(sql, params).mappings().all()
    return rows
