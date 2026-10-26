"""Grille tarifaire en euros, sans offre gratuite (2026-10-26).

Standard 49,99 € (≤ 500 élèves), Medium 99,99 € (501–999), Premium
499,99 € (≥ 1 000), Entreprise sur devis ; 30 jours d'essai ; toutes les
fonctionnalités dans toutes les offres. Régressions couvertes :
- « starter » / « free » donnaient l'IA et l'import dès que require_plan
  visait une offre inconnue (seuil 0) — et un essai sans date de fin
  était illimité ;
- une offre « illimitée » retombait sur la limite cachée de 1 000 élèves
  du QuotaMiddleware ;
- une offre trop petite pour l'effectif pouvait être souscrite ;
- l'offre sur devis pouvait être « souscrite » à 0 €.
"""
import asyncio
import importlib.util
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
import sqlalchemy as sa
from conftest import get_test_client
from fastapi import HTTPException

client = get_test_client()

from app.api.v1.endpoints.core.auth import limiter as auth_limiter  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user, require_plan  # noqa: E402
from app.main import app  # noqa: E402
from app.middlewares.quota import QuotaMiddleware  # noqa: E402
from app.models.saas import BillingEvent, SubscriptionPlan, TenantSubscription  # noqa: E402
from app.models.student import Gender, Student  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.scripts.seed_saas_plans import seed_plans  # noqa: E402
from app.services.plan_catalog import (  # noqa: E402
    PLAN_CATALOG,
    TRIAL_DAYS,
    apply_quota_limits,
    start_trial,
)

HEADERS = {"Authorization": "Bearer mock-token"}
MIGRATION_PATH = Path(__file__).parents[1] / "alembic" / "versions" / "20261026_0001_pricing_grid_eur.py"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _make_tenant(plan="standard", status="active", trial_ends_at=None, settings=None) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Grille", slug=f"grille-{tenant_id[:8]}", type="SCHOOL",
            country="GN", subscription_plan=plan, subscription_status=status,
            trial_ends_at=trial_ends_at, settings=settings or {},
        ))
        db.commit()
    return tenant_id


@pytest.fixture
def as_user():
    def _set(user: dict):
        app.dependency_overrides[get_current_user] = lambda: user
    yield _set
    app.dependency_overrides.pop(get_current_user, None)


def _admin(tenant_id: str, *roles: str) -> dict:
    return {"id": str(uuid.uuid4()), "email": "a@grille.gn", "roles": list(roles or ["TENANT_ADMIN"]), "tenant_id": tenant_id}


# ─── 1. Catalogue ─────────────────────────────────────────────────────────────

class TestCatalog:
    def test_prices_and_student_limits_match_the_product_decision(self):
        by_slug = {p["slug"]: p for p in PLAN_CATALOG}
        assert [p["slug"] for p in PLAN_CATALOG] == ["standard", "medium", "premium", "enterprise"]
        assert {p["currency"] for p in PLAN_CATALOG} == {"EUR"}
        assert (by_slug["standard"]["price_monthly"], by_slug["standard"]["max_students"]) == (49.99, 500)
        assert (by_slug["medium"]["price_monthly"], by_slug["medium"]["max_students"]) == (99.99, 999)
        assert (by_slug["premium"]["price_monthly"], by_slug["premium"]["max_students"]) == (499.99, None)
        assert by_slug["premium"]["max_campuses"] == 1
        assert by_slug["enterprise"]["features"]["on_quote"] is True
        assert by_slug["enterprise"]["max_campuses"] is None
        for plan in PLAN_CATALOG[:3]:
            assert plan["price_yearly"] == pytest.approx(plan["price_monthly"] * 10)

    def test_migration_copy_matches_the_catalog(self):
        module = _load_migration()
        keys = ("slug", "price_monthly", "price_yearly", "max_students", "max_users", "max_storage_gb",
                "max_ai_requests", "max_exports_per_day", "max_campuses", "features", "sort_order")
        assert [{k: p[k] for k in keys} for p in module.PLANS] == [{k: p[k] for k in keys} for p in PLAN_CATALOG]

    def test_seed_activates_new_plans_and_retires_free_offers(self, as_user):
        with SessionLocal() as db:
            db.add(SubscriptionPlan(slug="starter", name="Starter", currency="GNF", is_active=True))
            db.commit()
        seed_plans()

        as_user(_admin(_make_tenant()))
        resp = client.get("/api/v1/billing/plans/", headers=HEADERS)
        assert resp.status_code == 200
        slugs = [p["slug"] for p in resp.json()["items"]]
        assert [s for s in slugs if s in {"standard", "medium", "premium", "enterprise"}] == [
            "standard", "medium", "premium", "enterprise",
        ]
        assert not {"free", "starter", "pro", "institution"} & set(slugs)


