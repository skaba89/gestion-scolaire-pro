from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.core.security import require_permission
from app.schemas.audit import AuditLog
import logging

logger = logging.getLogger(__name__)

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
    severity: Optional[str] = None,
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
    if severity:
        where_clauses.append("severity = :severity")
        params["severity"] = severity.upper()

    where_sql = " AND ".join(where_clauses)
    sql = text(f"""
        SELECT id, tenant_id, user_id, action, COALESCE(severity, 'INFO') as severity,
               resource_type, resource_id, details, ip_address, user_agent, created_at
        FROM audit_logs
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """)

    rows = db.execute(sql, params).mappings().all()
    return rows


# ─── Audit log creation (POST /audit/ and POST /audit/log) ────────────────────

class AuditLogCreate(BaseModel):
    user_id: Optional[str] = None
    action: str
    severity: Optional[str] = "INFO"
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


@router.post("/", status_code=201)
def create_audit_log(
    body: AuditLogCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:write")),
):
    """Create a new audit log entry. POST /audit/"""
    import json
    tenant_id = current_user.get("tenant_id")
    user_id = body.user_id or current_user.get("id")
    row = db.execute(text("""
        INSERT INTO audit_logs (tenant_id, user_id, action, severity, resource_type, resource_id, details, ip_address, user_agent, created_at)
        VALUES (:tenant_id, :user_id, :action, :severity, :resource_type, :resource_id, :details, :ip_address, :user_agent, NOW())
        RETURNING id, tenant_id, user_id, action, COALESCE(severity, 'INFO') as severity, resource_type, resource_id, details, ip_address, user_agent, created_at
    """), {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "action": body.action,
        "severity": body.severity or "INFO",
        "resource_type": body.resource_type,
        "resource_id": body.resource_id,
        "details": json.dumps(body.details) if body.details else None,
        "ip_address": body.ip_address,
        "user_agent": body.user_agent,
    }).mappings().first()
    db.commit()
    return dict(row)


@router.post("/log", status_code=201)
def create_audit_log_alias(
    body: AuditLogCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:write")),
):
    """Create a new audit log entry. POST /audit/log — alias for POST /audit/"""
    import json
    tenant_id = current_user.get("tenant_id")
    user_id = body.user_id or current_user.get("id")
    row = db.execute(text("""
        INSERT INTO audit_logs (tenant_id, user_id, action, severity, resource_type, resource_id, details, ip_address, user_agent, created_at)
        VALUES (:tenant_id, :user_id, :action, :severity, :resource_type, :resource_id, :details, :ip_address, :user_agent, NOW())
        RETURNING id, tenant_id, user_id, action, COALESCE(severity, 'INFO') as severity, resource_type, resource_id, details, ip_address, user_agent, created_at
    """), {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "action": body.action,
        "severity": body.severity or "INFO",
        "resource_type": body.resource_type,
        "resource_id": body.resource_id,
        "details": json.dumps(body.details) if body.details else None,
        "ip_address": body.ip_address,
        "user_agent": body.user_agent,
    }).mappings().first()
    db.commit()
    return dict(row)
