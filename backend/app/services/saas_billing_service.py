"""Enterprise SaaS billing service.

Provides idempotent billing event handling and a retry-ready processing layer.
The current implementation is synchronous-safe and can later be called from a
Celery/RQ worker without changing webhook semantics.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.saas import BillingEvent, SubscriptionPlan, TenantSubscription
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)


class SaaSBillingService:
    def __init__(self, db: Session):
        self.db = db

    def record_event(self, *, provider: str, event_id: str, event_type: str, payload: dict[str, Any], tenant_id: str | None = None) -> tuple[BillingEvent, bool]:
        """Record an event exactly once.

        Returns `(event, created)`. If created is False, the event was already
        seen and must not be processed again.
        """
        existing = self.db.query(BillingEvent).filter(BillingEvent.event_id == event_id).first()
        if existing:
            return existing, False
        event = BillingEvent(
            provider=provider,
            event_id=event_id,
            event_type=event_type,
            payload=payload,
            tenant_id=tenant_id,
            status="received",
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event, True

    def mark_processed(self, event: BillingEvent) -> None:
        event.status = "processed"
        event.processed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        event.error_message = None
        self.db.commit()

    def mark_failed(self, event: BillingEvent, exc: Exception | str) -> None:
        event.status = "failed"
        event.error_message = str(exc)[:4000]
        self.db.commit()

    def resolve_tenant_from_stripe_object(self, obj: dict[str, Any]) -> Tenant | None:
        metadata = obj.get("metadata") or {}
        tenant_id = metadata.get("tenant_id")
        if tenant_id:
            return self.db.query(Tenant).filter(Tenant.id == tenant_id).first()
        customer_id = obj.get("customer")
        if customer_id:
            return self.db.query(Tenant).filter(Tenant.stripe_customer_id == customer_id).first()
        return None

    def sync_subscription_from_stripe_object(self, obj: dict[str, Any], *, default_plan: str | None = None) -> Tenant | None:
        """Synchronize tenant + normalized subscription from a Stripe object."""
        tenant = self.resolve_tenant_from_stripe_object(obj)
        if not tenant:
            logger.warning("Billing sync skipped: tenant not resolved from Stripe object")
            return None

        metadata = obj.get("metadata") or {}
        plan_slug = metadata.get("plan") or default_plan or tenant.subscription_plan or "starter"
        status = obj.get("status") or "active"
        sub_id = obj.get("subscription") or obj.get("id")
        customer_id = obj.get("customer") or tenant.stripe_customer_id

        plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == plan_slug).first()

        tenant.subscription_plan = plan_slug
        tenant.subscription_status = status
        if customer_id:
            tenant.stripe_customer_id = customer_id
        if sub_id:
            tenant.stripe_subscription_id = sub_id
        if status == "active":
            tenant.trial_ends_at = None

        subscription = None
        if sub_id:
            subscription = (
                self.db.query(TenantSubscription)
                .filter(TenantSubscription.stripe_subscription_id == sub_id)
                .first()
            )
        if not subscription:
            subscription = TenantSubscription(tenant_id=tenant.id, stripe_subscription_id=sub_id)
            self.db.add(subscription)

        subscription.plan_id = plan.id if plan else None
        subscription.status = status
        subscription.payment_provider = "stripe"
        subscription.stripe_customer_id = customer_id
        subscription.stripe_subscription_id = sub_id
        subscription.provider_reference = sub_id or customer_id
        subscription.provider_status = status

        self.db.commit()
        return tenant

    def cancel_subscription_for_customer(self, customer_id: str) -> Tenant | None:
        tenant = self.db.query(Tenant).filter(Tenant.stripe_customer_id == customer_id).first()
        if not tenant:
            return None
        tenant.subscription_status = "canceled"
        tenant.subscription_plan = "starter"
        tenant.stripe_subscription_id = None
        subscription = (
            self.db.query(TenantSubscription)
            .filter(TenantSubscription.stripe_customer_id == customer_id)
            .order_by(TenantSubscription.created_at.desc())
            .first()
        )
        if subscription:
            subscription.status = "canceled"
            subscription.canceled_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self.db.commit()
        return tenant

    def retry_failed_events(self, limit: int = 50) -> list[BillingEvent]:
        """Return failed billing events for future worker retry.

        The actual event-specific processing remains in the webhook layer today;
        this method gives an operational hook for workers without changing the
        public API contract.
        """
        return (
            self.db.query(BillingEvent)
            .filter(BillingEvent.status == "failed")
            .order_by(BillingEvent.updated_at.asc())
            .limit(limit)
            .all()
        )
