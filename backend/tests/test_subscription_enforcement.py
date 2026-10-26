"""Abonnement échu : lecture seule pendant SUBSCRIPTION_READ_ONLY_DAYS, puis blocage.

Décision produit du 2026-10-26 (pas d'offre gratuite) : un établissement dont
l'essai ou l'abonnement est terminé ne perdait que l'IA et l'import — tout le
reste restait utilisable gratuitement. Désormais (get_current_user) :
- lecture seule pendant 15 jours : lectures permises, écritures refusées (402) ;
- puis blocage : tout refusé hors connexion, facturation, MFA et lectures
  d'interface (profil, configuration de l'établissement) ;
- SUPER_ADMIN et sessions d'impersonation non concernés ;
- SUBSCRIPTION_ENFORCEMENT=false coupe le contrôle.
Et la tâche quotidienne expire enfin les abonnements payés (elle n'était
planifiée nulle part).
"""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.models.saas import SubscriptionPlan, TenantSubscription  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402
from app.services.plan_catalog import (  # noqa: E402
    ACCESS_BLOCKED,
    ACCESS_FULL,
    ACCESS_READ_ONLY,
    ENDED_AT_KEY,
    subscription_access,
)
from app.services.subscription_maintenance import expire_overdue_subscriptions, stamp_lapsed_tenants  # noqa: E402

STUDENTS_URL = "/api/v1/students/"
DAYS = 15


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _t(plan="standard", status="trialing", trial_ends_at=None, settings_=None):
    return SimpleNamespace(subscription_plan=plan, subscription_status=status,
                           trial_ends_at=trial_ends_at, settings=settings_ or {})


# ─── 1. Règle d'accès ─────────────────────────────────────────────────────────

class TestSubscriptionAccess:
    NOW = datetime(2026, 11, 10, 12, 0)

    @pytest.mark.parametrize("plan", ["standard", "premium", "enterprise", "pro"])
    def test_paid_active_plan_has_full_access(self, plan):
        assert subscription_access(_t(plan, "active"), self.NOW, DAYS) == (ACCESS_FULL, None)

    def test_trial_in_progress_has_full_access(self):
        tenant = _t(trial_ends_at=self.NOW + timedelta(days=1))
        assert subscription_access(tenant, self.NOW, DAYS)[0] == ACCESS_FULL

    def test_ended_trial_is_read_only_for_the_grace_period(self):
        ended = self.NOW - timedelta(days=3)
        assert subscription_access(_t(trial_ends_at=ended), self.NOW, DAYS) == (
            ACCESS_READ_ONLY, ended + timedelta(days=DAYS),
        )

    def test_ended_trial_is_blocked_after_the_grace_period(self):
        tenant = _t(trial_ends_at=self.NOW - timedelta(days=DAYS + 1))
        assert subscription_access(tenant, self.NOW, DAYS)[0] == ACCESS_BLOCKED

    def test_expired_subscription_counts_from_its_end_date(self):
        ended = self.NOW - timedelta(days=DAYS + 2)
        tenant = _t("medium", "expired", settings_={ENDED_AT_KEY: ended.isoformat()})
        assert subscription_access(tenant, self.NOW, DAYS)[0] == ACCESS_BLOCKED

    @pytest.mark.parametrize("status", ["expired", "canceled", "past_due"])
    def test_lapsed_without_known_date_stays_read_only_until_stamped(self, status):
        assert subscription_access(_t("standard", status), self.NOW, DAYS) == (ACCESS_READ_ONLY, None)

    def test_former_free_plan_marked_active_is_not_paid(self):
        assert subscription_access(_t("starter", "active"), self.NOW, DAYS)[0] == ACCESS_READ_ONLY


# ─── 2. Contrôle par requête ──────────────────────────────────────────────────

