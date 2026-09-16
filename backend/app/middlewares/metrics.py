"""Prometheus metrics middleware for Academy Guinéenne."""
import asyncio
import re
import time
import logging
from collections import defaultdict, deque
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

try:
    from prometheus_client import (  # type: ignore[import-untyped]
        Counter,
        Histogram,
        Gauge,
        generate_latest,
        CONTENT_TYPE_LATEST,
    )

    REQUEST_COUNT = Counter(
        "http_requests_total",
        "Total number of HTTP requests",
        ["method", "endpoint", "status_code"],
    )
    REQUEST_DURATION = Histogram(
        "http_request_duration_seconds",
        "HTTP request duration in seconds",
        ["method", "endpoint"],
        buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
    )
    ACTIVE_CONNECTIONS = Gauge(
        "active_connections_total",
        "Number of active HTTP connections currently being processed",
    )
    BUSINESS_EVENT_COUNT = Counter(
        "business_events_total",
        "Critical business events derived from API traffic",
        ["event", "outcome"],
    )
    AUTHZ_DENIED_COUNT = Counter(
        "authz_denied_total",
        "Requests rejected with HTTP 403 (authorization denied)",
        ["method", "endpoint"],
    )
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False
    logger.info("prometheus_client not installed — metrics endpoint disabled")

# Regex for normalising path parameters to reduce cardinality
_UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)
_NUMERIC_RE = re.compile(r"/\d+")


def _normalise_path(path: str) -> str:
    """Replace UUIDs and numeric IDs in paths to avoid high-cardinality labels."""
    path = _UUID_RE.sub("{id}", path)
    path = _NUMERIC_RE.sub("/{id}", path)
    return path


# (method, normalised path without trailing slash) → business event name.
# Keys must match paths AFTER _normalise_path (UUIDs already replaced by {id}).
_BUSINESS_EVENTS = {
    ("POST", "/api/v1/auth/login"): "login",
    ("POST", "/api/v1/students"): "student_created",
    ("POST", "/api/v1/invoices"): "invoice_created",
    ("POST", "/api/v1/payments/invoices"): "invoice_created",
    ("POST", "/api/v1/payments/register"): "payment_registered",
    ("POST", "/api/v1/payments/{id}/reverse"): "payment_reversed",
    ("POST", "/api/v1/payments/intent"): "payment_intent_created",
    ("POST", "/api/v1/parents/payments/webhook/cinetpay"): "payment_webhook_received",
    ("POST", "/api/v1/parents/payments/webhook/paytech"): "payment_webhook_received",
}


def _record_business_metrics(method: str, endpoint: str, status_code: int) -> None:
    """Increment business counters derived from the HTTP outcome."""
    if status_code == 403:
        AUTHZ_DENIED_COUNT.labels(method=method, endpoint=endpoint).inc()

    event = _BUSINESS_EVENTS.get((method, endpoint.rstrip("/") or "/"))
    if event is not None:
        outcome = "success" if status_code < 400 else "failure"
        BUSINESS_EVENT_COUNT.labels(event=event, outcome=outcome).inc()


# ─── Alerte "taux d'erreur 5xx par tenant" (docs/TENANT_MONITORING.md) ────────
#
# Deliberately NOT a Prometheus label (tenant_id on REQUEST_COUNT/DURATION
# would blow up cardinality with hundreds/thousands of tenants — see the
# doc's own "Stratégie recommandée" section). Two layers:
#
# 1. An in-memory rolling window per tenant_id, process-local — the trigger
#    gate. Cheap (no I/O), so it's safe to run on every single request even
#    at national scale, and it works even if Redis is down.
# 2. Once that local gate trips, a best-effort read of Redis counters that
#    EVERY replica writes to on every request (fire-and-forget, via
#    asyncio.create_task, never awaited on the response path) — this gives
#    the alert email a cross-replica rate instead of just this process's
#    share of the tenant's traffic. Redis is already a hard dependency of
#    this app (see app/core/jobs.py), so this adds no new infrastructure.
#
# Known trade-off: the trigger itself stays local, so a tenant whose errors
# are spread evenly across many replicas (no single replica's share alone
# crosses the threshold) won't fire — same failure mode as before this
# layer existed. Reading Redis on every request instead (to make the
# trigger itself cross-replica) was deliberately rejected: it would add a
# network round-trip to every authenticated request in the entire
# application, which is a cost this doesn't buy back for the marginal case
# it would catch. Revisit only if that specific gap turns out to matter in
# practice.
_TENANT_5XX_WINDOW_SECONDS = 15 * 60
_TENANT_5XX_MIN_SAMPLES = 20  # avoid alerting on e.g. 1 error out of 1 request
_TENANT_5XX_THRESHOLD = 0.05
_tenant_request_windows: "defaultdict[str, deque]" = defaultdict(deque)

