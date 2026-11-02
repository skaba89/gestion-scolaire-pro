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


# ─── Événements d'authentification (source de vérité serveur) ──────────────
#
# Écrits par le serveur uniquement (jamais par le navigateur : les entrées
# client sont préfixées CLIENT_, voir endpoints/core/audit.py). Validés
# (commit) immédiatement : la trace d'un échec de connexion doit survivre à
# la 401 levée juste après, que get_db() annule.
AUTH_LOGIN_SUCCESS = "LOGIN_SUCCESS"
AUTH_LOGIN_FAILED = "LOGIN_FAILED"
AUTH_MFA_FAILED = "MFA_FAILED"
AUTH_LOGOUT = "LOGOUT"
AUTH_LOGOUT_ALL = "LOGOUT_ALL"
AUTH_SESSION_REVOKED = "SESSION_REVOKED"
AUTH_SESSION_EVICTED = "SESSION_EVICTED"
AUTH_PASSWORD_CHANGED = "PASSWORD_CHANGED"

AUTH_EVENT_ACTIONS = (
    AUTH_LOGIN_SUCCESS, AUTH_LOGIN_FAILED, AUTH_MFA_FAILED, AUTH_LOGOUT,
    AUTH_LOGOUT_ALL, AUTH_SESSION_REVOKED, AUTH_SESSION_EVICTED, AUTH_PASSWORD_CHANGED,
)


def record_auth_event(
    db: Session,
    *,
    request,
    user_id: str,
    tenant_id: Optional[str],
    action: str,
    severity: str = "INFO",
    details: Optional[dict] = None,
    actor_user_id: Optional[str] = None,
) -> None:
    """Journalise un événement d'authentification et le valide aussitôt.

    - ``user_id`` : le compte concerné (resource_id) ; ``actor_user_id`` :
      qui agit, s'il diffère (administrateur révoquant la session d'un autre).
    - Compte d'établissement → ``audit_logs`` sous le contexte RLS de son
      tenant ; compte plateforme (tenant NULL) → ``platform_audit_logs``.
    - Un échec d'écriture est signalé (ERROR + Sentry) sans bloquer
      l'authentification : la sécurité du compte ne dépend pas du journal.
    """
    from app.core.client_ip import get_client_ip
    from app.core.database import switch_tenant_context

    ip = None
    user_agent = None
    if request is not None:
        try:
            ip = get_client_ip(request)
        except Exception as exc:  # adresse indéterminable : l'événement reste utile
            logger.warning("Auth audit: client IP unavailable: %s", exc)
        user_agent = (request.headers.get("user-agent") or "")[:512] or None

    actor = str(actor_user_id or user_id)
    payload = dict(details or {})
    try:
        if tenant_id:
            if not settings.is_sqlite:
                switch_tenant_context(db, str(tenant_id))
            log_audit(
                db,
                user_id=actor,
                tenant_id=tenant_id,
                action=action,
                resource_type="AUTH",
                resource_id=str(user_id),
                details=payload or None,
                ip_address=ip,
                severity=severity,
                user_agent=user_agent,
            )
        else:
            payload.setdefault("severity", severity)
            if user_agent:
                payload.setdefault("user_agent", user_agent)
            log_platform_audit(
                db,
                actor_user_id=actor,
                action=action,
                target_type="AUTH",
                target_id=str(user_id),
                details=payload,
                ip_address=ip,
            )
        db.commit()
    except Exception as exc:
        db.rollback()
        _report_audit_failure(exc, action, "AUTH")
