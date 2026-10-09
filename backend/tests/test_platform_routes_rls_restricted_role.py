"""PostgreSQL integration tests: SUPER_ADMIN platform routes work under the
restricted runtime role (NOSUPERUSER NOBYPASSRLS).

Follow-up of the 2026-10-07 incident fixed in #277 (middleware-exempt routes
with no tenant context). A SUPER_ADMIN acting platform-wide (no X-Tenant-ID)
also has NO tenant context — TenantMiddleware deliberately lets platform
roles through without one — so every strict RLS table was invisible to:

- POST /billing/requests/{id}/confirm|reject/ and GET /billing/requests/
  (Mobile Money subscription reconciliation: impossible to validate a payment);
- GET /platform/saas-metrics/ (real MRR and pending requests counted from
  tenant_subscriptions: always 0);
- POST /platform/tenants/{id}/impersonate/ (target admin never found);
- GET /platform/tenants/{id}/health/ (no activity ever reported);
- POST /platform/domains/{id}/mark-verified/ (domain never found).

Same harness as test_public_routes_rls_restricted_role.py: the REAL app runs
with `SessionLocal` swapped to a disposable restricted role; seeding goes
through the admin (superuser) engine. Requires Redis (privileged roles are
revocation-checked fail-closed).
"""
from __future__ import annotations

import uuid

import pytest
from conftest import get_test_client, redis_is_available

client = get_test_client()

import app.core.database as db_module  # noqa: E402
from app.core.database import engine  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

pytestmark = [
    pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Row-Level Security is PostgreSQL-specific."),
    pytest.mark.skipif(not redis_is_available(), reason="Requires a real Redis instance"),
]

RESTRICTED_ROLE = "test_platform_routes_rls_role"
RESTRICTED_PASSWORD = "test-only-restricted-role-password"  # noqa: S105 — disposable, local test DB only


def _uid() -> str:
    return str(uuid.uuid4())


