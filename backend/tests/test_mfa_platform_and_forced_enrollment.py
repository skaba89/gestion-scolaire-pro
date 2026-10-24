"""PostgreSQL integration tests: MFA self-service for platform accounts and
forced MFA enrollment at login, under the restricted runtime role
(NOSUPERUSER NOBYPASSRLS).

Regressions covered (found on a VPS deployment, 2026-10):

1. A SUPER_ADMIN (users.tenant_id NULL) viewing /<slug>/admin/ sends that
   tenant's X-Tenant-ID, so get_db() ran the MFA endpoints under it: the
   SUPER_ADMIN's own `users` row is invisible there and
   `UPDATE users SET mfa_enabled = TRUE` touched 0 rows while
   POST /mfa/totp/verify/ answered "TOTP activé avec succès".
2. `email_otps` / `mfa_backup_codes` policies compared
   `tenant_id::text = COALESCE(setting, '')`, never true for NULL: email OTP
   (HTTP 500) and backup codes were unusable for platform accounts
   (fixed by migration 20261024_0001).
3. With ENFORCE_MFA=true a privileged account without MFA got a bare 403 at
   login, hence no way to ever reach the enrollment screen. It now gets a
   mfa_setup token, accepted ONLY by /mfa/setup/enroll|verify/.

Same pattern as test_auth_rls_restricted_role.py: a disposable restricted
role, `app.core.database.SessionLocal` monkeypatched to it, the REAL app via
TestClient — a superuser bypasses RLS and would prove nothing.
"""
from __future__ import annotations

import uuid

import pyotp
import pytest
from conftest import get_test_client

client = get_test_client()

import app.core.database as db_module  # noqa: E402
from app.core.database import engine, switch_tenant_context  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.main import app  # noqa: E402
from sqlalchemy import bindparam, create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Row-Level Security is PostgreSQL-specific.",
)

RESTRICTED_ROLE = "test_mfa_platform_restricted_role"
RESTRICTED_PASSWORD = "test-only-mfa-restricted-role-password"  # noqa: S105 — disposable, local test DB only
PLAIN_PASSWORD = "Sup3r@Secure-Pw-2026!"  # noqa: S105 — disposable test fixture password

LOGIN_URL = "/api/v1/auth/login/"


def _make_tenant(admin_conn, name: str) -> str:
    tenant_id = str(uuid.uuid4())
    admin_conn.execute(
        text(
            "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
            "VALUES (:id, :name, :slug, 'primary', 'GN', true, '{}', now(), now())"
        ),
        {"id": tenant_id, "name": name, "slug": f"mfa-rls-{tenant_id[:8]}"},
    )
    return tenant_id


def _make_user(admin_conn, tenant_id, role: str) -> tuple[str, str]:
    user_id = str(uuid.uuid4())
    email = f"{role.lower()}-{uuid.uuid4().hex[:8]}@example.test"
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
    return user_id, email


def _mfa_enabled(user_id: str) -> bool:
    with engine.connect() as conn:  # owner role: reads the truth, bypassing RLS
        return bool(conn.execute(text("SELECT mfa_enabled FROM users WHERE id = :id"), {"id": user_id}).scalar())


