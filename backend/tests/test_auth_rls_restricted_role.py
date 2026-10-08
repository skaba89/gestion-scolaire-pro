"""PostgreSQL integration tests: authentication is RLS-safe under the
restricted `schoolflow_app` role (NOSUPERUSER NOBYPASSRLS) - the auth/RLS
compatibility pass described in docs/POSTGRES_APP_ROLE.md, following on
from PR "propagate tenant RLS context through ARQ workers" (#261), which
fixed background jobs but left a more severe blocker undiscovered until
this pass: app/core/security.py::get_current_user() (and, it turned out,
/auth/login/, /auth/refresh/, /mfa/login/verify/, /auth/change-password/,
/auth/reset-forced-password/, the two registration email-uniqueness
checks, /users/me/, and the WebSocket auth in realtime.py) all opened a
database session with no - or the wrong - RLS tenant context, making a
real tenant-scoped user invisible to their own authentication queries the
moment the connecting role genuinely enforces RLS instead of bypassing it.

These tests run against a REAL PostgreSQL 16 instance using a disposable,
genuinely restricted role created inline (same pattern as
test_worker_rls_tenant_context.py and the RLS migration tests) - a
superuser bypasses RLS unconditionally, so testing against the admin
engine would prove nothing about the actual bug or its fix.

`app.core.database.SessionLocal` is monkeypatched to a sessionmaker bound
to the restricted role for the duration of each test, exactly like
test_worker_rls_tenant_context.py: get_db(), get_current_user(),
find_user_across_all_tenants(), resolve_authenticated_user_row() and the
WebSocket handler all resolve `SessionLocal` from app.core.database's own
module globals at call time, so this swap exercises the REAL production
code end to end through the REAL FastAPI app (TestClient), not a
reimplementation of the fix.
"""
from __future__ import annotations

import uuid

import pytest
from conftest import get_test_client, redis_is_available

client = get_test_client()

import app.core.database as db_module  # noqa: E402
from app.core.database import (  # noqa: E402
    engine,
    find_user_across_all_tenants,
    resolve_authenticated_user_row,
)
from app.core.security import get_password_hash  # noqa: E402
from app.main import app  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Row-Level Security is PostgreSQL-specific.",
)
_needs_redis = pytest.mark.skipif(not redis_is_available(), reason="Requires a real Redis instance")

RESTRICTED_ROLE = "test_auth_rls_restricted_role"
RESTRICTED_PASSWORD = "test-only-restricted-role-password"  # noqa: S105 — disposable, local test DB only

PLAIN_PASSWORD = "Sup3r@Secure-Pw-2026!"  # noqa: S105 — disposable test fixture password


def _make_tenant(admin_conn, name: str) -> str:
    tenant_id = str(uuid.uuid4())
    admin_conn.execute(
        text(
            "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
            "VALUES (:id, :name, :slug, 'primary', 'GN', true, '{}', now(), now())"
        ),
        {"id": tenant_id, "name": name, "slug": f"auth-rls-{tenant_id[:8]}"},
    )
    return tenant_id


def _make_user(admin_conn, tenant_id, email: str, role: str = "TEACHER") -> str:
    user_id = str(uuid.uuid4())
    admin_conn.execute(
        text(
            "INSERT INTO users "
            "(id, email, username, tenant_id, password_hash, is_active, created_at, updated_at, "
            "mfa_enabled, must_change_password) "
            "VALUES (:id, :email, :email, :tid, :pw, true, now(), now(), false, false)"
        ),
        {"id": user_id, "email": email, "tid": tenant_id, "pw": get_password_hash(PLAIN_PASSWORD)},
    )
    admin_conn.execute(
        text(
            "INSERT INTO user_roles (id, user_id, role, tenant_id, created_at, updated_at) "
            "VALUES (:id, :uid, :role, :tid, now(), now())"
        ),
        {"id": str(uuid.uuid4()), "uid": user_id, "role": role, "tid": tenant_id},
    )
    return user_id