_TENANT_5XX_BUCKET_SECONDS = 60
_TENANT_5XX_BUCKET_COUNT = _TENANT_5XX_WINDOW_SECONDS // _TENANT_5XX_BUCKET_SECONDS
# TTL well past the window so a bucket a slow reader is still summing over
# never expires mid-read; buckets naturally age out on their own after that.
_TENANT_5XX_REDIS_TTL = _TENANT_5XX_WINDOW_SECONDS + (5 * 60)


def _check_tenant_5xx_rate(tenant_id: str, is_error: bool) -> Optional[tuple]:
    """Record one request outcome for `tenant_id` and return (rate, sample_size)
    if the rolling window just crossed the alert threshold, else None."""
    now = time.time()
    window = _tenant_request_windows[tenant_id]
    window.append((now, is_error))
    cutoff = now - _TENANT_5XX_WINDOW_SECONDS
    while window and window[0][0] < cutoff:
        window.popleft()
    total = len(window)
    if total < _TENANT_5XX_MIN_SAMPLES:
        return None
    errors = sum(1 for _, err in window if err)
    rate = errors / total
    if rate <= _TENANT_5XX_THRESHOLD:
        return None
    return rate, total


async def _bump_tenant_redis_counters(tenant_id: str, is_error: bool) -> None:
    """Best-effort, cross-replica request/error counters — one fixed-size
    bucket per minute per tenant. Always scheduled via asyncio.create_task
    (see _track_tenant_5xx below), so a slow or unreachable Redis can never
    add latency to the request that triggered it; any failure here is
    swallowed, matching this codebase's existing fail-open convention for
    every other Redis-optional feature (blacklist, lockout, session limits
    — see app/core/jobs.py's own docstring)."""
    try:
        from app.core.cache import redis_client

        bucket = int(time.time() // _TENANT_5XX_BUCKET_SECONDS)
        client = await redis_client.client
        total_key = f"sfp:5xx:{tenant_id}:{bucket}:total"
        pipe = client.pipeline()
        pipe.incr(total_key)
        pipe.expire(total_key, _TENANT_5XX_REDIS_TTL)
        if is_error:
            err_key = f"sfp:5xx:{tenant_id}:{bucket}:err"
            pipe.incr(err_key)
            pipe.expire(err_key, _TENANT_5XX_REDIS_TTL)
        await pipe.execute()
    except Exception as exc:
        logger.debug("5xx Redis counter bump failed for tenant %s: %s", tenant_id, exc)


async def _read_tenant_redis_rate(tenant_id: str) -> Optional[tuple]:
    """Sum the last _TENANT_5XX_BUCKET_COUNT per-minute buckets across every
    replica. Returns None (never raises) if Redis is unreachable or the
    aggregate doesn't cross the threshold — callers must have their own
    (local, always-available) fallback."""
    try:
        from app.core.cache import redis_client

        client = await redis_client.client
        now_bucket = int(time.time() // _TENANT_5XX_BUCKET_SECONDS)
        buckets = range(now_bucket - _TENANT_5XX_BUCKET_COUNT + 1, now_bucket + 1)
        total_keys = [f"sfp:5xx:{tenant_id}:{b}:total" for b in buckets]
        err_keys = [f"sfp:5xx:{tenant_id}:{b}:err" for b in buckets]
        totals = await client.mget(total_keys)
        errors_raw = await client.mget(err_keys)
        total = sum(int(v) for v in totals if v)
        errors = sum(int(v) for v in errors_raw if v)
        if total < _TENANT_5XX_MIN_SAMPLES:
            return None
        rate = errors / total
        if rate <= _TENANT_5XX_THRESHOLD:
            return None
        return rate, total
    except Exception as exc:
        logger.debug("5xx Redis aggregate read failed for tenant %s: %s", tenant_id, exc)
        return None


async def _enqueue_tenant_5xx_alert(tenant_id: str, local_rate: float, local_sample_size: int) -> None:
    """Fire-and-forget: enqueue_job() itself never raises (fails open if
    Redis is unreachable), so this is safe to schedule via
    asyncio.create_task without a caller ever awaiting or handling it.

    Prefers the cross-replica Redis aggregate over the local (single
    process) numbers that triggered this call, when Redis is reachable —
    see the module-level comment above for why the trigger itself stays
    local while the reported rate doesn't have to."""
    from app.core.jobs import enqueue_job

    aggregate = await _read_tenant_redis_rate(tenant_id)
    rate, sample_size = aggregate if aggregate is not None else (local_rate, local_sample_size)

    hour_bucket = int(time.time() // 3600)
    await enqueue_job(
        "send_tenant_5xx_alert",
        tenant_id=tenant_id,
        error_rate=rate,
        sample_size=sample_size,
        window_seconds=_TENANT_5XX_WINDOW_SECONDS,
        # De-dupes across requests within the same hour for the same tenant
        # (Arq skips enqueueing a job with a `_job_id` that's already
        # queued/running) — without this, every single request while the
        # window stays above threshold would enqueue its own alert job.
        _job_id=f"5xx_alert:{tenant_id}:{hour_bucket}",
    )


def _track_tenant_5xx(request: Request, status_code: int) -> None:
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        return
    tenant_id = str(tenant_id)
    is_error = status_code >= 500

    try:
        asyncio.create_task(_bump_tenant_redis_counters(tenant_id, is_error))
    except RuntimeError:
        pass  # no running event loop — never let counter bumping break the request

    result = _check_tenant_5xx_rate(tenant_id, is_error)
    if result is None:
        return
    rate, sample_size = result
    try:
        asyncio.create_task(_enqueue_tenant_5xx_alert(tenant_id, rate, sample_size))
    except RuntimeError:
        # No running event loop (shouldn't happen inside an async ASGI
        # middleware, but never let alerting break request handling).
        logger.warning("Could not schedule 5xx alert enqueue for tenant %s", tenant_id)


class MetricsMiddleware(BaseHTTPMiddleware):
    """Record Prometheus metrics for every HTTP request."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip the /metrics endpoint itself to avoid infinite recursion
        if request.url.path in ("/metrics", "/metrics/"):
            return await call_next(request)

        # Tenant 5xx-rate tracking (_track_tenant_5xx) is independent of
        # prometheus_client's availability — it must keep working even in
        # an environment where that optional dependency isn't installed.
        if not PROMETHEUS_AVAILABLE:
            try:
                response = await call_next(request)
                _track_tenant_5xx(request, response.status_code)
                return response
            except Exception:
                _track_tenant_5xx(request, 500)
                raise

        endpoint = _normalise_path(request.url.path)
        start = time.perf_counter()
        ACTIVE_CONNECTIONS.inc()

        try:
            response = await call_next(request)
            duration = time.perf_counter() - start
            REQUEST_COUNT.labels(
                method=request.method,
                endpoint=endpoint,
                status_code=str(response.status_code),
            ).inc()
            REQUEST_DURATION.labels(
                method=request.method,
                endpoint=endpoint,
            ).observe(duration)
            _record_business_metrics(request.method, endpoint, response.status_code)
            _track_tenant_5xx(request, response.status_code)
            return response
        except Exception:
            duration = time.perf_counter() - start
            REQUEST_COUNT.labels(
                method=request.method,
                endpoint=endpoint,
                status_code="500",
            ).inc()
            _track_tenant_5xx(request, 500)
            raise
        finally:
            ACTIVE_CONNECTIONS.dec()


async def metrics_endpoint(_request: Request) -> Response:
    """Expose Prometheus metrics at GET /metrics."""
    if not PROMETHEUS_AVAILABLE:
        from starlette.responses import PlainTextResponse  # noqa: PLC0415

        return PlainTextResponse(
            "prometheus_client not installed", status_code=503
        )
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
