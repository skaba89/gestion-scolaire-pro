"""Utilities for audit logging"""
import logging
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.audit_log import AuditLog
from typing import Optional, Any

logger = logging.getLogger(__name__)


def _report_audit_failure(exc: Exception, action: str, resource_type: str) -> None:
    """A lost audit row is a security event: log it loudly and send it to
    Sentry when configured — never drop it silently."""
    logger.error(
        "Audit log NOT recorded (action=%s resource_type=%s): %s",
        action, resource_type, exc,
    )
    try:
        import sentry_sdk

        sentry_sdk.capture_exception(exc)
    except Exception:  # Sentry absent or not initialised: the ERROR log above remains
        logger.debug("Sentry unavailable for audit failure report")


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

    Failure isolation (PostgreSQL): the caller's own pending changes are
    flushed first, OUTSIDE any savepoint — their errors stay the caller's
    and propagate. The audit row alone is then inserted inside a SAVEPOINT:
    if it is rejected (RLS WITH CHECK, constraint...), only the savepoint is
    rolled back, the error is reported (ERROR log + Sentry) and the caller's
    transaction stays usable. Previously the swallowed error left the whole
    transaction aborted, turning a refused audit row into a 500 on the main
    operation (incident 2026-10-08, platform tenant screen).
    """
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

    if settings.is_sqlite:
        # No RLS on SQLite (dev/tests), and pysqlite SAVEPOINTs need extra
        # driver hooks: keep the historical behaviour there.
        try:
            db.add(audit_entry)
            db.flush()
        except Exception as e:
            _report_audit_failure(e, action, resource_type)
        return

    db.flush()  # the caller's pending changes: never swallowed here
    try:
        with db.begin_nested():
            db.add(audit_entry)
            db.flush()
    except Exception as e:
        _report_audit_failure(e, action, resource_type)


def log_platform_audit(
    db: Session,
    actor_user_id: str,
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    details: Optional[Any] = None,
    ip_address: Optional[str] = None,
):
    """Record a platform-level operation (SUPER_ADMIN on a tenant) in
    `platform_audit_logs`, which survives the tenant (no tenant_id, no FK,
    no RLS — migration 20261011_0001). Written in the caller's transaction:
    if the operation is rolled back, so is its trace. Same failure isolation
    as log_audit()."""
    from app.models.platform_audit_log import PlatformAuditLog

    entry = PlatformAuditLog(
        actor_user_id=str(actor_user_id) if actor_user_id is not None else "unknown",
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        details=details,
        ip_address=ip_address,
    )
    if settings.is_sqlite:
        try:
            db.add(entry)
            db.flush()
        except Exception as e:
            _report_audit_failure(e, action, target_type)
        return

    db.flush()  # the caller's pending changes: never swallowed here
    try:
        with db.begin_nested():
            db.add(entry)
            db.flush()
    except Exception as e:
        _report_audit_failure(e, action, target_type)
