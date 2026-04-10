"""Prometheus metrics middleware for SchoolFlow Pro."""
import re
import time
import logging
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


class MetricsMiddleware(BaseHTTPMiddleware):
    """Record Prometheus metrics for every HTTP request."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if not PROMETHEUS_AVAILABLE:
            return await call_next(request)

        # Skip the /metrics endpoint itself to avoid infinite recursion
        if request.url.path in ("/metrics", "/metrics/"):
            return await call_next(request)

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
            return response
        except Exception:
            duration = time.perf_counter() - start
            REQUEST_COUNT.labels(
                method=request.method,
                endpoint=endpoint,
                status_code="500",
            ).inc()
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
