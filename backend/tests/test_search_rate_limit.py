"""GET /api/v1/search/ — rate limiting.

Audit finding (round 2, High): this endpoint ran full-text search across
up to a dozen tenant-scoped tables with no rate limit at all — see
app/api/v1/endpoints/core/search.py. 30/minute now bounds it, same
mechanism as its sibling endpoints (payments.py, public form submissions).
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as_tenant_admin(tenant_id: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return {"Authorization": "Bearer mock-token"}


class TestSearchRateLimit:
    # Order matters: slowapi's default in-memory storage is per-process and
    # keyed by IP (get_remote_address) — every request in this test module
    # shares the same client IP, so a test that intentionally exhausts the
    # limit must run last or it starves the one that follows it.
    def test_reasonable_usage_is_not_blocked(self):
        """A handful of searches (normal human typing, even without
        client-side debounce) must never hit the limit."""
        tenant_id = str(uuid.uuid4())
        headers = _as_tenant_admin(tenant_id)

        for _ in range(5):
            resp = client.get("/api/v1/search/?q=test", headers=headers)
            assert resp.status_code != 429

    def test_rate_limit_exceeded_returns_429(self):
        tenant_id = str(uuid.uuid4())
        headers = _as_tenant_admin(tenant_id)

        last_status = None
        for _ in range(35):
            resp = client.get("/api/v1/search/?q=test", headers=headers)
            last_status = resp.status_code
            if last_status == 429:
                break
        assert last_status == 429
