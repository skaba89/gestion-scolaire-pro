"""X-Load-Test-Token bypass for the app-wide default rate limiter
(app.main.limiter, default_limits=["100/minute"]).

national-readiness audit, 2026-09: a real k6 load campaign
(load-tests/campaign.js, docs/reports/PERF_CAMPAIGN_2026-09.md) generates
every request from ONE source IP. Running load-tests/smoke.js against a
live local instance (5 VUs, ~60s) produced ~49% HTTP 429 responses on
/health/ready alone — the app-wide default limiter, not any per-endpoint
one, was the dominant failure mode, drowning any real capacity signal
before it could be measured. get_client_ip_or_load_test_bypass
(app/core/client_ip.py) extends the exact same, already-audited
X-Load-Test-Token bypass from auth.py's login limiter to this one.

Isolated in its own file for the same reason as
test_login_rate_limit_bypass.py: it deliberately leaves the real
(non-mocked) app-wide limiter on and drives it past threshold, and must
not inherit a fixture that disables it. Uses /health/live — a plain,
unauthenticated GET with no per-endpoint @limiter.limit() override, so
only the app-wide default (100/minute) applies.
"""
import pytest
from conftest import get_test_client

client = get_test_client()

HEALTH_URL = "/health/live"


@pytest.fixture(autouse=True)
def _reset_app_wide_limiter_after():
    """app.main.limiter is a SHARED, process-wide in-memory store used by
    the SlowAPIMiddleware for every request in the app, not just this
    file's — deliberately tripping it past 100/minute (as every test
    below does) without resetting it again afterward left the app-wide
    counter exhausted for the rest of the pytest session, 429-ing
    unrelated tests elsewhere (login, bootstrap, health, MFA, token
    lifecycle...) that never touch this file. Reset happens before
    (each test starts from zero, same as already done inline below) AND
    after (never leak into a sibling test file)."""
    yield
    from app.main import limiter
    limiter.reset()


def _future_iso() -> str:
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()


class TestAppWideRateLimitBypass:
    def test_101st_request_429s_without_bypass_token(self):
        """Baseline: the app-wide 100/minute default limiter really does
        apply to a plain, unauthenticated endpoint — the exact behaviour
        that drowned the k6 smoke run in 429s."""
        from app.main import limiter

        limiter.reset()
        statuses = [client.get(HEALTH_URL).status_code for _ in range(101)]
        assert statuses[:100] == [200] * 100, statuses[:100]
        assert statuses[100] == 429, statuses

    def test_bypass_exempts_requests_with_the_correct_token(self, monkeypatch):
        """With LOAD_TEST_BYPASS_SECRET *and* a future
        LOAD_TEST_BYPASS_EXPIRES_AT configured, and the matching header
        presented, well over 100 requests in the same window must all
        stay 200 — each is keyed on a fresh uuid4, never accumulating."""
        from app.core.config import settings
        from app.main import limiter

        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_SECRET", "test-load-secret-appwide-1")
        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_EXPIRES_AT", _future_iso())
        limiter.reset()

        statuses = [
            client.get(HEALTH_URL, headers={"X-Load-Test-Token": "test-load-secret-appwide-1"}).status_code
            for _ in range(120)
        ]
        assert statuses == [200] * 120, statuses

    def test_wrong_token_does_not_bypass_even_when_secret_is_configured(self, monkeypatch):
        from app.core.config import settings
        from app.main import limiter

        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_SECRET", "test-load-secret-appwide-2")
        monkeypatch.setattr(settings, "LOAD_TEST_BYPASS_EXPIRES_AT", _future_iso())
        limiter.reset()

        statuses = [
            client.get(HEALTH_URL, headers={"X-Load-Test-Token": "not-the-configured-secret"}).status_code
            for _ in range(101)
        ]
        assert statuses[100] == 429, statuses

    def test_bypass_is_inert_when_secret_unset(self):
        """Default state (no LOAD_TEST_BYPASS_SECRET configured, the
        production default): presenting ANY X-Load-Test-Token value must
        NOT exempt the request."""
        from app.core.config import settings
        from app.main import limiter

        assert not settings.LOAD_TEST_BYPASS_SECRET, (
            "This test requires the bypass secret to be unset — the default "
            "production posture."
        )
        limiter.reset()

        statuses = [
            client.get(HEALTH_URL, headers={"X-Load-Test-Token": "some-random-guess"}).status_code
            for _ in range(101)
        ]
        assert statuses[100] == 429, statuses
