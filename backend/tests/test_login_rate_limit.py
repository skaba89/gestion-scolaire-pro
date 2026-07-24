"""Per-IP rate limit on /auth/login/ — national audit Phase 1, point 6.

app/api/v1/endpoints/core/auth.py applies @limiter.limit("5/minute") to
/auth/login/ (slowapi, keyed by remote address). Every other test module in
this suite explicitly disables `auth_limiter` (module-scoped autouse fixture)
so that scenarios doing several logins in a row aren't accidentally rate
limited — which also meant nothing ever exercised the limiter itself.
tests/test_auth.py::test_login_rate_limit_header_present is misleadingly
named: it makes exactly one request and accepts 200/401/422/429, so it can't
tell a working limiter from a disabled one. This file leaves the limiter ON
and drives it past the threshold.

Isolated in its own file (not appended to test_auth.py) so it doesn't
inherit any fixture that disables the limiter, and so its state doesn't leak
into other login-heavy tests.
"""
import os

os.environ.setdefault("BOOTSTRAP_SECRET", "test-bootstrap-secret-key-for-ci-32chars")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-32chars")

from conftest import get_test_client

client = get_test_client()

LOGIN_URL = "/api/v1/auth/login/"


class TestLoginRateLimit:
    def test_sixth_login_attempt_within_a_minute_is_rate_limited(self):
        """The limiter is keyed by remote address, not by account — even
        against a nonexistent user, the 6th request within the same minute
        must be refused with 429 before any credential check runs."""
        from app.api.v1.endpoints.core.auth import limiter as auth_limiter

        assert auth_limiter.enabled, (
            "auth_limiter is disabled — this test file must not import "
            "from a module/fixture that flips it off, or this assertion "
            "would silently prove nothing."
        )

        # auth_limiter is a module-level singleton shared by every test file
        # in this suite (all import the same object from auth.py) — its
        # in-memory storage isn't reset between files. Other modules that
        # DON'T disable it before calling /auth/login/ (e.g. test_auth.py's
        # single unguarded login) leave stray hits in the same
        # get_remote_address() bucket this test relies on. Reset it so this
        # test's outcome depends only on the 6 requests it makes itself.
        auth_limiter.reset()

        responses = []
        for _ in range(6):
            resp = client.post(
                LOGIN_URL,
                data={"username": "rate-limit-probe@example.com", "password": "wrong"},
            )
            responses.append(resp.status_code)

        assert responses[:5] == [401] * 5, responses
        assert responses[5] == 429, responses
