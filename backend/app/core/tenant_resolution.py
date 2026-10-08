"""Shared tenant-id resolution for tenant-scoped endpoints.

This helper centralizes tenant resolution and ownership validation to keep
all tenant-scoped endpoints consistent and reduce cross-tenant access risk.
"""
import time
from typing import Callable, Iterable, TypeVar
from uuid import UUID

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import (
    TenantContextError,
    log_slow_tenant_sweep,
    reset_tenant_context,
    switch_tenant_context,
)
from app.models import Tenant, User

_T = TypeVar("_T")


def enter_tenant_context_or_404(db: Session, tenant_id) -> str:
    """Position this request's RLS context on a tenant the route has ALREADY
    resolved authentically — for routes TenantMiddleware exempts from its
    JWT-based context (public pages, public enrollment portal, kiosk scan,
    payment webhooks, onboarding, tenant creation).

    Such routes otherwise run with NO tenant context, and under the
    restricted runtime role (NOSUPERUSER NOBYPASSRLS, in production since
    2026-10-05) every strict RLS policy then hides the tenant's rows and
    rejects its writes (incident of 2026-10-07: public levels returned [],
    kiosk scans and payment webhooks found nothing, tenant creation failed).

    Never derive `tenant_id` from unauthenticated input alone without the
    route's own check (active tenant by slug, device token, gateway
    verification...): this only re-applies RLS to a tenant already chosen.
    Unknown or malformed tenant -> 404 (never 500, never "no tenant").
    """
    try:
        return switch_tenant_context(db, str(tenant_id))
    except TenantContextError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Établissement introuvable.")


def collect_across_all_tenants(db: Session, query_fn: Callable[[Session], Iterable[_T]]) -> list[_T]:
    """Platform-wide READ for SUPER_ADMIN dashboards (billing requests,
    SaaS metrics): run `query_fn` once per tenant, each time under that
    tenant's own RLS context, and concatenate the results.

    A platform role acting with no X-Tenant-ID has NO tenant context, so a
    single cross-tenant query on a strict table returns nothing under the
    restricted runtime role (NOBYPASSRLS) — e.g. pending subscription
    requests could not be listed or confirmed (follow-up of #277).

    `query_fn` must fully materialize what it needs (dicts, scalars, or ORM
    rows whose attributes it already read) — lazy loads after the switch
    would run under another tenant's context. The context is always reset
    to "no tenant" afterwards. SQLite (no RLS): a single plain call.
    """
    if settings.is_sqlite:
        return list(query_fn(db))
    results: list[_T] = []
    started = time.monotonic()
    tenant_ids = db.query(Tenant.id).all()
    try:
        for (tenant_id,) in tenant_ids:
            switch_tenant_context(db, str(tenant_id))
            results.extend(query_fn(db))
    finally:
        reset_tenant_context(db)
        log_slow_tenant_sweep("collect_across_all_tenants", len(tenant_ids), started)
    return results


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


def resolve_optional_tenant_settings_context(
    request: Request,
    current_user: dict,
    db: Session,
):
    """Like resolve_current_tenant_id, but returns None instead of raising
    when a SUPER_ADMIN has no tenant context at all (no tenant_id, no
    X-Tenant-ID header). Callers should treat None as "return empty/default
    settings" rather than an error — a platform-level SUPER_ADMIN browsing
    without a selected tenant is a normal, expected state for settings-style
    endpoints.
    """
    roles = current_user.get("roles", []) or []
    is_super_admin = "SUPER_ADMIN" in roles
    has_header_tenant = bool(request.headers.get("X-Tenant-ID"))

    if is_super_admin and not current_user.get("tenant_id") and not has_header_tenant:
        return None

    return resolve_current_tenant_id(request, current_user, db)