def _make_tenant(**fields) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name="École Abonnement", slug=f"abo-{tenant_id[:8]}", type="school",
                      country="GN", is_active=True, settings=fields.pop("settings", {}), **fields))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str | None, role: str = "TENANT_ADMIN") -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=user_id, tenant_id=tenant_id, email=f"a.{user_id[:8]}@ecole.gn", username=f"a.{user_id[:8]}",
                    first_name="Mariama", last_name="Sow", password_hash="x", is_active=True))
        db.add(UserRole(id=str(uuid.uuid4()), user_id=user_id, role=role))
        db.commit()
    return user_id


def _headers(user_id: str, tenant_id: str | None, roles: tuple = (), **claims) -> dict:
    token = create_access_token({"sub": user_id, "tenant_id": tenant_id, "roles": list(roles), "jti": uuid.uuid4().hex[:16],
                                 "auth_time": int(_now().timestamp()), **claims})
    return {"Authorization": f"Bearer {token}"}


def _admin_of(**tenant_fields) -> tuple[str, dict]:
    tenant_id = _make_tenant(**tenant_fields)
    return tenant_id, _headers(_make_user(tenant_id), tenant_id)


def _read_only_tenant():
    return _admin_of(trial_ends_at=_now() - timedelta(days=3))


def _blocked_tenant():
    return _admin_of(trial_ends_at=_now() - timedelta(days=settings.SUBSCRIPTION_READ_ONLY_DAYS + 5))


class TestReadOnly:
    def test_reads_are_allowed(self):
        _, headers = _read_only_tenant()
        assert client.get(STUDENTS_URL, headers=headers).status_code == 200

    def test_writes_are_refused_with_402(self):
        _, headers = _read_only_tenant()
        resp = client.post(STUDENTS_URL, headers=headers, json={})
        assert resp.status_code == 402
        body = resp.json()
        assert body["error"] == "SUBSCRIPTION_READ_ONLY"
        assert "lecture seule" in body["message"]
        assert body["read_only_until"]

    def test_billing_reports_the_access_level(self):
        _, headers = _read_only_tenant()
        body = client.get("/api/v1/billing/subscription/", headers=headers).json()
        assert body["access"] == "read_only"
        assert body["read_only_until"]


class TestBlocked:
    def test_everything_is_refused(self):
        _, headers = _blocked_tenant()
        resp = client.get(STUDENTS_URL, headers=headers)
        assert resp.status_code == 402
        assert resp.json()["error"] == "SUBSCRIPTION_EXPIRED"

    @pytest.mark.parametrize("path", ["/api/v1/users/me/", "/api/v1/tenants/settings/", "/api/v1/billing/subscription/",
                                      "/api/v1/billing/plans/"])
    def test_interface_reads_and_billing_stay_open(self, path):
        _, headers = _blocked_tenant()
        assert client.get(path, headers=headers).status_code == 200, path

    def test_tenant_reports_are_not_readable(self):
        _, headers = _blocked_tenant()
        assert client.get("/api/v1/tenants/men-guinea/", headers=headers).status_code == 402

    def test_admin_can_still_request_a_subscription(self):
        tenant_id, headers = _blocked_tenant()
        slug = f"abo-plan-{tenant_id[:8]}"
        with SessionLocal() as db:
            db.add(SubscriptionPlan(slug=slug, name="Abo", currency="EUR", price_monthly=10.0, price_yearly=100.0,
                                    is_active=True, features={}))
            db.commit()
        resp = client.post("/api/v1/billing/subscribe/", headers=headers, json={"plan_slug": slug})
        assert resp.status_code == 201, resp.text


