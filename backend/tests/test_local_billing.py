"""Tests du billing local sans Stripe (Phase 4 — issue #24)."""
import uuid

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.saas import SubscriptionPlan, TenantSubscription  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

TENANT_ID = str(uuid.uuid4())
ADMIN_ID = str(uuid.uuid4())
SUPER_ADMIN_ID = str(uuid.uuid4())
PLAN_SLUG = "pro-test"

TENANT_ADMIN_USER = {
    "id": ADMIN_ID,
    "email": "admin@billing-test.gn",
    "roles": ["TENANT_ADMIN"],
    "tenant_id": TENANT_ID,
}
SUPER_ADMIN_USER = {
    "id": SUPER_ADMIN_ID,
    "email": "root@schoolflow.pro",
    "roles": ["SUPER_ADMIN"],
    "tenant_id": None,
}

# TenantMiddleware laisse passer les jetons non décodables ; l'identité est
# ensuite fournie par l'override de get_current_user ci-dessous.
HEADERS = {"Authorization": "Bearer mock-token"}


def setup_module(module):
    with SessionLocal() as db:
        db.add(Tenant(
            id=TENANT_ID,
            name="École Billing Test",
            slug=f"billing-test-{TENANT_ID[:8]}",
            type="SCHOOL",
            country="GN",
            subscription_plan="starter",
            subscription_status="trialing",
            settings={},
        ))
        db.add(SubscriptionPlan(
            slug=PLAN_SLUG,
            name="Pro Test",
            currency="GNF",
            price_monthly=250000.0,
            price_yearly=2500000.0,
            max_students=2000,
            max_storage_gb=50,
            is_active=True,
            sort_order=1,
        ))
        db.commit()


def teardown_module(module):
    app.dependency_overrides.pop(get_current_user, None)
    with SessionLocal() as db:
        db.query(TenantSubscription).filter(
            TenantSubscription.tenant_id == TENANT_ID
        ).delete()
        db.query(SubscriptionPlan).filter(
            SubscriptionPlan.slug == PLAN_SLUG
        ).delete()
        db.query(Tenant).filter(Tenant.id == TENANT_ID).delete()
        db.commit()


@pytest.fixture
def as_tenant_admin():
    app.dependency_overrides[get_current_user] = lambda: TENANT_ADMIN_USER
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def as_super_admin():
    app.dependency_overrides[get_current_user] = lambda: SUPER_ADMIN_USER
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _pending_id() -> str:
    with SessionLocal() as db:
        sub = (
            db.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == TENANT_ID,
                TenantSubscription.status == "pending_payment",
            )
            .first()
        )
        return str(sub.id) if sub else ""