@requires_postgres
class TestAuthRlsRestrictedRole:
    """All tests share one disposable restricted role and one
    restricted-only SessionLocal, swapped into app.core.database for the
    duration of each test so the REAL app (TestClient) runs its auth code
    as a genuinely NOSUPERUSER NOBYPASSRLS connection."""

    @pytest.fixture(scope="class", autouse=True)
    def _disable_auth_rate_limiter(self):
        """This file calls the real POST /auth/login/ many times, which
        shares its 5/minute-per-IP limiter with every other test hitting
        auth endpoints in the same full-suite run - disabled here, same
        pattern as test_realtime_websocket_revocation_2026_09_28.py and
        test_registration_email_case_insensitive.py."""
        from app.api.v1.endpoints.core.auth import limiter as auth_limiter
        previous = auth_limiter.enabled
        auth_limiter.enabled = False
        yield
        auth_limiter.enabled = previous

    @pytest.fixture(scope="class")
    def restricted_role(self):
        with engine.connect() as setup_conn:
            try:
                setup_conn.execute(
                    text(f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"')
                )
                setup_conn.commit()
            except Exception:
                setup_conn.rollback()
            setup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
            setup_conn.execute(
                text(
                    f'CREATE ROLE "{RESTRICTED_ROLE}" LOGIN PASSWORD \'{RESTRICTED_PASSWORD}\' '
                    "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"
                )
            )
            setup_conn.execute(
                text(f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "{RESTRICTED_ROLE}"')
            )
            setup_conn.commit()

        yield RESTRICTED_ROLE

        with engine.connect() as cleanup_conn:
            cleanup_conn.execute(
                text(f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"')
            )
            cleanup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
            cleanup_conn.commit()

    @pytest.fixture
    def restricted_session_local(self, restricted_role, monkeypatch):
        url = make_url(engine.url.render_as_string(hide_password=False))
        restricted_url = url.set(username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD)
        restricted_engine = create_engine(
            restricted_url.render_as_string(hide_password=False), poolclass=StaticPool
        )

        with restricted_engine.connect() as conn:
            is_super, bypasses_rls = conn.execute(
                text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
            ).one()
            assert not is_super, "test setup bug: restricted role is a superuser"
            assert not bypasses_rls, "test setup bug: restricted role has BYPASSRLS"

        restricted_sessionmaker = sessionmaker(bind=restricted_engine, autocommit=False, autoflush=False)
        monkeypatch.setattr(db_module, "SessionLocal", restricted_sessionmaker)

        yield restricted_sessionmaker

        restricted_engine.dispose()

    @pytest.fixture(autouse=True)
    def _clear_dependency_overrides(self):
        """Some other test module may leave a get_current_user override
        registered on the shared `app` singleton - this file needs the
        real dependency chain to run end to end."""
        from app.core.security import get_current_user as _gcu
        app.dependency_overrides.pop(_gcu, None)
        yield
        app.dependency_overrides.pop(_gcu, None)

    # -- role validation ------------------------------------------------------

    def test_restricted_role_is_not_superuser_and_does_not_bypass_rls(self, restricted_role):
        url = make_url(engine.url.render_as_string(hide_password=False)).set(
            username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD
        )
        restricted_engine = create_engine(url.render_as_string(hide_password=False))
        try:
            with restricted_engine.connect() as conn:
                rolname, rolsuper, rolbypassrls = conn.execute(
                    text("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
                ).one()
                assert rolname == RESTRICTED_ROLE
                assert rolsuper is False
                assert rolbypassrls is False
        finally:
            restricted_engine.dispose()

    def test_restricted_role_cannot_run_ddl(self, restricted_role):
        url = make_url(engine.url.render_as_string(hide_password=False)).set(
            username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD
        )
        restricted_engine = create_engine(url.render_as_string(hide_password=False))
        try:
            with restricted_engine.connect() as conn:
                for stmt in (
                    "CREATE TABLE _ddl_probe (id int)",
                    "ALTER TABLE users ADD COLUMN _ddl_probe int",
                    "DROP TABLE users",
                ):
                    conn.rollback()
                    with pytest.raises(Exception):
                        conn.execute(text(stmt))
                        conn.commit()
                    conn.rollback()
        finally:
            restricted_engine.dispose()

    # -- login: the real HTTP path, real JWT, real get_current_user ----------

    def test_login_email_is_case_insensitive(self, restricted_session_local):
        """20261010_0001: emails are stored lowercased; typing them with
        another case (or surrounding spaces) must still log in."""
        with engine.begin() as admin_conn:
            tenant = _make_tenant(admin_conn, "Tenant (case login)")
            email = f"case-login-{uuid.uuid4().hex[:8]}@example.test"
            _make_user(admin_conn, tenant, email)

        resp = client.post(
            "/api/v1/auth/login/", data={"username": f"  {email.upper()} ", "password": PLAIN_PASSWORD}
        )
        assert resp.status_code == 200, resp.text

    def test_login_tenant_a_then_protected_route_returns_200(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (auth e2e)")
            email = f"user-a-{uuid.uuid4().hex[:8]}@example.test"
            _make_user(admin_conn, tenant_a, email)

        login_resp = client.post(
            "/api/v1/auth/login/", data={"username": email, "password": PLAIN_PASSWORD}
        )
        assert login_resp.status_code == 200, login_resp.text
        token = login_resp.json()["access_token"]

        me_resp = client.get("/api/v1/users/me/", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200, me_resp.text
        body = me_resp.json()
        assert body["user"]["email"] == email
        assert body["tenant"] is not None, (
            "tenant-scoped user's own profile must resolve their real tenant under RLS, "
            "not fall back to tenant=null"
        )
        assert body["tenant"]["id"] == tenant_a

    def test_second_tenants_user_can_also_log_in(self, restricted_session_local):
        """Not just the first tenant ever created - login must work for any
        tenant-scoped user, proving the fix isn't accidentally order-dependent."""
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (second)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (second)")
            _make_user(admin_conn, tenant_a, f"user-a2-{uuid.uuid4().hex[:8]}@example.test")
            email_b = f"user-b2-{uuid.uuid4().hex[:8]}@example.test"
            _make_user(admin_conn, tenant_b, email_b)

        login_resp = client.post(
            "/api/v1/auth/login/", data={"username": email_b, "password": PLAIN_PASSWORD}
        )
        assert login_resp.status_code == 200, login_resp.text

    def test_login_rejects_wrong_password_for_real_tenant_user(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (wrong pw)")
            email = f"user-wp-{uuid.uuid4().hex[:8]}@example.test"
            _make_user(admin_conn, tenant_a, email)

        resp = client.post("/api/v1/auth/login/", data={"username": email, "password": "wrong-password"})
        assert resp.status_code == 401

    def test_login_rejects_unknown_email(self, restricted_session_local):
        resp = client.post(
            "/api/v1/auth/login/",
            data={"username": f"nobody-{uuid.uuid4().hex[:8]}@example.test", "password": "whatever"},
        )
        assert resp.status_code == 401

    def test_token_a_cannot_use_x_tenant_id_header_to_reach_tenant_b(self, restricted_session_local):
        """A non-SUPER_ADMIN token's own tenant_id claim always wins over
        X-Tenant-ID (TenantMiddleware) - a spoofed header must never move
        this user's RLS context to a tenant they don't belong to."""
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (spoof)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (spoof)")
            email_a = f"user-spoof-{uuid.uuid4().hex[:8]}@example.test"
            _make_user(admin_conn, tenant_a, email_a)

        login_resp = client.post("/api/v1/auth/login/", data={"username": email_a, "password": PLAIN_PASSWORD})
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        me_resp = client.get(
            "/api/v1/users/me/",
            headers={"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_b},
        )
        assert me_resp.status_code == 200
        assert me_resp.json()["tenant"]["id"] == tenant_a, (
            "a spoofed X-Tenant-ID header must never override a non-SUPER_ADMIN's own tenant"
        )

    # -- WebSocket auth (realtime.py) -----------------------------------------

    @_needs_redis
    def test_websocket_tenant_a_connects_successfully(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (ws)")
            user_id = _make_user(admin_conn, tenant_a, f"user-ws-{uuid.uuid4().hex[:8]}@example.test")

        from app.core.security import create_access_token
        token = create_access_token({"sub": user_id, "tenant_id": tenant_a, "roles": ["TEACHER"]})

        with client.websocket_connect(f"/api/v1/realtime/ws/{tenant_a}/{user_id}?token={token}") as ws:
            assert ws is not None

    @_needs_redis
    def test_websocket_tenant_a_token_denied_for_tenant_b_path(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (ws deny)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (ws deny)")
            user_id = _make_user(admin_conn, tenant_a, f"user-wsdeny-{uuid.uuid4().hex[:8]}@example.test")

        from app.core.security import create_access_token
        token = create_access_token({"sub": user_id, "tenant_id": tenant_a, "roles": ["TEACHER"]})

        with pytest.raises(Exception):
            with client.websocket_connect(f"/api/v1/realtime/ws/{tenant_b}/{user_id}?token={token}"):
                pass  # the connection must be rejected before ever accepting

    # -- direct cross-tenant isolation on the auth-lookup helpers themselves --

    def test_resolve_authenticated_user_row_never_leaks_across_tenants(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (direct)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (direct)")
            user_b = _make_user(admin_conn, tenant_b, f"user-direct-b-{uuid.uuid4().hex[:8]}@example.test")

        db = db_module.SessionLocal()
        try:
            found = resolve_authenticated_user_row(db, user_b, tenant_a)
            assert found is None, "tenant A's context must never resolve tenant B's user"
            found_own = resolve_authenticated_user_row(db, user_b, tenant_b)
            assert found_own is not None
            assert str(found_own.id) == user_b
        finally:
            db.close()

    def test_find_user_across_all_tenants_finds_platform_user_first_cheaply(self, restricted_session_local):
        """A platform-level account (tenant_id IS NULL) must be found by
        the cheap NULL-context attempt, never requiring the tenant loop."""
        with engine.begin() as admin_conn:
            user_id = str(uuid.uuid4())
            email = f"platform-{uuid.uuid4().hex[:8]}@example.test"
            admin_conn.execute(
                text(
                    "INSERT INTO users (id, email, username, tenant_id, password_hash, is_active, "
                    "created_at, updated_at, mfa_enabled, must_change_password) "
                    "VALUES (:id, :email, :email, NULL, :pw, true, now(), now(), false, false)"
                ),
                {"id": user_id, "email": email, "pw": get_password_hash(PLAIN_PASSWORD)},
            )

        db = db_module.SessionLocal()
        try:
            from app.models.user import User
            found = find_user_across_all_tenants(db, lambda _db: _db.query(User).filter(User.email == email).first())
            assert found is not None
            assert str(found.id) == user_id
        finally:
            db.close()

    def test_find_user_across_all_tenants_finds_tenant_scoped_user_via_loop(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (loop)")
            email = f"loop-{uuid.uuid4().hex[:8]}@example.test"
            user_id = _make_user(admin_conn, tenant_a, email)

        db = db_module.SessionLocal()
        try:
            from app.models.user import User
            found = find_user_across_all_tenants(db, lambda _db: _db.query(User).filter(User.email == email).first())
            assert found is not None
            assert str(found.id) == user_id
        finally:
            db.close()

    # -- pool reuse: login A then login B must never cross-contaminate -------

    def test_pool_reuse_login_a_then_login_b_does_not_leak(self, restricted_session_local):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (pool)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (pool)")
            email_a = f"pool-a-{uuid.uuid4().hex[:8]}@example.test"
            email_b = f"pool-b-{uuid.uuid4().hex[:8]}@example.test"
            _make_user(admin_conn, tenant_a, email_a)
            _make_user(admin_conn, tenant_b, email_b)

        # restricted_session_local uses a StaticPool (one physical
        # connection total) - these two logins are forced to reuse the
        # exact same connection.
        resp_a = client.post("/api/v1/auth/login/", data={"username": email_a, "password": PLAIN_PASSWORD})
        assert resp_a.status_code == 200
        token_a = resp_a.json()["access_token"]

        resp_b = client.post("/api/v1/auth/login/", data={"username": email_b, "password": PLAIN_PASSWORD})
        assert resp_b.status_code == 200
        token_b = resp_b.json()["access_token"]

        me_a = client.get("/api/v1/users/me/", headers={"Authorization": f"Bearer {token_a}"})
        me_b = client.get("/api/v1/users/me/", headers={"Authorization": f"Bearer {token_b}"})
        assert me_a.status_code == 200 and me_a.json()["tenant"]["id"] == tenant_a
        assert me_b.status_code == 200 and me_b.json()["tenant"]["id"] == tenant_b

    # -- tenants has no RLS: require_plan relies on it ------------------------

    def test_tenants_table_has_no_rls_and_require_plan_works_under_restricted_role(
        self, restricted_session_local
    ):
        """require_plan ouvre SessionLocal() sans contexte tenant : cela ne
        fonctionne que parce que `tenants` n'a pas de RLS (migration
        659b47b029bd). Fige cet invariant et le comportement de bout en bout."""
        from fastapi import HTTPException
        from app.core.security import require_plan

        with restricted_session_local() as s:
            relrowsecurity = s.execute(
                text("SELECT relrowsecurity FROM pg_class WHERE relname = 'tenants'")
            ).scalar()
        assert relrowsecurity is False, "tenants must not have RLS enabled (require_plan reads it without tenant context)"

        with engine.begin() as admin_conn:
            pro_tenant = _make_tenant(admin_conn, "Tenant pro (require_plan)")
            starter_tenant = _make_tenant(admin_conn, "Tenant starter (require_plan)")
            admin_conn.execute(
                text("UPDATE tenants SET subscription_plan='pro', subscription_status='active' WHERE id = :id"),
                {"id": pro_tenant},
            )
            admin_conn.execute(
                text("UPDATE tenants SET subscription_plan='starter', subscription_status='active' WHERE id = :id"),
                {"id": starter_tenant},
            )

        pro_user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": pro_tenant}
        assert require_plan("pro")(current_user=pro_user) is pro_user

        starter_user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": starter_tenant}
        with pytest.raises(HTTPException) as exc:
            require_plan("pro")(current_user=starter_user)
        assert exc.value.status_code == 402
        assert exc.value.detail["current_plan"] == "starter"

    # -- cron: expire_overdue_subscriptions under the restricted role --------

    def test_expire_overdue_subscriptions_works_across_tenants_under_restricted_role(
        self, restricted_session_local
    ):
        from app.core.database import platform_db_session
        from app.services.subscription_maintenance import expire_overdue_subscriptions
        from datetime import datetime, timedelta, timezone

        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (cron)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (cron)")
            past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
            future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=30)
            sub_a = str(uuid.uuid4())
            sub_b_active = str(uuid.uuid4())
            admin_conn.execute(
                text(
                    "INSERT INTO tenant_subscriptions "
                    "(id, tenant_id, plan_id, status, payment_provider, current_period_end, "
                    "created_at, updated_at) "
                    "VALUES (:id, :tid, NULL, 'active', 'manual', :period_end, now(), now())"
                ),
                {"id": sub_a, "tid": tenant_a, "period_end": past},
            )
            admin_conn.execute(
                text(
                    "INSERT INTO tenant_subscriptions "
                    "(id, tenant_id, plan_id, status, payment_provider, current_period_end, "
                    "created_at, updated_at) "
                    "VALUES (:id, :tid, NULL, 'active', 'manual', :period_end, now(), now())"
                ),
                {"id": sub_b_active, "tid": tenant_b, "period_end": future},
            )

        with platform_db_session() as db:
            summary = expire_overdue_subscriptions(db)

        assert summary["expired"] >= 1
        with engine.connect() as admin_conn:
            status_a = admin_conn.execute(
                text("SELECT status FROM tenant_subscriptions WHERE id = :id"), {"id": sub_a}
            ).scalar()
            status_b = admin_conn.execute(
                text("SELECT status FROM tenant_subscriptions WHERE id = :id"), {"id": sub_b_active}
            ).scalar()
        assert status_a == "expired", "overdue subscription must be expired across every tenant, not just the first"
        assert status_b == "active", "a subscription still within its period must be untouched"