# ─── 2. Accès aux fonctionnalités (require_plan) ──────────────────────────────

def _check_plan(tenant: SimpleNamespace, min_plan: str = "standard"):
    session = MagicMock()
    session.query.return_value.filter.return_value.first.return_value = tenant
    factory = MagicMock()
    factory.return_value.__enter__.return_value = session
    user = {"id": "u", "roles": ["TENANT_ADMIN"], "tenant_id": "t"}
    with patch("app.core.database.SessionLocal", factory):
        return require_plan(min_plan)(current_user=user)


def _t(plan, status="active", trial_ends_at=None):
    return SimpleNamespace(subscription_plan=plan, subscription_status=status, trial_ends_at=trial_ends_at)


class TestFeatureAccess:
    @pytest.mark.parametrize("plan", ["standard", "medium", "premium", "enterprise", "pro", "institution"])
    def test_every_paid_plan_gets_every_feature(self, plan):
        assert _check_plan(_t(plan))["id"] == "u"

    @pytest.mark.parametrize("plan", ["free", "starter", None, "unknown"])
    def test_no_free_plan_has_access(self, plan):
        with pytest.raises(HTTPException) as exc:
            _check_plan(_t(plan))
        assert exc.value.status_code == 402

    def test_trial_in_progress_has_access(self):
        assert _check_plan(_t("standard", "trialing", _now() + timedelta(days=3)))["id"] == "u"

    @pytest.mark.parametrize("trial_ends_at", [None, "past"])
    def test_trial_without_end_or_ended_is_refused(self, trial_ends_at):
        end = _now() - timedelta(days=1) if trial_ends_at == "past" else None
        with pytest.raises(HTTPException) as exc:
            _check_plan(_t("standard", "trialing", end))
        assert exc.value.status_code == 402

    @pytest.mark.parametrize("status", ["expired", "canceled", "past_due"])
    def test_lapsed_subscription_is_refused(self, status):
        with pytest.raises(HTTPException):
            _check_plan(_t("premium", status))

    @pytest.mark.parametrize("min_plan", ["starter", "free", "gold"])
    def test_gate_on_a_free_or_unknown_plan_is_rejected_at_declaration(self, min_plan):
        with pytest.raises(ValueError):
            require_plan(min_plan)


# ─── 3. Essai de 30 jours à la création ───────────────────────────────────────

class TestTrial:
    def test_start_trial_sets_standard_limits_for_30_days(self):
        tenant = SimpleNamespace(settings={"currency": "GNF"})
        start_trial(tenant, now=datetime(2026, 10, 26))
        assert tenant.subscription_plan == "standard"
        assert tenant.subscription_status == "trialing"
        assert tenant.trial_ends_at == datetime(2026, 10, 26) + timedelta(days=TRIAL_DAYS)
        assert tenant.settings == {"currency": "GNF", "quotas": {"max_students": 500, "max_storage_mb": 10 * 1024}}

    def test_self_registered_school_starts_a_standard_trial(self):
        previous = auth_limiter.enabled
        auth_limiter.enabled = False
        try:
            email = f"grille.{uuid.uuid4().hex[:8]}@ecole.gn"
            resp = client.post("/api/v1/auth/register-school/", json={
                "school_name": "École Essai", "school_type": "primary", "country": "GN",
                "first_name": "Awa", "last_name": "Camara", "email": email, "password": "Gr1lleTarif!2026",
            })
        finally:
            auth_limiter.enabled = previous
        assert resp.status_code == 201, resp.text
        with SessionLocal() as db:
            tenant = db.query(Tenant).filter(Tenant.email == email).first()
            assert (tenant.subscription_plan, tenant.subscription_status) == ("standard", "trialing")
            assert timedelta(days=29) < tenant.trial_ends_at - _now() <= timedelta(days=30)
            assert tenant.settings["quotas"]["max_students"] == 500


