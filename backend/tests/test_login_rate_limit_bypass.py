"""X-Load-Test-Token bypass for the auth rate limiter.

Part of "lever les blocages de charge" (national/international scale
roadmap): the 5/minute-per-IP login rate limit is correct anti-brute-force
behaviour, but it also makes any real load campaign's setup() (logging in
N simulated tenant admins) take 13s × N — impractical past a handful of
tenants. See _login_rate_limit_key in app/api/v1/endpoints/core/auth.py.

Isolated in its own file for the same reason as test_login_rate_limit.py:
it deliberately leaves the real (non-mocked) limiter on and drives it past
threshold, and must not inherit a fixture that disables it.
"""
import os

os.environ.setdefault("BOOTSTRAP_SECRET", "test-bootstrap-secret-key-for-ci-32chars")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-32chars")

from conftest import get_test_client

client = get_test_client()

LOGIN_URL = "/api/v1/auth/login/"


class TestLoginRateLimitBypass:
    def test_bypass_is_inert_when_secret_unset(self):
        """Default state (no LOAD_TEST_BYPASS_SECRET configured, the
        production default): presenting ANY X-Load-Test-Token value must
        NOT exempt the request — the 6th attempt still 429s exactly like
        test_login_rate_limit.py's baseline."""
        from app.api.v1.endpoints.core.auth import limiter as auth_limiter
        from app.core.config import settings

        assert not settings.LOAD_TEST_BYPASS_SECRET, (
            "This test requires the bypass secret to be unset — the default "
            "production posture. If a prior test left it configured, this "
            "assertion catches that leak before it hides a real regression."
        )
        auth_limiter.reset()

        responses = []
        for _ in range(6):
            resp = client.post(
                LOGIN_URL,
                data={"username": "bypass-inert-probe@example.com", "password": "wrong"},
                headers={"X-Load-Test-Token": "some-random-guess-not-the-real-secret"},
            )
            responses.append(resp.status_code)

        assert responses[5] == 429, responses

    def test_bypass_exempts_requests_with_the_correct_token(self, monkeypatch):
        """With LOAD_TEST_BYPASS_SECRET *and* a future LOAD_TEST_BYPASS_
        EXPIRES_AT configured, and the matching header presented, the same
        6 requests that would 429 above must all pass the rate-limit gate
        (still 401 for a wrong password — the bypass only lifts the *rate
        limit*, not authentication)."""
        from app.api.v1.endpoints.core.auth import limiter as auth_limiter
        from app.core.config import settings

        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_SECRET", "test-load-secret-abc123")
        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_EXPIRES_AT", _future_iso())
        auth_limiter.reset()

        responses = []
        for _ in range(6):
            resp = client.post(
                LOGIN_URL,
                data={"username": "bypass-active-probe@example.com", "password": "wrong"},
                headers={"X-Load-Test-Token": "test-load-secret-abc123"},
            )
            responses.append(resp.status_code)

        assert responses == [401] * 6, responses

    def test_wrong_token_does_not_bypass_even_when_secret_is_configured(self, monkeypatch):
        """Configuring the secret doesn't loosen the limiter for everyone —
        only requests presenting the exact matching header are exempt."""
        from app.api.v1.endpoints.core.auth import limiter as auth_limiter
        from app.core.config import settings

        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_SECRET", "test-load-secret-abc123")
        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_EXPIRES_AT", _future_iso())
        auth_limiter.reset()

        responses = []
        for _ in range(6):
            resp = client.post(
                LOGIN_URL,
                data={"username": "bypass-wrongtoken-probe@example.com", "password": "wrong"},
                headers={"X-Load-Test-Token": "not-the-configured-secret"},
            )
            responses.append(resp.status_code)

        assert responses[5] == 429, responses


class TestLoadTestBypassExpiry:
    """Audit finding (round 2, Low): the secret alone had no automated
    expiry — see LOAD_TEST_BYPASS_EXPIRES_AT in app/core/config.py and
    _load_test_bypass_is_active() in auth.py."""

    def test_secret_configured_without_expiry_is_inert(self, monkeypatch):
        from app.api.v1.endpoints.core.auth import limiter as auth_limiter
        from app.core.config import settings

        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_SECRET", "test-load-secret-abc123")
        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_EXPIRES_AT", "")
        auth_limiter.reset()

        responses = []
        for _ in range(6):
            resp = client.post(
                LOGIN_URL,
                data={"username": "bypass-no-expiry-probe@example.com", "password": "wrong"},
                headers={"X-Load-Test-Token": "test-load-secret-abc123"},
            )
            responses.append(resp.status_code)

        assert responses[5] == 429, responses

    def test_expired_timestamp_is_inert(self, monkeypatch):
        from app.api.v1.endpoints.core.auth import limiter as auth_limiter
        from app.core.config import settings

        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_SECRET", "test-load-secret-abc123")
        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_EXPIRES_AT", "2020-01-01T00:00:00Z")
        auth_limiter.reset()

        responses = []
        for _ in range(6):
            resp = client.post(
                LOGIN_URL,
                data={"username": "bypass-expired-probe@example.com", "password": "wrong"},
                headers={"X-Load-Test-Token": "test-load-secret-abc123"},
            )
            responses.append(resp.status_code)

        assert responses[5] == 429, responses

    def test_unparseable_timestamp_is_inert(self, monkeypatch):
        from app.api.v1.endpoints.core.auth import limiter as auth_limiter
        from app.core.config import settings

        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_SECRET", "test-load-secret-abc123")
        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_EXPIRES_AT", "not-a-real-date")
        auth_limiter.reset()

        responses = []
        for _ in range(6):
            resp = client.post(
                LOGIN_URL,
                data={"username": "bypass-badformat-probe@example.com", "password": "wrong"},
                headers={"X-Load-Test-Token": "test-load-secret-abc123"},
            )
            responses.append(resp.status_code)

        assert responses[5] == 429, responses


def _future_iso() -> str:
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
