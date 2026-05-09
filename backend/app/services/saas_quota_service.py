"""SaaS quota engine.

Phase 4 advanced service used to calculate tenant usage, compare it against
plan limits and provide soft/hard quota decisions.

Design principles:
- Backend is the source of truth, not the frontend.
- First rollout is soft quotas: warn and audit before blocking.
- Enforcement is centralized here so business modules can call one function.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.campus import Campus
from app.models.saas import SubscriptionPlan, TenantQuotaUsage, TenantSubscription
from app.models.student import Student
from app.models.tenant import Tenant
from app.models.user import User


@dataclass(frozen=True)
class QuotaDecision:
    resource: str
    used: int
    limit: int | None
    allowed: bool
    warning: bool
    percentage: float | None
    message: str


DEFAULT_PLAN_LIMITS: dict[str, dict[str, Any]] = {
    "starter": {
        "max_students": 300,
        "max_users": 10,
        "max_storage_gb": 5,
        "max_ai_requests": 100,
        "max_exports_per_day": 20,
        "max_campuses": 1,
    },
    "pro": {
        "max_students": 2000,
        "max_users": 80,
        "max_storage_gb": 50,
        "max_ai_requests": 2000,
        "max_exports_per_day": 200,
        "max_campuses": 5,
    },
    "enterprise": {
        "max_students": 10000,
        "max_users": 500,
        "max_storage_gb": 500,
        "max_ai_requests": 20000,
        "max_exports_per_day": 2000,
        "max_campuses": 50,
    },
    "institution": {
        "max_students": None,
        "max_users": None,
        "max_storage_gb": None,
        "max_ai_requests": None,
        "max_exports_per_day": None,
        "max_campuses": None,
    },
}


class SaaSQuotaService:
    """Centralized quota and usage engine."""

    def __init__(self, db: Session):
        self.db = db

    def get_active_subscription(self, tenant_id: str) -> TenantSubscription | None:
        return (
            self.db.query(TenantSubscription)
            .filter(TenantSubscription.tenant_id == tenant_id)
            .order_by(TenantSubscription.created_at.desc())
            .first()
        )

    def get_plan_for_tenant(self, tenant: Tenant) -> SubscriptionPlan | None:
        subscription = self.get_active_subscription(str(tenant.id))
        if subscription and subscription.plan:
            return subscription.plan

        slug = (tenant.subscription_plan or "starter").lower()
        return self.db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == slug).first()

    def calculate_usage(self, tenant_id: str) -> TenantQuotaUsage:
        """Calculate and persist current quota usage for a tenant."""
        usage = (
            self.db.query(TenantQuotaUsage)
            .filter(TenantQuotaUsage.tenant_id == tenant_id)
            .first()
        )
        if not usage:
            usage = TenantQuotaUsage(tenant_id=tenant_id)
            self.db.add(usage)

        usage.students_count = self.db.query(func.count(Student.id)).filter(Student.tenant_id == tenant_id).scalar() or 0
        usage.users_count = self.db.query(func.count(User.id)).filter(User.tenant_id == tenant_id).scalar() or 0
        usage.campuses_count = self.db.query(func.count(Campus.id)).filter(Campus.tenant_id == tenant_id).scalar() or 0
        usage.last_calculated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self.db.commit()
        self.db.refresh(usage)
        return usage

    def get_limits(self, tenant: Tenant) -> dict[str, Any]:
        plan = self.get_plan_for_tenant(tenant)
        if plan:
            return {
                "plan_slug": plan.slug,
                "max_students": plan.max_students,
                "max_users": plan.max_users,
                "max_storage_gb": plan.max_storage_gb,
                "max_ai_requests": plan.max_ai_requests,
                "max_exports_per_day": plan.max_exports_per_day,
                "max_campuses": plan.max_campuses,
                "features": plan.features or {},
            }

        slug = (tenant.subscription_plan or "starter").lower()
        limits = dict(DEFAULT_PLAN_LIMITS.get(slug, DEFAULT_PLAN_LIMITS["starter"]))
        limits["plan_slug"] = slug
        limits["features"] = {}
        return limits

    @staticmethod
    def _decision(resource: str, used: int, limit: int | None) -> QuotaDecision:
        if limit is None:
            return QuotaDecision(resource, used, None, True, False, None, "Quota illimité pour ce plan.")
        percentage = round((used / limit) * 100, 2) if limit > 0 else 100.0
        allowed = used < limit
        warning = percentage >= 80
        if not allowed:
            message = f"Quota {resource} dépassé ({used}/{limit})."
        elif warning:
            message = f"Quota {resource} proche de la limite ({used}/{limit})."
        else:
            message = f"Quota {resource} OK ({used}/{limit})."
        return QuotaDecision(resource, used, limit, allowed, warning, percentage, message)

    def get_usage_report(self, tenant: Tenant, recalculate: bool = True) -> dict[str, Any]:
        usage = self.calculate_usage(str(tenant.id)) if recalculate else (
            self.db.query(TenantQuotaUsage).filter(TenantQuotaUsage.tenant_id == tenant.id).first()
        )
        if not usage:
            usage = self.calculate_usage(str(tenant.id))

        limits = self.get_limits(tenant)
        decisions = [
            self._decision("students", usage.students_count, limits.get("max_students")),
            self._decision("users", usage.users_count, limits.get("max_users")),
            self._decision("campuses", usage.campuses_count, limits.get("max_campuses")),
            self._decision("storage_gb", int((usage.storage_used_mb or 0) / 1024), limits.get("max_storage_gb")),
            self._decision("ai_requests", usage.ai_requests_count, limits.get("max_ai_requests")),
            self._decision("exports_today", usage.exports_count_today, limits.get("max_exports_per_day")),
        ]
        return {
            "tenant_id": str(tenant.id),
            "tenant_name": tenant.name,
            "plan": limits.get("plan_slug"),
            "status": tenant.subscription_status or "trialing",
            "limits": limits,
            "usage": {
                "students_count": usage.students_count,
                "users_count": usage.users_count,
                "campuses_count": usage.campuses_count,
                "storage_used_mb": usage.storage_used_mb,
                "ai_requests_count": usage.ai_requests_count,
                "exports_count_today": usage.exports_count_today,
                "last_calculated_at": usage.last_calculated_at.isoformat() if usage.last_calculated_at else None,
            },
            "quotas": [decision.__dict__ for decision in decisions],
            "has_warning": any(d.warning for d in decisions),
            "has_blocking_limit": any(not d.allowed for d in decisions),
        }

    def assert_can_create(self, tenant: Tenant, resource: str, hard_enforce: bool = False) -> QuotaDecision:
        """Return a quota decision; raise should be done by endpoint layer.

        `hard_enforce=False` is the Phase 4 default to avoid breaking existing
        tenants. A later phase can enable enforcement per resource/plan.
        """
        report = self.get_usage_report(tenant, recalculate=True)
        match = next((q for q in report["quotas"] if q["resource"] == resource), None)
        if not match:
            return QuotaDecision(resource, 0, None, True, False, None, "Ressource non limitée.")
        decision = QuotaDecision(**match)
        if hard_enforce and not decision.allowed:
            return decision
        # Soft quota rollout: still allow, but keep warning/blocking info in report.
        if not hard_enforce and not decision.allowed:
            return QuotaDecision(
                decision.resource,
                decision.used,
                decision.limit,
                True,
                True,
                decision.percentage,
                f"Soft quota: {decision.message}",
            )
        return decision