# ─── 4. Souscription ──────────────────────────────────────────────────────────

class TestSubscribe:
    def _plan(self, max_students, features=None) -> str:
        slug = f"grille-{uuid.uuid4().hex[:8]}"
        with SessionLocal() as db:
            db.add(SubscriptionPlan(
                slug=slug, name="Petite", currency="EUR", price_monthly=10.0, price_yearly=100.0,
                max_students=max_students, features=features or {}, is_active=True,
            ))
            db.commit()
        return slug

    def _students(self, tenant_id: str, count: int):
        with SessionLocal() as db:
            for i in range(count):
                db.add(Student(
                    id=str(uuid.uuid4()), tenant_id=tenant_id, first_name="Élève", last_name=str(i),
                    registration_number=f"G-{uuid.uuid4().hex[:8]}",
                    date_of_birth=date(2012, 1, 1), gender=Gender.FEMALE,
                ))
            db.commit()

    def test_plan_too_small_for_the_school_is_refused(self, as_user):
        tenant_id = _make_tenant("standard", "trialing", _now() + timedelta(days=5))
        self._students(tenant_id, 3)
        as_user(_admin(tenant_id))
        resp = client.post("/api/v1/billing/subscribe/", headers=HEADERS, json={"plan_slug": self._plan(2)})
        assert resp.status_code == 409
        assert "3" in resp.json()["message"]

    def test_plan_matching_the_school_size_is_accepted(self, as_user):
        tenant_id = _make_tenant("standard", "trialing", _now() + timedelta(days=5))
        self._students(tenant_id, 2)
        as_user(_admin(tenant_id))
        resp = client.post("/api/v1/billing/subscribe/", headers=HEADERS, json={"plan_slug": self._plan(2)})
        assert resp.status_code == 201, resp.text
        assert resp.json()["currency"] == "EUR"
        assert "GNF" in resp.json()["conversion_note"]

    def test_on_quote_plan_cannot_be_subscribed_online(self, as_user):
        tenant_id = _make_tenant("standard", "trialing", _now() + timedelta(days=5))
        as_user(_admin(tenant_id))
        slug = self._plan(None, features={"on_quote": True})
        resp = client.post("/api/v1/billing/subscribe/", headers=HEADERS, json={"plan_slug": slug})
        assert resp.status_code == 400
        assert "devis" in resp.json()["message"]

    def test_confirmation_records_the_amount_received_in_gnf(self, as_user):
        tenant_id = _make_tenant("standard", "trialing", _now() + timedelta(days=5))
        as_user(_admin(tenant_id))
        assert client.post(
            "/api/v1/billing/subscribe/", headers=HEADERS, json={"plan_slug": self._plan(None)},
        ).status_code == 201
        with SessionLocal() as db:
            sub_id = str(db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first().id)

        as_user({"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None})
        resp = client.post(
            f"/api/v1/billing/requests/{sub_id}/confirm/", headers=HEADERS,
            json={"payment_reference": "OM-123", "amount_paid_gnf": 545000},
        )
        assert resp.status_code == 200, resp.text
        with SessionLocal() as db:
            event = (
                db.query(BillingEvent)
                .filter(BillingEvent.tenant_id == tenant_id, BillingEvent.event_type == "subscription.payment_confirmed")
                .first()
            )
            assert event.payload["amount_paid_gnf"] == 545000
            tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            assert tenant.settings["quotas"]["max_students"] is None  # offre illimitée


# ─── 5. Quotas illimités ──────────────────────────────────────────────────────

class TestUnlimitedQuota:
    def test_unlimited_plan_writes_an_explicit_none(self):
        tenant = SimpleNamespace(settings={"quotas": {"max_students": 500}})
        apply_quota_limits(tenant, None, None)
        assert tenant.settings["quotas"] == {"max_students": None, "max_storage_mb": None}

    def test_middleware_does_not_cap_an_unlimited_plan_at_the_default(self):
        tenant_id = _make_tenant("premium", settings={"quotas": {"max_students": None}})
        middleware = QuotaMiddleware(app=MagicMock())
        with patch.object(QuotaMiddleware, "_count_resources", return_value=5000) as count:
            exceeded, _, _ = asyncio.run(middleware._check_quota(MagicMock(), tenant_id, "max_students"))
        assert exceeded is False
        count.assert_not_called()

    def test_middleware_still_enforces_a_finite_plan(self):
        tenant_id = _make_tenant("standard", settings={"quotas": {"max_students": 500}})
        middleware = QuotaMiddleware(app=MagicMock())
        with patch.object(QuotaMiddleware, "_count_resources", return_value=500):
            exceeded, current, limit = asyncio.run(middleware._check_quota(MagicMock(), tenant_id, "max_students"))
        assert (exceeded, current, limit) == (True, 500, 500)


# ─── 6. Changement manuel par le SUPER_ADMIN ──────────────────────────────────

class TestPlatformPlanUpdate:
    def test_free_plan_can_no_longer_be_assigned(self, as_user):
        tenant_id = _make_tenant()
        as_user({"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None})
        resp = client.patch(f"/api/v1/platform/tenants/{tenant_id}/subscription/", headers=HEADERS, json={"plan": "starter"})
        assert resp.status_code == 422

    def test_new_plan_applies_its_student_limit(self, as_user):
        tenant_id = _make_tenant(settings={"quotas": {"max_students": 500}})
        as_user({"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None})
        resp = client.patch(f"/api/v1/platform/tenants/{tenant_id}/subscription/", headers=HEADERS, json={"plan": "medium"})
        assert resp.status_code == 200, resp.text
        with SessionLocal() as db:
            assert db.query(Tenant).filter(Tenant.id == tenant_id).first().settings["quotas"]["max_students"] == 999


# ─── 7. Migration des établissements existants ────────────────────────────────

def _load_migration():
    spec = importlib.util.spec_from_file_location("pricing_grid_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def migration_db():
    """Base SQLite jetable avec les seules tables touchées par la migration."""
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text(
            "CREATE TABLE subscription_plans (id TEXT PRIMARY KEY, name TEXT, slug TEXT UNIQUE, description TEXT,"
            " currency TEXT, price_monthly FLOAT, price_yearly FLOAT, max_students INT, max_users INT,"
            " max_storage_gb INT, max_ai_requests INT, max_exports_per_day INT, max_campuses INT, features JSON,"
            " is_active BOOLEAN, sort_order INT, created_at DATETIME, updated_at DATETIME)"
        ))
        conn.execute(sa.text("CREATE TABLE tenant_subscriptions (id TEXT PRIMARY KEY, plan_id TEXT)"))
        conn.execute(sa.text(
            "CREATE TABLE tenants (id TEXT PRIMARY KEY, subscription_plan TEXT, subscription_status TEXT,"
            " trial_ends_at DATETIME, settings JSON)"
        ))
        for slug in ("free", "starter", "pro", "enterprise", "institution"):
            conn.execute(sa.text(
                "INSERT INTO subscription_plans (id, name, slug, currency, price_monthly, is_active)"
                " VALUES (:id, :slug, :slug, 'USD', 1, 1)"
            ), {"id": str(uuid.uuid4()), "slug": slug})
    return engine


def _run(engine, step: str):
    from alembic.operations import Operations
    from alembic.runtime.migration import MigrationContext

    module = _load_migration()
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            getattr(module, step)()


def _insert_tenants(engine, rows):
    with engine.begin() as conn:
        for tid, plan, status, end in rows:
            conn.execute(sa.text(
                "INSERT INTO tenants VALUES (:id, :plan, :status, :end, :settings)"
            ), {"id": tid, "plan": plan, "status": status, "end": end, "settings": json.dumps({"x": 1})})


def _tenants(engine) -> dict:
    with engine.connect() as conn:
        rows = conn.execute(sa.text("SELECT id, subscription_plan, subscription_status, trial_ends_at, settings FROM tenants"))
        return {r.id: r for r in rows}


class TestMigration:
    def test_existing_schools_move_to_the_new_grid_and_back(self, migration_db):
        future = (_now() + timedelta(days=10)).replace(microsecond=0)
        _insert_tenants(migration_db, [
            ("trial-pro", "pro", "trialing", future),
            ("trial-open", "starter", "trialing", None),
            ("free-active", "starter", "active", None),
            ("paid-pro", "pro", "active", None),
            ("expired", "starter", "expired", None),
        ])

        _run(migration_db, "upgrade")
        after = _tenants(migration_db)
        assert (after["trial-pro"].subscription_plan, after["trial-pro"].subscription_status) == ("standard", "trialing")
        assert str(after["trial-pro"].trial_ends_at).startswith(str(future)[:19])
        for tid in ("trial-open", "free-active"):
            assert (after[tid].subscription_plan, after[tid].subscription_status) == ("standard", "trialing")
            end = datetime.fromisoformat(str(after[tid].trial_ends_at))
            assert timedelta(days=29) < end - _now() <= timedelta(days=30)
        assert (after["paid-pro"].subscription_plan, after["paid-pro"].subscription_status) == ("pro", "active")
        assert (after["expired"].subscription_plan, after["expired"].subscription_status) == ("starter", "expired")
        with migration_db.connect() as conn:
            active = {r[0] for r in conn.execute(sa.text("SELECT slug FROM subscription_plans WHERE is_active = 1"))}
        assert active == {"standard", "medium", "premium", "enterprise"}

        _run(migration_db, "upgrade")  # idempotent
        assert _tenants(migration_db)["free-active"].trial_ends_at == after["free-active"].trial_ends_at

        _run(migration_db, "downgrade")
        restored = _tenants(migration_db)
        assert (restored["free-active"].subscription_plan, restored["free-active"].subscription_status) == ("starter", "active")
        assert restored["trial-open"].trial_ends_at is None
        assert json.loads(restored["trial-open"].settings) == {"x": 1}
        with migration_db.connect() as conn:
            slugs = {r[0] for r in conn.execute(sa.text("SELECT slug FROM subscription_plans WHERE is_active = 1"))}
        assert slugs == {"free", "starter", "pro", "enterprise", "institution"}


def _is_sqlite() -> bool:
    from app.core.config import settings
    return settings.is_sqlite


@pytest.mark.skipif(_is_sqlite(), reason="Catalogue migré : uniquement après `alembic upgrade head` sur PostgreSQL (CI).")
def test_migrated_database_offers_only_the_new_grid():
    from app.core.database import engine

    with engine.connect() as conn:
        rows = {
            r.slug: r
            for r in conn.execute(sa.text("SELECT slug, currency, price_monthly, is_active FROM subscription_plans"))
        }
    assert [(rows[s].currency, rows[s].price_monthly, rows[s].is_active) for s in ("standard", "medium", "premium", "enterprise")] == [
        ("EUR", 49.99, True), ("EUR", 99.99, True), ("EUR", 499.99, True), ("EUR", 0.0, True),
    ]
    assert not any(rows[s].is_active for s in ("free", "starter", "pro", "institution") if s in rows)
