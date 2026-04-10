"""Utilities for audit logging"""
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from typing import Optional, Any

def log_audit(
    db: Session,
    user_id: str,
    tenant_id: str,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Optional[Any] = None,
    ip_address: Optional[str] = None
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
            ip_address=ip_address
        )
        db.add(audit_entry)
        db.flush() # Ensure it's prepared within the transaction
    except Exception as e:
        # We don't want audit logging to crash the main operation
        print(f"Error recording audit log: {e}")
