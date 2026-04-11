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
    """
    try:
        audit_entry = AuditLog(
            user_id=user_id,
            tenant_id=tenant_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
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
