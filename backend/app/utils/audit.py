"""Utilities for audit logging"""
import logging
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from typing import Optional, Any

logger = logging.getLogger(__name__)

def log_audit(
    db: Session,
    user_id: str,
    tenant_id: str,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Optional[Any] = None,
    ip_address: Optional[str] = None,
    severity: Optional[str] = "INFO",
    user_agent: Optional[str] = None
):
    """
    Helper function to record an audit log entry.

    user_id/resource_id are String(255) columns with no type converter
    (unlike tenant_id, which goes through TenantMixin's GUID type). Call
    sites across the codebase sometimes pass a raw uuid.UUID object (e.g.
    a FastAPI path param typed `UUID`, or a model's `.id`) instead of a
    string. That silently works on PostgreSQL (psycopg adapts UUID objects
    for text columns) but raises `sqlite3.ProgrammingError: Error binding
    parameter` on SQLite, and is fragile either way — normalize once here
    rather than requiring every caller to remember `str(...)`.
    """
    try:
        audit_entry = AuditLog(
            user_id=str(user_id) if user_id is not None else None,
            tenant_id=tenant_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            details=details,
            ip_address=ip_address,
            severity=severity,
            user_agent=user_agent
        )
        db.add(audit_entry)
        db.flush() # Ensure it's prepared within the transaction
    except Exception as e:
        # We don't want audit logging to crash the main operation
        logger.error("Error recording audit log: %s", e)
