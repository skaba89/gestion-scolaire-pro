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
    """
    now = _now()
    overdue = (
        db.query(TenantSubscription)
        .filter(
            TenantSubscription.status == "active",
            TenantSubscription.current_period_end.isnot(None),
            TenantSubscription.current_period_end < now,
        )
        .all()
    )

    fallback_plan = (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.slug == FALLBACK_PLAN_SLUG)
        .first()
    )

    expired_tenants: list[str] = []
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

    if overdue:
        db.commit()

    return {"expired": len(overdue), "tenants": expired_tenants}
