"""Tests de l'expiration des abonnements payés par rails locaux (Phase 4)."""
import uuid
from datetime import datetime, timedelta, timezone

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.saas import SubscriptionPlan, TenantSubscription  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.services.subscription_maintenance import expire_overdue_subscriptions  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
SUPER_ADMIN_USER = {
    "id": str(uuid.uuid4()),
    "email": "root@schoolflow.pro",
    "roles": ["SUPER_ADMIN"],
    "tenant_id": None,
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _make_tenant_with_subscription(*, period_end_delta_days: int) -> tuple[str, str]:
    """Crée tenant + plan payant + abonnement actif ; retourne (tenant_id, sub_id)."""
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        plan = SubscriptionPlan(
            slug=f"expiry-plan-{tenant_id[:8]}",
            name="Plan Expiry Test",
            currency="GNF",
            price_monthly=100000.0,
            price_yearly=1000000.0,
            max_students=500,
            is_active=True,
        )
        db.add(plan)
        db.flush()
        db.add(Tenant(
            id=tenant_id,
            name="École Expiry",
            slug=f"expiry-{tenant_id[:8]}",
            type="SCHOOL",
            country="GN",
            subscription_plan=plan.slug,
            subscription_status="active",
            settings={"quotas": {"max_students": 500}},
        ))
        sub = TenantSubscription(
            tenant_id=tenant_id,
            plan_id=str(plan.id),
            status="active",
            billing_cycle="monthly",
            payment_provider="orange_money",
            started_at=_now() - timedelta(days=40),
            current_period_start=_now() - timedelta(days=40),
            current_period_end=_now() + timedelta(days=period_end_delta_days),
        )
        db.add(sub)
        db.commit()
        return tenant_id, str(sub.id)


def test_overdue_subscription_is_expired_and_tenant_downgraded():
    tenant_id, sub_id = _make_tenant_with_subscription(period_end_delta_days=-5)

    with SessionLocal() as db:
        summary = expire_overdue_subscriptions(db)

    assert summary["expired"] >= 1
    with SessionLocal() as db:
        sub = db.query(TenantSubscription).filter(TenantSubscription.id == sub_id).first()
        assert sub.status == "expired"
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        assert tenant.subscription_plan == "starter"
        assert tenant.subscription_status == "expired"
        # Les quotas du plan payant ne doivent plus s'appliquer.
        assert tenant.settings.get("quotas", {}).get("max_students") != 500


def test_active_subscription_within_period_is_untouched():
    tenant_id, sub_id = _make_tenant_with_subscription(period_end_delta_days=+20)

    with SessionLocal() as db:
        expire_overdue_subscriptions(db)

    with SessionLocal() as db:
        sub = db.query(TenantSubscription).filter(TenantSubscription.id == sub_id).first()
        assert sub.status == "active"
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        assert tenant.subscription_status == "active"


def test_expiry_is_idempotent():
    _make_tenant_with_subscription(period_end_delta_days=-1)

    with SessionLocal() as db:
        first = expire_overdue_subscriptions(db)
    with SessionLocal() as db:
        second = expire_overdue_subscriptions(db)

    assert first["expired"] >= 1
    assert second["expired"] == 0


def test_maintenance_endpoint_requires_super_admin():
    app.dependency_overrides[get_current_user] = lambda: {
        "id": str(uuid.uuid4()),
        "roles": ["TENANT_ADMIN"],
        "tenant_id": str(uuid.uuid4()),
    }
    try:
        resp = client.post("/api/v1/billing/maintenance/expire/", headers=HEADERS)
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_maintenance_endpoint_runs_expiry_as_super_admin():
    tenant_id, sub_id = _make_tenant_with_subscription(period_end_delta_days=-2)

    app.dependency_overrides[get_current_user] = lambda: SUPER_ADMIN_USER
    try:
        resp = client.post("/api/v1/billing/maintenance/expire/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert resp.json()["expired"] >= 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    with SessionLocal() as db:
        sub = db.query(TenantSubscription).filter(TenantSubscription.id == sub_id).first()
        assert sub.status == "expired"
