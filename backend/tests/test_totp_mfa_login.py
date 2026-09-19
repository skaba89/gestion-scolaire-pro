"""Real TOTP enrollment and server-side second-factor enforcement at login
(national-readiness audit, 2026-09, P1-5 follow-up).

Before this fix:
  - The frontend's "2FA" enrollment screen (ProfileSettings.tsx) called the
    email-OTP endpoints under a TOTP-branded UI, which never returned a
    `totp.uri`/`totp.secret` — the enrollment dialog crashed for anyone who
    tried to turn 2FA on that way.
  - Once `users.mfa_enabled` was True (however it got set), /auth/login/
    issued a fully valid access token immediately — no code of any kind was
    ever verified server-side. The SPA's own TwoFactorChallenge screen
    (ProtectedRoute.tsx) gated the app's routes, but the JWT itself already
    worked against every API endpoint; a direct caller holding that token
    bypassed "MFA" entirely.

This file exercises the real TOTP endpoints (app/api/v1/endpoints/core/
mfa.py) and proves /auth/login/ now withholds the real session token behind
a code check for any account with mfa_enabled=True.
"""
import os

os.environ.setdefault("BOOTSTRAP_SECRET", "test-bootstrap-secret-key-for-ci-32chars")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-32chars")

import uuid

import jwt
import pyotp
import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import engine  # noqa: E402

LOGIN_URL = "/api/v1/auth/login/"
MFA_LOGIN_VERIFY_URL = "/api/v1/mfa/login/verify/"
STRONG_PASSWORD = "TotpEnforce!2026"

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="mfa_totp_secrets/mfa_backup_codes are raw-SQL operational tables "
           "whose _ensure_mfa_tables() uses information_schema, which SQLite "
           "doesn't support — see app/api/v1/endpoints/core/mfa.py. Same "
           "constraint as test_alumni_ownership_authorization.py. Exercised "
           "by the CI Postgres job.",
)


@pytest.fixture(scope="module", autouse=True)
def _setup():
    from app.core.database import Base, engine
    from app.api.v1.endpoints.core.auth import limiter as auth_limiter
    from app.api.v1.endpoints.core.mfa import limiter as mfa_limiter
    import app.models  # noqa: F401 — register all models

    Base.metadata.create_all(bind=engine)
    prev_auth, prev_mfa = auth_limiter.enabled, mfa_limiter.enabled
    auth_limiter.enabled = False
    mfa_limiter.enabled = False
    yield
    auth_limiter.enabled = prev_auth
    mfa_limiter.enabled = prev_mfa


def _fresh_user(*, mfa_enabled: bool = False) -> tuple[str, str, str]:
    """A plain, tenant-scoped, non-privileged user — TOTP must work for any
    account that opts in, not just privileged roles gated by
    PRIVILEGED_ROLES_REQUIRING_MFA. Tenant-scoped (rather than
    tenant_id=None) so requests carrying its JWT pass the tenant middleware
    (app/middlewares/tenant.py), which otherwise rejects any authenticated
    request with neither a tenant_id claim nor a platform-level role."""
    from app.core.database import SessionLocal
    from app.core.security import get_password_hash
    from app.models.tenant import Tenant
    from app.models.user import User

    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    email = f"totp.{uuid.uuid4().hex[:8]}@example.com"
    db = SessionLocal()
    try:
        db.add(Tenant(
            id=tenant_id, name="École TOTP Test", slug=f"totp-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.flush()
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Totp", last_name="Test",
            password_hash=get_password_hash(STRONG_PASSWORD),
            is_active=True, is_verified=True, mfa_enabled=mfa_enabled,
        ))
        db.commit()
    finally:
        db.close()
    return user_id, email, tenant_id


def _auth_headers(user: dict) -> dict:
    from app.core.security import create_access_token
    token = create_access_token({
        "sub": user["id"], "email": user["email"], "preferred_username": user["email"],
        "tenant_id": user["tenant_id"], "roles": [], "jti": "test", "tv": 0,
    })
    return {"Authorization": f"Bearer {token}"}


class TestTOTPEnrollment:
    def test_enroll_returns_a_real_secret_and_provisioning_uri(self):
        """The frontend needs both `secret` (manual entry fallback) and
        `uri` (QRCodeSVG value) — the old email-OTP-aliased enroll endpoint
        returned neither, which crashed the enrollment dialog."""
        user_id, email, tenant_id = _fresh_user()
        resp = client.post("/api/v1/mfa/totp/enroll/", headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["secret"]) >= 16
        assert body["uri"].startswith("otpauth://totp/")
        from urllib.parse import unquote
        assert email in unquote(body["uri"])

    def test_verify_with_correct_code_enables_mfa(self):
        user_id, email, tenant_id = _fresh_user()
        enroll = client.post("/api/v1/mfa/totp/enroll/", headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}))
        secret = enroll.json()["secret"]
        code = pyotp.TOTP(secret).now()

        resp = client.post(
            "/api/v1/mfa/totp/verify/", json={"code": code},
            headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["valid"] is True

        status_resp = client.get("/api/v1/mfa/totp/status/", headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}))
        assert status_resp.json()["enabled"] is True

        from app.core.database import SessionLocal
        from app.models.user import User
        with SessionLocal() as db:
            user = db.query(User).filter(User.id == user_id).first()
            assert user.mfa_enabled is True

    def test_verify_with_wrong_code_does_not_enable_mfa(self):
        user_id, email, tenant_id = _fresh_user()
        client.post("/api/v1/mfa/totp/enroll/", headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}))

        resp = client.post(
            "/api/v1/mfa/totp/verify/", json={"code": "000000"},
            headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["valid"] is False

        status_resp = client.get("/api/v1/mfa/totp/status/", headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}))
        assert status_resp.json()["enabled"] is False

    def test_disable_removes_factor_and_mfa_flag(self):
        user_id, email, tenant_id = _fresh_user()
        enroll = client.post("/api/v1/mfa/totp/enroll/", headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}))
        secret = enroll.json()["secret"]
        client.post(
            "/api/v1/mfa/totp/verify/", json={"code": pyotp.TOTP(secret).now()},
            headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}),
        )

        resp = client.post("/api/v1/mfa/totp/disable/", headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}))
        assert resp.status_code == 200, resp.text

        status_resp = client.get("/api/v1/mfa/totp/status/", headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}))
        assert status_resp.json()["enabled"] is False


