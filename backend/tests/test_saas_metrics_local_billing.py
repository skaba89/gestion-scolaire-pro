"""Tests du bloc billing local dans les métriques SaaS plateforme (Phase 4)."""
import uuid
from datetime import datetime, timedelta, timezone

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.saas import SubscriptionPlan, TenantSubscription  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
SUPER_ADMIN_USER = {
    "id": str(uuid.uuid4()),
    "email": "root@schoolflow.pro",
    "roles": ["SUPER_ADMIN"],
    "tenant_id": None,
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _seed_billing_data() -> None:
    """Un abonnement actif GNF (mensuel, expire dans 3 jours) + une demande en attente."""
    with SessionLocal() as db:
        plan = SubscriptionPlan(
            slug=f"metrics-plan-{uuid.uuid4().hex[:8]}",
            name="Plan Metrics Test",
            currency="GNF",
            price_monthly=300000.0,
            price_yearly=3000000.0,
            max_students=1000,
            is_active=True,
        )
        db.add(plan)
        db.flush()

        for status_, period_end in (
            ("active", _now() + timedelta(days=3)),
            ("pending_payment", None),
        ):
            tenant_id = str(uuid.uuid4())
            db.add(Tenant(
                id=tenant_id,
                name=f"École Metrics {status_}",
                slug=f"metrics-{status_}-{tenant_id[:8]}",
                type="SCHOOL",
                country="GN",
                subscription_plan=plan.slug if status_ == "active" else "starter",
                subscription_status="active" if status_ == "active" else "trialing",
                settings={},
            ))
            db.add(TenantSubscription(
                tenant_id=tenant_id,
                plan_id=str(plan.id),
                status=status_,
                billing_cycle="monthly",
                payment_provider="orange_money",
                current_period_end=period_end,
            ))
        db.commit()


def test_saas_metrics_expose_local_billing_block():
    _seed_billing_data()

    app.dependency_overrides[get_current_user] = lambda: SUPER_ADMIN_USER
    try:
        resp = client.get("/api/v1/platform/saas-metrics/", headers=HEADERS)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert resp.status_code == 200, resp.text
    local = resp.json().get("local_billing")
    assert local is not None

    assert local["active_subscriptions"] >= 1
    assert local["pending_requests"] >= 1

    gnf = next((m for m in local["mrr_by_currency"] if m["currency"] == "GNF"), None)
    assert gnf is not None
    assert gnf["mrr"] >= 300000.0
    assert gnf["arr"] >= 3600000.0

    # L'abonnement actif expire dans 3 jours → présent dans expiring_soon.
    assert any(
        (e["tenant_name"] or "").startswith("École Metrics active")
        for e in local["expiring_soon"]
    )


def test_saas_metrics_require_super_admin():
    app.dependency_overrides[get_current_user] = lambda: {
        "id": str(uuid.uuid4()),
        "roles": ["TENANT_ADMIN"],
        "tenant_id": str(uuid.uuid4()),
    }
    try:
        resp = client.get("/api/v1/platform/saas-metrics/", headers=HEADERS)
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 403
