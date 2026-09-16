"""Cross-replica aggregation for the 5xx-rate-per-tenant alert
(docs/TENANT_MONITORING.md, docs/NATIONAL_SCALE_READINESS.md §6).

The in-memory sliding window in app/middlewares/metrics.py (covered by
test_tenant_5xx_alert.py) is process-local: on a multi-replica deployment
each instance only sees its own share of a tenant's traffic. This file
covers the Redis layer added on top of it — every replica writes per-minute
counters on every request (_bump_tenant_redis_counters), and the replica
whose local window trips reads the aggregate across all of them
(_read_tenant_redis_rate) before sending the alert, so the reported rate
reflects the whole fleet rather than one process's slice.

Needs a real Redis (skipped otherwise, same convention as
test_account_lockout.py) — these functions talk to app.core.cache.redis_client
directly, not a mock.
"""
import time
import uuid

import pytest
from conftest import get_test_client, redis_is_available

client = get_test_client()

from app.middlewares.metrics import (  # noqa: E402
    _TENANT_5XX_MIN_SAMPLES,
    _bump_tenant_redis_counters,
    _read_tenant_redis_rate,
)

_needs_redis = pytest.mark.skipif(not redis_is_available(), reason="Requires a real Redis instance")


async def _cleanup(tenant_id: str) -> None:
    from app.core.cache import redis_client

    redis = await redis_client.client
    keys = await redis.keys(f"sfp:5xx:{tenant_id}:*")
    if keys:
        await redis.delete(*keys)


@_needs_redis
class TestBumpAndReadTenantRedisCounters:
    @pytest.mark.asyncio
    async def test_read_returns_none_below_min_samples(self):
        tenant_id = str(uuid.uuid4())
        try:
            for _ in range(_TENANT_5XX_MIN_SAMPLES - 1):
                await _bump_tenant_redis_counters(tenant_id, is_error=True)
            result = await _read_tenant_redis_rate(tenant_id)
            assert result is None
        finally:
            await _cleanup(tenant_id)

    @pytest.mark.asyncio
    async def test_read_returns_none_when_rate_at_or_below_threshold(self):
        tenant_id = str(uuid.uuid4())
        try:
            for i in range(_TENANT_5XX_MIN_SAMPLES):
                await _bump_tenant_redis_counters(tenant_id, is_error=(i == 0))
            result = await _read_tenant_redis_rate(tenant_id)
            assert result is None
        finally:
            await _cleanup(tenant_id)

    @pytest.mark.asyncio
    async def test_read_aggregates_across_simulated_replicas(self):
        """Two independent tenants' worth of counter bumps, interleaved
        exactly like two separate processes writing to the same Redis
        would — proves the aggregate is a real sum, not per-caller state."""
        tenant_id = str(uuid.uuid4())
        try:
            # "Replica A": 10 requests, 1 error (10% locally — below the
            # in-memory gate's own min-samples of 20, so it would never
            # trigger alone).
            for i in range(10):
                await _bump_tenant_redis_counters(tenant_id, is_error=(i == 0))
            # "Replica B": 10 requests, 2 errors.
            for i in range(10):
                await _bump_tenant_redis_counters(tenant_id, is_error=(i < 2))

            result = await _read_tenant_redis_rate(tenant_id)
            assert result is not None
            rate, total = result
            assert total == 20
            assert rate == pytest.approx(3 / 20)
        finally:
            await _cleanup(tenant_id)

    @pytest.mark.asyncio
    async def test_counters_are_isolated_per_tenant(self):
        tenant_a = str(uuid.uuid4())
        tenant_b = str(uuid.uuid4())
        try:
            for _ in range(_TENANT_5XX_MIN_SAMPLES):
                await _bump_tenant_redis_counters(tenant_a, is_error=True)
            result_b = await _read_tenant_redis_rate(tenant_b)
            assert result_b is None
        finally:
            await _cleanup(tenant_a)
            await _cleanup(tenant_b)

    @pytest.mark.asyncio
    async def test_read_never_raises_when_redis_unreachable(self, monkeypatch):
        from app.core import cache as cache_module

        async def _raise(self):
            raise ConnectionError("Redis down")

        monkeypatch.setattr(type(cache_module.redis_client), "client", property(_raise))

        result = await _read_tenant_redis_rate(str(uuid.uuid4()))
        assert result is None

    @pytest.mark.asyncio
    async def test_bump_never_raises_when_redis_unreachable(self, monkeypatch):
        from app.core import cache as cache_module

        async def _raise(self):
            raise ConnectionError("Redis down")

        monkeypatch.setattr(type(cache_module.redis_client), "client", property(_raise))

        # Must not raise.
        await _bump_tenant_redis_counters(str(uuid.uuid4()), is_error=True)


@_needs_redis
class TestEnqueueUsesRedisAggregateWhenAvailable:
    @pytest.mark.asyncio
    async def test_enqueue_reports_aggregate_rate_over_local(self, monkeypatch):
        """When Redis has a higher-fidelity (cross-replica) view than the
        local window that triggered the alert, the enqueued job must carry
        the Redis numbers, not the local ones — that's the whole point of
        this layer."""
        from app.middlewares.metrics import _enqueue_tenant_5xx_alert

        tenant_id = str(uuid.uuid4())
        captured = {}

        async def _fake_enqueue_job(function_name, /, **kwargs):
            captured["function_name"] = function_name
            captured.update(kwargs)
            return "fake-job-id"

        monkeypatch.setattr("app.core.jobs.enqueue_job", _fake_enqueue_job)

        try:
            # Aggregate across "replicas": 40 requests, 8 errors (20%).
            for i in range(40):
                await _bump_tenant_redis_counters(tenant_id, is_error=(i < 8))

            # Local window that triggered the call: only 20 requests, 2 errors (10%).
            await _enqueue_tenant_5xx_alert(tenant_id, local_rate=0.10, local_sample_size=20)

            assert captured["function_name"] == "send_tenant_5xx_alert"
            assert captured["sample_size"] == 40
            assert captured["error_rate"] == pytest.approx(0.2)
        finally:
            await _cleanup(tenant_id)

    @pytest.mark.asyncio
    async def test_enqueue_falls_back_to_local_when_redis_has_no_data(self, monkeypatch):
        from app.middlewares.metrics import _enqueue_tenant_5xx_alert

        tenant_id = str(uuid.uuid4())
        captured = {}

        async def _fake_enqueue_job(function_name, /, **kwargs):
            captured["function_name"] = function_name
            captured.update(kwargs)
            return "fake-job-id"

        monkeypatch.setattr("app.core.jobs.enqueue_job", _fake_enqueue_job)

        # No Redis counters written for this tenant at all.
        await _enqueue_tenant_5xx_alert(tenant_id, local_rate=0.30, local_sample_size=25)

        assert captured["sample_size"] == 25
        assert captured["error_rate"] == pytest.approx(0.30)