def _admin_scalar(sql: str, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar()


def _seed(conn) -> dict:
    s = {"plan_id": _uid(), "plan_slug": f"rls-plan-{_uid()[:8]}"}
    conn.execute(text(
        "INSERT INTO subscription_plans (id, name, slug, currency, price_monthly, price_yearly, features, is_active, "
        "sort_order, created_at, updated_at) VALUES (:id, 'Plan RLS', :slug, 'GNF', 100000, 1000000, '{}', true, 99, now(), now())"
    ), {"id": s["plan_id"], "slug": s["plan_slug"]})
    for label in ("A", "B"):
        tid = _uid()
        conn.execute(text(
            "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
            "VALUES (:id, :name, :slug, 'primary', 'GN', true, '{}', now(), now())"
        ), {"id": tid, "name": f"École plateforme {label}", "slug": f"rls-plat-{label.lower()}-{tid[:8]}"})
        admin_id = _uid()
        conn.execute(text(
            "INSERT INTO users (id, email, username, tenant_id, password_hash, is_active, created_at, updated_at, "
            "mfa_enabled, must_change_password) VALUES (:id, :e, :e, :tid, 'x', true, now(), now(), false, false)"
        ), {"id": admin_id, "e": f"admin-{admin_id[:8]}@rls-tests.local", "tid": tid})
        conn.execute(text(
            "INSERT INTO user_roles (id, user_id, role, tenant_id, created_at, updated_at) "
            "VALUES (:id, :uid, 'TENANT_ADMIN', :tid, now(), now())"
        ), {"id": _uid(), "uid": admin_id, "tid": tid})
        sub_id = _uid()
        conn.execute(text(
            "INSERT INTO tenant_subscriptions (id, tenant_id, plan_id, status, billing_cycle, payment_provider, "
            "created_at, updated_at) VALUES (:id, :tid, :pid, 'pending_payment', 'monthly', 'mobile_money', now(), now())"
        ), {"id": sub_id, "tid": tid, "pid": s["plan_id"]})
        domain_id = _uid()
        conn.execute(text(
            "INSERT INTO tenant_domains (id, tenant_id, domain, domain_type, is_primary, is_verified, created_at, updated_at) "
            "VALUES (:id, :tid, :d, 'custom', false, false, now(), now())"
        ), {"id": domain_id, "tid": tid, "d": f"ecole-{tid[:8]}.example.org"})
        conn.execute(text(
            "INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, created_at, updated_at) "
            "VALUES (:id, :tid, :uid, 'LOGIN', 'USER', now(), now())"
        ), {"id": _uid(), "tid": tid, "uid": admin_id})
        metrics_sub_id = _uid()
        conn.execute(text(
            "INSERT INTO tenant_subscriptions (id, tenant_id, plan_id, status, billing_cycle, payment_provider, "
            "created_at, updated_at) VALUES (:id, :tid, :pid, 'pending_payment', 'yearly', 'mobile_money', now(), now())"
        ), {"id": metrics_sub_id, "tid": tid, "pid": s["plan_id"]})
        s[label] = {"tenant_id": tid, "admin_id": admin_id, "sub_id": sub_id, "domain_id": domain_id,
                    "metrics_sub_id": metrics_sub_id}
    s["super_admin_id"] = _uid()
    conn.execute(text(
        "INSERT INTO users (id, email, username, tenant_id, password_hash, is_active, created_at, updated_at, "
        "mfa_enabled, must_change_password) VALUES (:id, :e, :e, NULL, 'x', true, now(), now(), false, false)"
    ), {"id": s["super_admin_id"], "e": f"sa-{s['super_admin_id'][:8]}@rls-tests.local"})
    conn.execute(text(
        "INSERT INTO user_roles (id, user_id, role, tenant_id, created_at, updated_at) "
        "VALUES (:id, :uid, 'SUPER_ADMIN', NULL, now(), now())"
    ), {"id": _uid(), "uid": s["super_admin_id"]})
    return s


class TestPlatformRoutesUnderRestrictedRole:

    @pytest.fixture(scope="class")
    def seeded(self):
        with engine.begin() as conn:
            return _seed(conn)

    @pytest.fixture(scope="class")
    def restricted_role(self):
        with engine.connect() as setup_conn:
            try:
                setup_conn.execute(text(f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'))
                setup_conn.commit()
            except Exception:
                setup_conn.rollback()
            setup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
            setup_conn.execute(text(
                f'CREATE ROLE "{RESTRICTED_ROLE}" LOGIN PASSWORD \'{RESTRICTED_PASSWORD}\' '
                "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"
            ))
            setup_conn.execute(text(f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "{RESTRICTED_ROLE}"'))
            setup_conn.commit()
        yield RESTRICTED_ROLE
        with engine.connect() as cleanup_conn:
            cleanup_conn.execute(text(f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'))
            cleanup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
            cleanup_conn.commit()

    @pytest.fixture(autouse=True)
    def restricted_session_local(self, restricted_role, monkeypatch):
        url = make_url(engine.url.render_as_string(hide_password=False))
        restricted_url = url.set(username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD)
        restricted_engine = create_engine(restricted_url.render_as_string(hide_password=False), poolclass=StaticPool)
        with restricted_engine.connect() as conn:
            is_super, bypasses_rls = conn.execute(
                text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
            ).one()
            assert not is_super and not bypasses_rls, "test setup bug: restricted role bypasses RLS"
        monkeypatch.setattr(
            db_module, "SessionLocal", sessionmaker(bind=restricted_engine, autocommit=False, autoflush=False)
        )
        from app.core.security import get_current_user as _gcu
        app.dependency_overrides.pop(_gcu, None)
        yield
        restricted_engine.dispose()

    @staticmethod
    def _super(seeded) -> dict:
        token = create_access_token({"sub": seeded["super_admin_id"], "tenant_id": None, "roles": ["SUPER_ADMIN"]})
        return {"Authorization": f"Bearer {token}"}

    # -- billing reconciliation (Mobile Money subscriptions) -------------------

    def test_pending_requests_lists_every_tenant(self, seeded):
        resp = client.get("/api/v1/billing/requests/", headers=self._super(seeded))
        assert resp.status_code == 200, resp.text
        ids = {item["id"] for item in resp.json()["items"]}
        assert {seeded["A"]["sub_id"], seeded["B"]["sub_id"]} <= ids

    def test_confirm_activates_only_that_tenant(self, seeded):
        a, b = seeded["A"], seeded["B"]
        resp = client.post(f"/api/v1/billing/requests/{a['sub_id']}/confirm/", json={"payment_reference": "OM-RLS-1"},
                           headers=self._super(seeded))
        assert resp.status_code == 200, resp.text
        assert _admin_scalar("SELECT status FROM tenant_subscriptions WHERE id = :i", i=a["sub_id"]) == "active"
        assert _admin_scalar("SELECT subscription_status FROM tenants WHERE id = :t", t=a["tenant_id"]) == "active"
        assert _admin_scalar("SELECT status FROM tenant_subscriptions WHERE id = :i", i=b["sub_id"]) == "pending_payment"

    def test_reject_finds_the_request(self, seeded):
        b = seeded["B"]
        resp = client.post(f"/api/v1/billing/requests/{b['sub_id']}/reject/", json={"reason": "Paiement introuvable"},
                           headers=self._super(seeded))
        assert resp.status_code == 200, resp.text
        assert _admin_scalar("SELECT status FROM tenant_subscriptions WHERE id = :i", i=b["sub_id"]) == "rejected"

    def test_confirm_unknown_request_is_404(self, seeded):
        resp = client.post(f"/api/v1/billing/requests/{_uid()}/confirm/", json={}, headers=self._super(seeded))
        assert resp.status_code == 404, resp.text

    # -- platform dashboards ----------------------------------------------------

    def test_saas_metrics_sees_tenant_subscriptions(self, seeded):
        resp = client.get("/api/v1/platform/saas-metrics/", headers=self._super(seeded))
        assert resp.status_code == 200, resp.text
        local_billing = resp.json()["local_billing"]
        # 2 dedicated pending requests (one per tenant) are never touched by other tests.
        assert local_billing["pending_requests"] >= 2, "pending requests must be counted across every tenant"

    def test_tenant_health_reports_activity(self, seeded):
        a = seeded["A"]
        resp = client.get(f"/api/v1/platform/tenants/{a['tenant_id']}/health/", headers=self._super(seeded))
        assert resp.status_code == 200, resp.text
        assert resp.json().get("last_activity_at"), "the tenant's audit activity must be visible"

    def test_impersonate_finds_the_tenant_admin(self, seeded):
        a = seeded["A"]
        resp = client.post(f"/api/v1/platform/tenants/{a['tenant_id']}/impersonate/", headers=self._super(seeded))
        assert resp.status_code == 200, resp.text
        assert resp.json()["access_token"]

    # -- custom domains ----------------------------------------------------------

    def test_mark_domain_verified_finds_the_domain(self, seeded):
        a = seeded["A"]
        resp = client.post(f"/api/v1/platform/domains/{a['domain_id']}/mark-verified/", headers=self._super(seeded))
        assert resp.status_code == 200, resp.text
        assert _admin_scalar("SELECT is_verified FROM tenant_domains WHERE id = :i", i=a["domain_id"]) is True

    # -- tenant administration from the platform screen (2026-10-08 report) ----

    def test_reset_tenant_admin_password_finds_the_admin(self, seeded):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, patch

        tid, admin_id = seeded["A"]["tenant_id"], seeded["A"]["admin_id"]
        with patch(
            "app.services.account_provisioning.deliver_password_setup_link",
            new=AsyncMock(return_value=SimpleNamespace(token="t", expires_in=900)),
        ), patch("app.api.v1.endpoints.core.auth.blacklist_all_user_tokens", new=AsyncMock()):
            resp = client.post(f"/api/v1/tenants/{tid}/admins/{admin_id}/reset-password/", headers=self._super(seeded))
        assert resp.status_code == 200, resp.text
        assert _admin_scalar("SELECT must_change_password FROM users WHERE id = :u", u=admin_id) is True
        assert _admin_scalar(
            "SELECT count(*) FROM audit_logs WHERE resource_id = :u AND action = 'RESET_PASSWORD'", u=admin_id
        ) == 1

    def test_delete_tenant_removes_it_and_its_data(self, seeded, caplog):
        with engine.begin() as conn:
            tid = _uid()
            conn.execute(text(
                "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
                "VALUES (:id, 'Université à supprimer', :slug, 'university', 'GN', true, '{}', now(), now())"
            ), {"id": tid, "slug": f"rls-del-{tid[:8]}"})
            uid = _uid()
            conn.execute(text(
                "INSERT INTO users (id, email, username, tenant_id, password_hash, is_active, created_at, updated_at, "
                "mfa_enabled, must_change_password) VALUES (:id, :e, :e, :tid, 'x', true, now(), now(), false, false)"
            ), {"id": uid, "e": f"del-{uid[:8]}@rls-tests.local", "tid": tid})
            conn.execute(text(
                "INSERT INTO user_roles (id, user_id, role, tenant_id, created_at, updated_at) "
                "VALUES (:id, :uid, 'TENANT_ADMIN', :tid, now(), now())"
            ), {"id": _uid(), "uid": uid, "tid": tid})

        import logging

        with caplog.at_level(logging.WARNING, logger="app.api.v1.endpoints.core.tenants"):
            resp = client.delete(f"/api/v1/tenants/{tid}/", headers=self._super(seeded))
        assert resp.status_code == 200, resp.text
        assert any(f"Tenant deleted: id={tid}" in r.getMessage() and "users=1" in r.getMessage() for r in caplog.records)
        assert _admin_scalar("SELECT count(*) FROM tenants WHERE id = :t", t=tid) == 0
        assert _admin_scalar("SELECT count(*) FROM users WHERE tenant_id = :t", t=tid) == 0
        # The platform trail survives the tenant (20261011_0001).
        assert _admin_scalar(
            "SELECT count(*) FROM platform_audit_logs WHERE action = 'DELETE_TENANT' AND target_id = :t", t=tid
        ) == 1

    def test_list_tenant_admins_is_not_empty(self, seeded):
        tid, admin_id = seeded["B"]["tenant_id"], seeded["B"]["admin_id"]
        resp = client.get(f"/api/v1/tenants/{tid}/admins/", headers=self._super(seeded))
        assert resp.status_code == 200, resp.text
        assert [a["id"] for a in resp.json()] == [admin_id]

    def test_toggle_tenant_status_is_audited(self, seeded):
        tid = seeded["B"]["tenant_id"]
        try:
            resp = client.patch(f"/api/v1/tenants/{tid}/toggle-status/", headers=self._super(seeded))
            assert resp.status_code == 200, resp.text
            assert resp.json()["is_active"] is False
            assert _admin_scalar(
                "SELECT count(*) FROM audit_logs WHERE tenant_id = :t AND action = 'DEACTIVATE_TENANT'", t=tid
            ) == 1
            assert _admin_scalar(
                "SELECT count(*) FROM platform_audit_logs WHERE target_id = :t AND action = 'DEACTIVATE_TENANT'", t=tid
            ) == 1
        finally:
            with engine.begin() as conn:
                conn.execute(text("UPDATE tenants SET is_active = true WHERE id = :t"), {"t": tid})

    def test_super_admin_update_of_a_tenant_is_persisted(self, seeded):
        tid = seeded["B"]["tenant_id"]
        resp = client.patch(f"/api/v1/tenants/{tid}/", json={"city": "Kankan"}, headers=self._super(seeded))
        assert resp.status_code == 200, resp.text
        assert _admin_scalar("SELECT city FROM tenants WHERE id = :t", t=tid) == "Kankan"
