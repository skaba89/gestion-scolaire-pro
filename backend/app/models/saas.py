"""SaaS subscription, quota and domain models.

These models complete the Phase 4 SaaS foundation without changing the
existing Tenant billing columns. The existing columns remain for backward
compatibility; these tables become the normalized source of truth for new
billing and quota workflows.
"""
from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, TimestampMixin, UUIDMixin


class SubscriptionPlan(Base, UUIDMixin, TimestampMixin):
    """Commercial SaaS plan definition."""

    __tablename__ = "subscription_plans"

    name = Column(String(100), nullable=False)
    slug = Column(String(80), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    currency = Column(String(3), nullable=False, default="USD")
    price_monthly = Column(Float, nullable=False, default=0.0)
    price_yearly = Column(Float, nullable=False, default=0.0)

    max_students = Column(Integer, nullable=True)
    max_users = Column(Integer, nullable=True)
    max_storage_gb = Column(Integer, nullable=True)
    max_ai_requests = Column(Integer, nullable=True)
    max_exports_per_day = Column(Integer, nullable=True)
    max_campuses = Column(Integer, nullable=True)

    stripe_price_monthly_id = Column(String(255), nullable=True)
    stripe_price_yearly_id = Column(String(255), nullable=True)
    features = Column(JSON, default=dict)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)

    subscriptions = relationship("TenantSubscription", back_populates="plan")


class TenantSubscription(Base, UUIDMixin, TimestampMixin):
    """Current or historical subscription for a tenant."""

    __tablename__ = "tenant_subscriptions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "stripe_subscription_id", name="uq_tenant_subscription_stripe_subscription"),
    )

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = Column(GUID(), ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True, index=True)

    status = Column(String(50), nullable=False, default="trialing", index=True)
    billing_cycle = Column(String(20), nullable=False, default="monthly")
    payment_provider = Column(String(50), nullable=False, default="stripe")

    stripe_customer_id = Column(String(255), nullable=True, index=True)
    stripe_subscription_id = Column(String(255), nullable=True, index=True)
    provider_reference = Column(String(255), nullable=True, index=True)
    provider_status = Column(String(100), nullable=True)

    started_at = Column(DateTime, nullable=True)
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    trial_ends_at = Column(DateTime, nullable=True)
    canceled_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant")
    plan = relationship("SubscriptionPlan", back_populates="subscriptions")


class TenantQuotaUsage(Base, UUIDMixin, TimestampMixin):
    """Measured resource usage for a tenant.

    The first Phase 4 step uses soft quotas only: measure, expose and warn.
    Enforcement can be enabled progressively in a later PR.
    """

    __tablename__ = "tenant_quota_usage"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_tenant_quota_usage_tenant"),)

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    students_count = Column(Integer, nullable=False, default=0)
    users_count = Column(Integer, nullable=False, default=0)
    campuses_count = Column(Integer, nullable=False, default=0)
    storage_used_mb = Column(Integer, nullable=False, default=0)
    ai_requests_count = Column(Integer, nullable=False, default=0)
    exports_count_today = Column(Integer, nullable=False, default=0)
    last_calculated_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant")


class BillingEvent(Base, UUIDMixin, TimestampMixin):
    """Idempotent billing event journal.

    Stores Stripe/Mobile Money/manual billing events so webhooks can be retried
    safely and audited later.
    """

    __tablename__ = "billing_events"

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True)
    provider = Column(String(50), nullable=False, default="stripe", index=True)
    event_id = Column(String(255), nullable=False, unique=True, index=True)
    event_type = Column(String(150), nullable=False, index=True)
    status = Column(String(50), nullable=False, default="received")
    payload = Column(JSON, default=dict)
    processed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    tenant = relationship("Tenant")


class TenantDomain(Base, UUIDMixin, TimestampMixin):
    """Custom domain or subdomain mapped to a tenant."""

    __tablename__ = "tenant_domains"
    __table_args__ = (UniqueConstraint("domain", name="uq_tenant_domains_domain"),)

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    domain = Column(String(255), nullable=False, index=True)
    domain_type = Column(String(30), nullable=False, default="subdomain")
    is_primary = Column(Boolean, nullable=False, default=False)
    is_verified = Column(Boolean, nullable=False, default=False)
    verification_token = Column(String(255), nullable=True)
    verified_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant")