def _login(email: str) -> dict:
    resp = client.post(LOGIN_URL, data={"username": email, "password": PLAIN_PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _bearer(token: str, tenant_id: str | None = None) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    if tenant_id:
        headers["X-Tenant-ID"] = tenant_id
    return headers


@requires_postgres
class TestMfaPlatformAndForcedEnrollment:

    @pytest.fixture(scope="class", autouse=True)
    def _disable_rate_limiters(self):
        """Many logins and MFA calls in one run: the 5/min (auth) and
        10/min (mfa) per-IP limiters are shared with the whole suite."""
        from app.api.v1.endpoints.core.auth import limiter as auth_limiter
        from app.api.v1.endpoints.core.mfa import limiter as mfa_limiter
        previous = (auth_limiter.enabled, mfa_limiter.enabled)
        auth_limiter.enabled = mfa_limiter.enabled = False
        yield
        auth_limiter.enabled, mfa_limiter.enabled = previous

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
    def restricted(self, restricted_role, monkeypatch):
        url = make_url(engine.url.render_as_string(hide_password=False)).set(
            username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD
        )
        restricted_engine = create_engine(url.render_as_string(hide_password=False), poolclass=StaticPool)
        with restricted_engine.connect() as conn:
            is_super, bypasses_rls = conn.execute(
                text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
            ).one()
            assert not is_super and not bypasses_rls, "test setup bug: role is not restricted"

        restricted_sessionmaker = sessionmaker(bind=restricted_engine, autocommit=False, autoflush=False)
        monkeypatch.setattr(db_module, "SessionLocal", restricted_sessionmaker)
        yield restricted_sessionmaker
        restricted_engine.dispose()

    @pytest.fixture(autouse=True)
    def _clear_dependency_overrides(self):
        from app.core.security import get_current_user as _gcu
        app.dependency_overrides.pop(_gcu, None)
        yield
        app.dependency_overrides.pop(_gcu, None)

    @pytest.fixture
    def enforce_mfa(self, monkeypatch):
        from app.core.config import settings as app_settings

        def _set(value: bool):
            monkeypatch.setattr(app_settings, "ENFORCE_MFA", value)
        return _set

    @pytest.fixture
    def super_admin_viewing_tenant(self, restricted, enforce_mfa):
        """A SUPER_ADMIN with a real session, plus a tenant it can 'view'
        (X-Tenant-ID) — the exact situation of /<slug>/admin/profile."""
        with engine.begin() as admin_conn:
            tenant_id = _make_tenant(admin_conn, "Établissement consulté")
            user_id, email = _make_user(admin_conn, None, "SUPER_ADMIN")
        enforce_mfa(False)
        token = _login(email)["access_token"]
        assert token
        return user_id, token, tenant_id

    # -- 1. TOTP self-service for a platform account --------------------------

    def test_super_admin_totp_enrollment_under_viewed_tenant_really_enables_mfa(
        self, super_admin_viewing_tenant
    ):
        user_id, token, viewed_tenant = super_admin_viewing_tenant
        headers = _bearer(token, viewed_tenant)

        enroll = client.post("/api/v1/mfa/totp/enroll/", headers=headers)
        assert enroll.status_code == 200, enroll.text
        code = pyotp.TOTP(enroll.json()["secret"]).now()

        verify = client.post("/api/v1/mfa/totp/verify/", json={"code": code}, headers=headers)
        assert verify.status_code == 200, verify.text
        assert verify.json()["valid"] is True
        assert _mfa_enabled(user_id), "endpoint answered success but users.mfa_enabled was not written"

        status_resp = client.get("/api/v1/mfa/status/", headers=headers)
        assert status_resp.json() == {"enabled": True}

    def test_login_then_requires_code_for_platform_account(self, super_admin_viewing_tenant):
        user_id, token, viewed_tenant = super_admin_viewing_tenant
        headers = _bearer(token, viewed_tenant)
        secret = client.post("/api/v1/mfa/totp/enroll/", headers=headers).json()["secret"]
        client.post("/api/v1/mfa/totp/verify/", json={"code": pyotp.TOTP(secret).now()}, headers=headers)

        with engine.connect() as conn:
            email = conn.execute(text("SELECT email FROM users WHERE id = :id"), {"id": user_id}).scalar()
        body = _login(email)
        assert body["mfa_required"] is True and not body["access_token"]

        done = client.post(
            "/api/v1/mfa/login/verify/", json={"mfa_token": body["mfa_token"], "code": pyotp.TOTP(secret).now()}
        )
        assert done.status_code == 200, done.text
        assert done.json()["access_token"]

    # -- 2. email OTP + backup codes for a platform account --------------------

    def test_super_admin_email_otp_request_no_longer_500(self, super_admin_viewing_tenant):
        user_id, token, viewed_tenant = super_admin_viewing_tenant
        resp = client.post(
            "/api/v1/mfa/otp/request/", json={"email": "ignored@example.test"}, headers=_bearer(token, viewed_tenant)
        )
        assert resp.status_code == 200, resp.text
        with engine.connect() as conn:
            count = conn.execute(text("SELECT count(*) FROM email_otps WHERE user_id = :id"), {"id": user_id}).scalar()
        assert count == 1

    def test_super_admin_backup_codes_stored_under_own_null_tenant(self, super_admin_viewing_tenant):
        user_id, token, viewed_tenant = super_admin_viewing_tenant
        headers = _bearer(token, viewed_tenant)

        gen = client.post("/api/v1/mfa/backup-codes/generate/", headers=headers)
        assert gen.status_code == 200, gen.text
        codes = gen.json()["codes"]
        assert len(codes) == 10

        with engine.connect() as conn:
            tenants = conn.execute(
                text("SELECT DISTINCT tenant_id FROM mfa_backup_codes WHERE user_id = :id"), {"id": user_id}
            ).fetchall()
        assert tenants == [(None,)], "codes must belong to the account, not to the tenant being viewed"

        assert client.get("/api/v1/mfa/backup-codes/count/", headers=headers).json() == {"count": 10}
        used = client.post("/api/v1/mfa/backup-codes/verify/", json={"code": codes[0]}, headers=headers)
        assert used.json()["valid"] is True
        assert client.get("/api/v1/mfa/backup-codes/count/", headers=headers).json() == {"count": 9}

    # -- 3. forced enrollment at login -----------------------------------------

    def _gated_tenant_admin(self, enforce_mfa):
        with engine.begin() as admin_conn:
            tenant_id = _make_tenant(admin_conn, "École (enrôlement forcé)")
            user_id, email = _make_user(admin_conn, tenant_id, "TENANT_ADMIN")
        enforce_mfa(True)
        body = _login(email)
        assert body["mfa_setup_required"] is True
        assert not body["access_token"] and not body.get("refresh_token")
        return user_id, email, body["mfa_setup_token"]

    def test_forced_enrollment_enables_mfa_and_opens_session(self, restricted, enforce_mfa):
        user_id, email, setup_token = self._gated_tenant_admin(enforce_mfa)

        enroll = client.post("/api/v1/mfa/setup/enroll/", json={"mfa_token": setup_token})
        assert enroll.status_code == 200, enroll.text
        secret = enroll.json()["secret"]
        assert enroll.json()["uri"].startswith("otpauth://totp/")

        bad = client.post("/api/v1/mfa/setup/verify/", json={"mfa_token": setup_token, "code": "000000"})
        assert bad.status_code == 200 and bad.json()["valid"] is False
        assert not _mfa_enabled(user_id)

        done = client.post(
            "/api/v1/mfa/setup/verify/", json={"mfa_token": setup_token, "code": pyotp.TOTP(secret).now()}
        )
        assert done.status_code == 200, done.text
        session_token = done.json()["access_token"]
        assert session_token
        assert _mfa_enabled(user_id)
        assert client.get("/api/v1/users/me/", headers=_bearer(session_token)).status_code == 200

        # Next login: the regular second-factor challenge, no more setup.
        again = _login(email)
        assert again["mfa_required"] is True and again["mfa_setup_required"] is False

    def test_setup_token_is_refused_once_mfa_is_enabled(self, restricted, enforce_mfa):
        user_id, _, setup_token = self._gated_tenant_admin(enforce_mfa)
        secret = client.post("/api/v1/mfa/setup/enroll/", json={"mfa_token": setup_token}).json()["secret"]
        client.post("/api/v1/mfa/setup/verify/", json={"mfa_token": setup_token, "code": pyotp.TOTP(secret).now()})
        assert _mfa_enabled(user_id)

        # Replaying the (still unexpired) token must not replace the factor.
        replay = client.post("/api/v1/mfa/setup/enroll/", json={"mfa_token": setup_token})
        assert replay.status_code == 409, replay.text

    def test_setup_token_is_not_a_bearer_nor_refresh_token(self, restricted, enforce_mfa):
        _, _, setup_token = self._gated_tenant_admin(enforce_mfa)

        assert client.get("/api/v1/users/me/", headers=_bearer(setup_token)).status_code == 401
        # Tenant-scoped path: TenantMiddleware already refuses it (no tenant
        # can be derived from a roleless token) before authentication runs.
        assert client.post("/api/v1/mfa/totp/enroll/", headers=_bearer(setup_token)).status_code in (400, 401)
        refresh = client.post("/api/v1/auth/refresh/", headers=_bearer(setup_token))
        assert refresh.status_code == 401, refresh.text
        # Nor a mfa_pending token for the login challenge.
        assert client.post(
            "/api/v1/mfa/login/verify/", json={"mfa_token": setup_token, "code": "123456"}
        ).status_code == 401

    def test_mfa_pending_token_cannot_drive_forced_enrollment(self, super_admin_viewing_tenant, enforce_mfa):
        user_id, token, viewed_tenant = super_admin_viewing_tenant
        headers = _bearer(token, viewed_tenant)
        secret = client.post("/api/v1/mfa/totp/enroll/", headers=headers).json()["secret"]
        client.post("/api/v1/mfa/totp/verify/", json={"code": pyotp.TOTP(secret).now()}, headers=headers)
        with engine.connect() as conn:
            email = conn.execute(text("SELECT email FROM users WHERE id = :id"), {"id": user_id}).scalar()
        pending = _login(email)["mfa_token"]

        resp = client.post("/api/v1/mfa/setup/enroll/", json={"mfa_token": pending})
        assert resp.status_code == 401, resp.text

    # -- 4. isolation is unchanged by migration 20261024_0001 ------------------

    def test_policies_still_isolate_tenants_and_platform(self, restricted):
        with engine.begin() as admin_conn:
            tenant_a = _make_tenant(admin_conn, "Tenant A (MFA RLS)")
            tenant_b = _make_tenant(admin_conn, "Tenant B (MFA RLS)")
            user_a, _ = _make_user(admin_conn, tenant_a, "TENANT_ADMIN")
            user_b, _ = _make_user(admin_conn, tenant_b, "TENANT_ADMIN")
            platform_user, _ = _make_user(admin_conn, None, "SUPER_ADMIN")
            for uid, tid in ((user_a, tenant_a), (user_b, tenant_b), (platform_user, None)):
                admin_conn.execute(
                    text(
                        "INSERT INTO email_otps (id, user_id, code_hash, expires_at, is_valid, created_at) "
                        "VALUES (:id, :uid, 'h', now() + interval '1 hour', true, now())"
                    ),
                    {"id": str(uuid.uuid4()), "uid": uid},
                )
                admin_conn.execute(
                    text(
                        "INSERT INTO mfa_backup_codes (id, user_id, tenant_id, code_hash, used, created_at) "
                        "VALUES (:id, :uid, :tid, 'h', false, now())"
                    ),
                    {"id": str(uuid.uuid4()), "uid": uid, "tid": tid},
                )

        ids = (user_a, user_b, platform_user)

        def visible(session, table: str) -> set[str]:
            rows = session.execute(
                text(f"SELECT user_id FROM {table} WHERE user_id IN :ids").bindparams(  # noqa: S608 — fixed table names
                    bindparam("ids", expanding=True)
                ),
                {"ids": list(ids)},
            ).fetchall()
            return {str(r[0]) for r in rows}

        session = restricted()
        try:
            for table in ("email_otps", "mfa_backup_codes"):
                switch_tenant_context(session, tenant_a)
                assert visible(session, table) == {user_a}, table
                db_module.reset_tenant_context(session)
                assert visible(session, table) == {platform_user}, table

            # WITH CHECK: tenant A's context cannot write a row for tenant B.
            switch_tenant_context(session, tenant_a)
            with pytest.raises(Exception):
                session.execute(
                    text(
                        "INSERT INTO mfa_backup_codes (id, user_id, tenant_id, code_hash, used, created_at) "
                        "VALUES (:id, :uid, :tid, 'x', false, now())"
                    ),
                    {"id": str(uuid.uuid4()), "uid": user_b, "tid": tenant_b},
                )
                session.flush()
            session.rollback()
        finally:
            session.close()
