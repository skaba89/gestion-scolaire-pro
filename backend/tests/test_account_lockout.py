"""Per-account brute-force lockout — national audit Phase 1, point 7.

The mechanism (_check_account_lockout / _record_failed_login /
_reset_login_attempts in app/api/v1/endpoints/core/auth.py) existed and is
wired into /auth/login/, but no test actually drove 5 failed attempts and
asserted the 6th is locked — only a rate-limit-header presence test existed
(tests/test_auth.py::test_login_rate_limit_header_present, a different
mechanism: slowapi's per-IP rate limit, not this per-account Redis lockout).
"""
import os

os.environ.setdefault("BOOTSTRAP_SECRET", "test-bootstrap-secret-key-for-ci-32chars")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-32chars")

import pytest
from conftest import get_test_client, redis_is_available

client = get_test_client()

# The lockout counter is Redis-backed and fails OPEN (never blocks) when
# Redis is unreachable — see auth.py's "Redis unavailable ... (fail-open)"
# warning. Tests that assert the account actually gets locked (429) can't
# pass in a sandbox/CI job with no Redis service; skip cleanly instead of
# a misleading "assert 401 == 429".
_needs_redis = pytest.mark.skipif(
    not redis_is_available(),
    reason="account lockout is Redis-backed and fails open without it",
)

BOOTSTRAP_URL = "/api/v1/auth/bootstrap/"
LOGIN_URL = "/api/v1/auth/login/"
GOOD_SECRET = os.environ["BOOTSTRAP_SECRET"]
STRONG_PASSWORD = "AccountLockout!2026"
MAX_LOGIN_ATTEMPTS = 5


@pytest.fixture(scope="module", autouse=True)
def _setup():
    from app.core.database import Base, engine
    from app.api.v1.endpoints.core.auth import limiter as auth_limiter
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    previous = auth_limiter.enabled
    auth_limiter.enabled = False  # isolate account lockout from the per-IP rate limiter
    yield
    auth_limiter.enabled = previous


def _fresh_super_admin() -> str:
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


class TestAccountLockout:
    @_needs_redis
    def test_account_locked_after_max_failed_attempts(self):
        """5 consecutive wrong-password attempts must each return 401; the
        6th must return 429 (locked) even though this attempt never checks
        the password — the account is locked before password verification."""
        email = _fresh_super_admin()

        for i in range(MAX_LOGIN_ATTEMPTS):
            resp = client.post(LOGIN_URL, data={"username": email, "password": "wrong-password"})
            assert resp.status_code == 401, f"attempt #{i+1}: {resp.text}"

        locked = client.post(LOGIN_URL, data={"username": email, "password": "wrong-password"})
        assert locked.status_code == 429, locked.text

    @_needs_redis
    def test_correct_password_rejected_while_locked(self):
        """Once locked, even the CORRECT password must be refused — the
        lockout blocks before password verification, so an attacker who
        eventually finds the password still can't get in until it expires."""
        email = _fresh_super_admin()

        for _ in range(MAX_LOGIN_ATTEMPTS):
            client.post(LOGIN_URL, data={"username": email, "password": "wrong-password"})

        resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert resp.status_code == 429, resp.text

    def test_successful_login_resets_attempt_counter(self):
        """A successful login must clear the failed-attempt counter for
        that account — otherwise attempts would accumulate across
        unrelated login sessions and eventually lock out a legitimate
        user who occasionally mistypes their password."""
        email = _fresh_super_admin()

        # A few wrong attempts, well under the lockout threshold.
        for _ in range(MAX_LOGIN_ATTEMPTS - 2):
            resp = client.post(LOGIN_URL, data={"username": email, "password": "wrong-password"})
            assert resp.status_code == 401, resp.text

        # Correct password succeeds and resets the counter.
        ok = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert ok.status_code == 200, ok.text

        # Fresh wrong attempts start from zero again — none of these alone
        # should trigger the lockout that a stale counter would cause.
        for i in range(MAX_LOGIN_ATTEMPTS - 1):
            resp = client.post(LOGIN_URL, data={"username": email, "password": "wrong-password"})
            assert resp.status_code == 401, f"post-reset attempt #{i+1}: {resp.text}"