class TestNotEnforced:
    def test_paid_active_tenant_has_full_access(self):
        _, headers = _admin_of(subscription_plan="standard", subscription_status="active", trial_ends_at=None)
        assert client.post(STUDENTS_URL, headers=headers, json={}).status_code != 402

    def test_trial_in_progress_has_full_access(self):
        _, headers = _admin_of()  # essai de 30 jours par défaut
        assert client.post(STUDENTS_URL, headers=headers, json={}).status_code != 402

    def test_super_admin_reaches_a_blocked_tenant(self):
        tenant_id = _make_tenant(trial_ends_at=_now() - timedelta(days=60))
        headers = {**_headers(_make_user(None, "SUPER_ADMIN"), None, roles=("SUPER_ADMIN",)), "X-Tenant-ID": tenant_id}
        assert client.get(STUDENTS_URL, headers=headers).status_code == 200

    def test_impersonation_session_is_not_blocked(self):
        tenant_id = _make_tenant(trial_ends_at=_now() - timedelta(days=60))
        headers = _headers(_make_user(tenant_id), tenant_id, impersonated_by=str(uuid.uuid4()))
        assert client.get(STUDENTS_URL, headers=headers).status_code == 200

    def test_enforcement_switch_disables_the_control(self, monkeypatch):
        _, headers = _blocked_tenant()
        monkeypatch.setattr(settings, "SUBSCRIPTION_ENFORCEMENT", False)
        assert client.get(STUDENTS_URL, headers=headers).status_code == 200


class TestAccessComesBack:
    def test_super_admin_reactivation_restores_access(self):
        tenant_id, headers = _admin_of(subscription_plan="standard", subscription_status="active", trial_ends_at=None)
        super_headers = _headers(_make_user(None, "SUPER_ADMIN"), None, roles=("SUPER_ADMIN",))

        assert client.patch(f"/api/v1/platform/tenants/{tenant_id}/subscription/", headers=super_headers,
                            json={"status": "canceled"}).status_code == 200
        with SessionLocal() as db:
            assert ENDED_AT_KEY in db.query(Tenant).filter(Tenant.id == tenant_id).first().settings
        assert client.post(STUDENTS_URL, headers=headers, json={}).status_code == 402

        assert client.patch(f"/api/v1/platform/tenants/{tenant_id}/subscription/", headers=super_headers,
                            json={"status": "active"}).status_code == 200
        assert client.post(STUDENTS_URL, headers=headers, json={}).status_code != 402
        with SessionLocal() as db:
            assert ENDED_AT_KEY not in db.query(Tenant).filter(Tenant.id == tenant_id).first().settings


# ─── 3. Tâche quotidienne ─────────────────────────────────────────────────────

class TestDailyJob:
    def test_expiry_starts_the_grace_period_at_the_period_end(self):
        tenant_id = _make_tenant(subscription_plan="standard", subscription_status="active", trial_ends_at=None)
        period_end = _now() - timedelta(days=2)
        with SessionLocal() as db:
            db.add(TenantSubscription(tenant_id=tenant_id, status="active", billing_cycle="monthly",
                                      payment_provider="orange_money", current_period_end=period_end))
            db.commit()
            expire_overdue_subscriptions(db)
        with SessionLocal() as db:
            tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            assert tenant.subscription_status == "expired"
            assert tenant.settings[ENDED_AT_KEY].startswith(period_end.isoformat()[:16])

    def test_lapsed_tenant_without_date_gets_stamped_once(self):
        lapsed = _make_tenant(subscription_plan="standard", subscription_status="canceled", trial_ends_at=None)
        trial_over = _make_tenant(trial_ends_at=_now() - timedelta(days=1))
        paid = _make_tenant(subscription_plan="standard", subscription_status="active", trial_ends_at=None)
        with SessionLocal() as db:
            first = stamp_lapsed_tenants(db)
            again = stamp_lapsed_tenants(db)
        slugs = {f"abo-{t[:8]}" for t in (lapsed, trial_over, paid)}
        assert set(first["tenants"]) & slugs == {f"abo-{lapsed[:8]}"}
        assert not set(again["tenants"]) & slugs

    def test_job_is_scheduled_daily(self):
        from app.workers.tasks import WorkerSettings, expire_subscriptions_job

        assert any(job.coroutine is expire_subscriptions_job for job in WorkerSettings.cron_jobs)
