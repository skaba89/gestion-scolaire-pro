"""MFA enforcement for privileged roles — national audit Phase 1, point 5.

Before this test: `PRIVILEGED_ROLES_REQUIRING_MFA` blocks login with 403 when
`settings.ENFORCE_MFA` is true and the user hasn't enabled MFA, but nothing in
the test suite actually flipped ENFORCE_MFA on and proved the gate works —
`TestMFAEnforcement` in test_analytics.py only checks unrelated 401 paths
(bad password, missing token) despite its name. This file exercises the
real gate in app/api/v1/endpoints/core/auth.py:316-339.
"""
import os

os.environ.setdefault("BOOTSTRAP_SECRET", "test-bootstrap-secret-key-for-ci-32chars")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-32chars")

import pytest
from conftest import get_test_client

client = get_test_client()

BOOTSTRAP_URL = "/api/v1/auth/bootstrap/"
LOGIN_URL = "/api/v1/auth/login/"
GOOD_SECRET = os.environ["BOOTSTRAP_SECRET"]
STRONG_PASSWORD = "MfaEnforce!2026"


@pytest.fixture(scope="module", autouse=True)
def _setup():
    from app.core.database import Base, engine
    from app.api.v1.endpoints.core.auth import limiter as auth_limiter
    import app.models  # noqa: F401 — register all models

    Base.metadata.create_all(bind=engine)
    previous = auth_limiter.enabled
    auth_limiter.enabled = False
    yield
    auth_limiter.enabled = previous


def _fresh_super_admin() -> str:
    """Bootstrap a super-admin, scoped cleanup identical to
    test_token_lifecycle.py's helper (never a blanket DELETE FROM users —
    this module can run alongside dozens of others sharing the SQLite file)."""
    from app.core.database import SessionLocal
    from sqlalchemy import text

    db = SessionLocal()
    try:
        super_admin_ids = [
            row[0]
            for row in db.execute(
                text("SELECT user_id FROM user_roles WHERE role = 'SUPER_ADMIN'")
            ).fetchall()
        ]
        db.execute(text("DELETE FROM user_roles WHERE role = 'SUPER_ADMIN'"))
        for uid in super_admin_ids:
            db.execute(text("DELETE FROM users WHERE id = :id"), {"id": uid})
        db.commit()
    finally:
        db.close()

    resp = client.post(BOOTSTRAP_URL, json={"bootstrap_key": GOOD_SECRET, "new_password": STRONG_PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["credentials"]["email"]


def _set_mfa_enabled(email: str, enabled: bool) -> None:
    from app.core.database import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        user.mfa_enabled = enabled
        db.commit()
    finally:
        db.close()


class TestMFAEnforcementForPrivilegedRoles:
    def test_login_blocked_when_enforce_mfa_true_and_mfa_disabled(self, monkeypatch):
        """A SUPER_ADMIN (privileged role) without MFA enabled must be
        refused login (403) once ENFORCE_MFA is on — this is the actual
        production default (see app/core/config.py:230, ENFORCE_MFA
        defaults to true whenever DEBUG is not explicitly 'true')."""
        from app.core.config import settings as app_settings

        email = _fresh_super_admin()
        monkeypatch.setattr(app_settings, "ENFORCE_MFA", True)

        resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert resp.status_code == 403, resp.text
        assert "MFA" in resp.json()["detail"]

    def test_login_allowed_when_enforce_mfa_true_and_mfa_enabled(self, monkeypatch):
        """The same privileged user, once MFA is marked enabled on their
        account, must be allowed to log in even with ENFORCE_MFA on —
        proves the gate checks the account's actual MFA state rather than
        blocking privileged roles unconditionally."""
        from app.core.config import settings as app_settings

        email = _fresh_super_admin()
        _set_mfa_enabled(email, True)
        monkeypatch.setattr(app_settings, "ENFORCE_MFA", True)

        resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert resp.status_code == 200, resp.text

    def test_login_allowed_without_mfa_when_enforce_mfa_false(self, monkeypatch):
        """With ENFORCE_MFA off (the dev/test default), a privileged user
        without MFA can still log in — non-regression for local dev and
        for the bootstrap flow itself, which cannot have MFA pre-enabled."""
        from app.core.config import settings as app_settings

        email = _fresh_super_admin()
        monkeypatch.setattr(app_settings, "ENFORCE_MFA", False)

        resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert resp.status_code == 200, resp.text