class TestSubscribe:
    def test_plans_are_listed(self, as_tenant_admin):
        resp = client.get("/api/v1/billing/plans/", headers=HEADERS)
        assert resp.status_code == 200
        slugs = [p["slug"] for p in resp.json()["items"]]
        assert PLAN_SLUG in slugs

    def test_invalid_plan_is_rejected(self, as_tenant_admin):
        resp = client.post(
            "/api/v1/billing/subscribe/",
            json={"plan_slug": "no-such-plan"},
            headers=HEADERS,
        )
        assert resp.status_code == 400

    def test_invalid_payment_method_is_rejected(self, as_tenant_admin):
        resp = client.post(
            "/api/v1/billing/subscribe/",
            json={"plan_slug": PLAN_SLUG, "payment_method": "stripe"},
            headers=HEADERS,
        )
        assert resp.status_code == 400

    def test_subscribe_creates_pending_request_with_instructions(self, as_tenant_admin):
        resp = client.post(
            "/api/v1/billing/subscribe/",
            json={
                "plan_slug": PLAN_SLUG,
                "billing_cycle": "monthly",
                "payment_method": "orange_money",
                "payment_reference": "OM-123456",
            },
            headers=HEADERS,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["request"]["status"] == "pending_payment"
        assert data["request"]["payment_provider"] == "orange_money"
        assert data["amount_due"] == 250000.0
        assert data["currency"] == "GNF"
        assert data["payment_instructions"]["method"] == "orange_money"

    def test_second_pending_request_is_conflict(self, as_tenant_admin):
        resp = client.post(
            "/api/v1/billing/subscribe/",
            json={"plan_slug": PLAN_SLUG},
            headers=HEADERS,
        )
        assert resp.status_code == 409

    def test_subscription_status_exposes_latest_request(self, as_tenant_admin):
        resp = client.get("/api/v1/billing/subscription/", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["plan"] == "starter"
        assert data["latest_request"]["status"] == "pending_payment"


class TestConfirmation:
    def test_tenant_admin_cannot_confirm(self, as_tenant_admin):
        resp = client.post(
            f"/api/v1/billing/requests/{_pending_id()}/confirm/",
            json={},
            headers=HEADERS,
        )
        assert resp.status_code == 403

    def test_super_admin_sees_pending_requests(self, as_super_admin):
        resp = client.get("/api/v1/billing/requests/", headers=HEADERS)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    def test_confirm_activates_subscription_and_quotas(self, as_super_admin):
        sub_id = _pending_id()
        resp = client.post(
            f"/api/v1/billing/requests/{sub_id}/confirm/",
            json={"payment_reference": "OM-123456-VERIFIED"},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["subscription"]["status"] == "active"

        with SessionLocal() as db:
            tenant = db.query(Tenant).filter(Tenant.id == TENANT_ID).first()
            assert tenant.subscription_plan == PLAN_SLUG
            assert tenant.subscription_status == "active"
            # Les limites du plan sont recopiées pour le QuotaMiddleware.
            assert tenant.settings["quotas"]["max_students"] == 2000
            assert tenant.settings["quotas"]["max_storage_mb"] == 50 * 1024

    def test_confirm_twice_is_conflict(self, as_super_admin):
        with SessionLocal() as db:
            sub = (
                db.query(TenantSubscription)
                .filter(TenantSubscription.tenant_id == TENANT_ID)
                .first()
            )
            sub_id = str(sub.id)
        resp = client.post(
            f"/api/v1/billing/requests/{sub_id}/confirm/",
            json={},
            headers=HEADERS,
        )
        assert resp.status_code == 409


class TestCancelAndReject:
    def test_cancel_marks_active_subscription(self, as_tenant_admin):
        resp = client.post("/api/v1/billing/cancel/", headers=HEADERS)
        assert resp.status_code == 200
        with SessionLocal() as db:
            sub = (
                db.query(TenantSubscription)
                .filter(
                    TenantSubscription.tenant_id == TENANT_ID,
                    TenantSubscription.status == "active",
                )
                .first()
            )
            assert sub.canceled_at is not None

    def test_reject_flow(self, as_tenant_admin, as_super_admin):
        # Nouvelle demande (l'abonnement actif n'est pas pending)
        app.dependency_overrides[get_current_user] = lambda: TENANT_ADMIN_USER
        resp = client.post(
            "/api/v1/billing/subscribe/",
            json={"plan_slug": PLAN_SLUG, "payment_method": "bank_transfer"},
            headers=HEADERS,
        )
        assert resp.status_code == 201
        sub_id = resp.json()["request"]["id"]

        app.dependency_overrides[get_current_user] = lambda: SUPER_ADMIN_USER
        resp = client.post(
            f"/api/v1/billing/requests/{sub_id}/reject/",
            json={"reason": "Paiement introuvable sur le relevé."},
            headers=HEADERS,
        )
        assert resp.status_code == 200
        assert resp.json()["subscription"]["status"] == "rejected"

        # Le tenant garde son plan actif précédent
        with SessionLocal() as db:
            tenant = db.query(Tenant).filter(Tenant.id == TENANT_ID).first()
            assert tenant.subscription_plan == PLAN_SLUG
