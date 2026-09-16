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
# doc's own "Stratégie recommandée" section). Instead: a small in-memory
# rolling window per tenant_id, process-local. On a multi-replica
# deployment each replica only sees its own share of a tenant's traffic,
# so this under-counts rather than over-counts — an accepted first-version
# limitation (same spirit as the doc's other "best-effort" alerts), not a
# false positive risk either way.
_TENANT_5XX_WINDOW_SECONDS = 15 * 60
_TENANT_5XX_MIN_SAMPLES = 20  # avoid alerting on e.g. 1 error out of 1 request
_TENANT_5XX_THRESHOLD = 0.05
_tenant_request_windows: "defaultdict[str, deque]" = defaultdict(deque)


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


async def _enqueue_tenant_5xx_alert(tenant_id: str, rate: float, sample_size: int) -> None:
    """Fire-and-forget: enqueue_job() itself never raises (fails open if
    Redis is unreachable), so this is safe to schedule via
    asyncio.create_task without a caller ever awaiting or handling it."""
    from app.core.jobs import enqueue_job

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
    result = _check_tenant_5xx_rate(str(tenant_id), status_code >= 500)
    if result is None:
        return
    rate, sample_size = result
    try:
        asyncio.create_task(_enqueue_tenant_5xx_alert(str(tenant_id), rate, sample_size))
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
