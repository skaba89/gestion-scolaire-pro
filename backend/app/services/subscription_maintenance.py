"""Maintenance des abonnements SaaS payés par rails locaux.

Sans webhook automatique (pas de Stripe), les abonnements activés
manuellement doivent être rétrogradés quand leur période payée se termine.
`expire_overdue_subscriptions` est idempotente et peut être appelée par :
- le script cron `python -m app.scripts.expire_subscriptions` ;
- l'endpoint SUPER_ADMIN `POST /billing/maintenance/expire/`.
"""
from __future__ import annotations

import logging
import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.saas import BillingEvent, SubscriptionPlan, TenantSubscription
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

FALLBACK_PLAN_SLUG = "starter"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def apply_plan_quotas(tenant: Tenant, plan: SubscriptionPlan) -> None:
    """Copy plan limits into tenant.settings so QuotaMiddleware enforces them."""
    settings_dict = dict(tenant.settings or {})
    quotas = dict(settings_dict.get("quotas") or {})
    if plan.max_students is not None:
        quotas["max_students"] = plan.max_students
    else:
        quotas.pop("max_students", None)
    if plan.max_storage_gb is not None:
        quotas["max_storage_mb"] = plan.max_storage_gb * 1024
    else:
        quotas.pop("max_storage_mb", None)
    settings_dict["quotas"] = quotas
    tenant.settings = settings_dict  # reassign to trigger JSON change detection


def _reset_quotas(tenant: Tenant) -> None:
    """Drop plan-specific quotas so the middleware falls back to defaults."""
    settings_dict = dict(tenant.settings or {})
    quotas = dict(settings_dict.get("quotas") or {})
    quotas.pop("max_students", None)
    quotas.pop("max_storage_mb", None)
    settings_dict["quotas"] = quotas
    tenant.settings = settings_dict


def expire_overdue_subscriptions(db: Session) -> dict:
    """Downgrade every active subscription whose paid period has ended.

    Returns a summary dict: {"expired": n, "tenants": [slug, ...]}.

    ARCHITECTURE (restricted-DB-role auth fix, docs/POSTGRES_APP_ROLE.md):
    `tenant_subscriptions` has a strict RLS policy with no platform-wide
    bypass (`tenant_id = COALESCE(current_setting(...), '')`) - a single
    query across every tenant's subscriptions, as this function used to
    run, returns literally zero rows under a role that actually enforces
    RLS (NOSUPERUSER NOBYPASSRLS), regardless of which context the caller's
    session happened to carry. This is called from two very different
    contexts - the daily cron script (app/scripts/expire_subscriptions.py,
    no HTTP request, no tenant context at all) and the SUPER_ADMIN endpoint
    POST /billing/maintenance/expire/ (a `get_db()` session whose context
    reflects whatever TenantMiddleware resolved for THAT caller, usually
    "no tenant" for a real SUPER_ADMIN) - so the fix cannot rely on the
    caller having positioned the right context; it must position it itself,
    once per tenant, using the same switch_tenant_context()/
    reset_tenant_context() abstraction the ARQ workers use (PR
    "propagate tenant RLS context through ARQ workers"). `tenants` itself
    carries no RLS policy (root of the hierarchy), so listing every tenant
    id first is safe regardless of the session's current context.
    """
    from app.core.database import (
        reset_tenant_context,
        switch_tenant_context,
        tenant_context as _tenant_context,
    )
    from app.core.config import settings as _settings

    now = _now()
    fallback_plan = (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.slug == FALLBACK_PLAN_SLUG)
        .first()
    )

    tenant_ids = [str(tid) for (tid,) in db.query(Tenant.id).all()]

    expired_tenants: list[str] = []
    expired_count = 0

    for tid in tenant_ids:
        if not _settings.is_sqlite:
            switch_tenant_context(db, tid)

        overdue = (
            db.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == tid,
                TenantSubscription.status == "active",
                TenantSubscription.current_period_end.isnot(None),
                TenantSubscription.current_period_end < now,
            )
            .all()
        )

        for subscription in overdue:
            subscription.status = "expired"
            subscription.provider_status = "expired"

            tenant = db.query(Tenant).filter(Tenant.id == subscription.tenant_id).first()
            if tenant:
                tenant.subscription_plan = FALLBACK_PLAN_SLUG
                tenant.subscription_status = "expired"
                if fallback_plan:
                    apply_plan_quotas(tenant, fallback_plan)
                else:
                    _reset_quotas(tenant)
                expired_tenants.append(tenant.slug)

            db.add(BillingEvent(
                tenant_id=str(subscription.tenant_id),
                provider=subscription.payment_provider,
                event_id=f"local:{_uuid.uuid4()}",
                event_type="subscription.expired",
                status="processed",
                payload={
                    "subscription_id": str(subscription.id),
                    "period_end": subscription.current_period_end.isoformat()
                    if subscription.current_period_end else None,
                },
                processed_at=now,
            ))
            logger.info(
                "Subscription %s expired for tenant %s (period ended %s)",
                subscription.id, subscription.tenant_id, subscription.current_period_end,
            )
            expired_count += 1

        if overdue:
            db.commit()

        if not _settings.is_sqlite:
            reset_tenant_context(db)

    # Restore whatever context this session had before this function ran
    # (the caller's own request/job may keep using `db` afterward - e.g.
    # the SUPER_ADMIN HTTP endpoint - and must not see "no tenant" left
    # over from the per-tenant sweep above).
    if not _settings.is_sqlite:
        caller_tenant_id = _tenant_context.get()
        if caller_tenant_id:
            switch_tenant_context(db, caller_tenant_id)

    return {"expired": expired_count, "tenants": expired_tenants}
