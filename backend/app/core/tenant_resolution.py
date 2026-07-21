"""Shared tenant-id resolution for tenant-scoped endpoints.

``get_current_user()`` already resolves ``tenant_id`` fresh from the database
on every request, and already injects ``X-Tenant-ID`` for SUPER_ADMIN users
with no tenant of their own. This helper exists to remove the ~7 near-identical
copies of "if not tenant_id: look it up again; validate UUID; check the tenant
exists" that had accumulated across ``tenants.py`` — each one slightly
different, easy to get wrong when adding a new endpoint. It adds one more
safety net (an explicit ownership check) as defense in depth, not as a fix
for a reachable cross-tenant bug: a non-SUPER_ADMIN's ``tenant_id`` always
comes straight from their own user row, so it cannot already point at another
tenant.
"""
from uuid import UUID

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.models import Tenant, User


def resolve_current_tenant_id(
    request: Request,
    current_user: dict,
    db: Session,
) -> UUID:
    """Resolve and validate the tenant_id the current request should act on.

    Order: ``current_user["tenant_id"]`` (already DB-fresh) -> ``X-Tenant-ID``
    header for SUPER_ADMIN -> one more DB lookup by user id as a last resort.

    Raises:
        400 if no tenant_id can be resolved, or it isn't a valid UUID.
        404 if the resolved tenant doesn't exist.
        403 if a non-SUPER_ADMIN's resolved tenant_id isn't their own.
    """
    roles = current_user.get("roles", []) or []
    is_super_admin = "SUPER_ADMIN" in roles

    tenant_id = current_user.get("tenant_id")

    if not tenant_id and is_super_admin:
        header_tid = request.headers.get("X-Tenant-ID")
        if header_tid:
            tenant_id = header_tid

    if not tenant_id:
        user_id = current_user.get("id")
        user_db = db.query(User).filter(User.id == user_id).first() if user_id else None
        if user_db and user_db.tenant_id:
            tenant_id = str(user_db.tenant_id)

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant introuvable. Veuillez vous reconnecter via l'URL de votre établissement.",
        )

    try:
        tenant_uuid = UUID(str(tenant_id))
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID tenant invalide")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_uuid).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Établissement introuvable")

    if not is_super_admin:
        caller_tenant_id = str(current_user.get("tenant_id") or "")
        if caller_tenant_id and caller_tenant_id != str(tenant_uuid):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vous ne pouvez agir que sur votre propre établissement.",
            )

    return tenant_uuid