class TestLoginWithheldUntilSecondFactorVerified:
    def test_login_with_mfa_enabled_does_not_return_a_usable_access_token(self):
        """This is the core regression this fix closes: before it, a
        correct password alone against an mfa_enabled=True account
        returned a fully valid access_token — no code was ever checked."""
        user_id, email, tenant_id = _fresh_user(mfa_enabled=True)
        resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["mfa_required"] is True
        assert body["mfa_token"]
        assert not body.get("access_token")

    def test_mfa_pending_token_cannot_be_used_as_a_bearer_token(self):
        """The pending token must not carry roles/tenant claims usable by
        require_permission()/get_current_user() — it only proves password
        correctness, not full authentication."""
        user_id, email, tenant_id = _fresh_user(mfa_enabled=True)
        login_resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        mfa_token = login_resp.json()["mfa_token"]

        resp = client.get("/api/v1/users/me/", headers={"Authorization": f"Bearer {mfa_token}"})
        assert resp.status_code == 401, resp.text

    def test_login_verify_with_correct_totp_code_issues_real_token(self):
        user_id, email, tenant_id = _fresh_user()
        enroll = client.post("/api/v1/mfa/totp/enroll/", headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}))
        secret = enroll.json()["secret"]
        client.post(
            "/api/v1/mfa/totp/verify/", json={"code": pyotp.TOTP(secret).now()},
            headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}),
        )

        login_resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert login_resp.json()["mfa_required"] is True
        mfa_token = login_resp.json()["mfa_token"]

        verify_resp = client.post(MFA_LOGIN_VERIFY_URL, json={"mfa_token": mfa_token, "code": pyotp.TOTP(secret).now()})
        assert verify_resp.status_code == 200, verify_resp.text
        access_token = verify_resp.json()["access_token"]
        assert access_token

        from app.core.config import settings
        payload = jwt.decode(
            access_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
            audience="schoolflow-api", issuer="schoolflow-pro",
        )
        assert payload["sub"] == user_id
        assert not payload.get("mfa_pending")

        me_resp = client.get("/api/v1/users/me/", headers={"Authorization": f"Bearer {access_token}"})
        assert me_resp.status_code == 200, me_resp.text

    def test_login_verify_with_wrong_code_does_not_issue_a_token(self):
        user_id, email, tenant_id = _fresh_user(mfa_enabled=True)
        login_resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        mfa_token = login_resp.json()["mfa_token"]

        resp = client.post(MFA_LOGIN_VERIFY_URL, json={"mfa_token": mfa_token, "code": "000000"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["valid"] is False
        assert "access_token" not in resp.json()

    def test_login_verify_accepts_a_backup_code_as_fallback(self):
        user_id, email, tenant_id = _fresh_user(mfa_enabled=True)
        gen_resp = client.post("/api/v1/mfa/backup-codes/generate/", headers=_auth_headers({"id": user_id, "email": email, "tenant_id": tenant_id}))
        backup_code = gen_resp.json()["codes"][0]

        login_resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        mfa_token = login_resp.json()["mfa_token"]

        verify_resp = client.post(MFA_LOGIN_VERIFY_URL, json={"mfa_token": mfa_token, "code": backup_code})
        assert verify_resp.status_code == 200, verify_resp.text
        assert verify_resp.json()["access_token"]

    def test_login_verify_rejects_a_tampered_mfa_token(self):
        resp = client.post(MFA_LOGIN_VERIFY_URL, json={"mfa_token": "not-a-real-jwt", "code": "123456"})
        assert resp.status_code == 401, resp.text

    def test_login_verify_rejects_a_normal_access_token_as_mfa_token(self):
        """A full session token must not double as an mfa_pending token —
        only a token minted with the mfa_pending claim (login()'s gate)
        should ever be accepted here."""
        user_id, email, tenant_id = _fresh_user()
        from app.core.security import create_access_token
        full_token = create_access_token({
            "sub": user_id, "email": email, "preferred_username": email,
            "tenant_id": None, "roles": [], "jti": "test", "tv": 0,
        })
        resp = client.post(MFA_LOGIN_VERIFY_URL, json={"mfa_token": full_token, "code": "123456"})
        assert resp.status_code == 401, resp.text

    def test_login_without_mfa_enabled_is_unaffected(self):
        """Regression guard: accounts that never enabled MFA must keep
        getting a real token straight from /auth/login/, unchanged."""
        user_id, email, tenant_id = _fresh_user(mfa_enabled=False)
        resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["access_token"]
        assert not body.get("mfa_required")
