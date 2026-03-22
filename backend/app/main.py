import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.logging_config import setup_logging
from app.core.exceptions import (
    SchoolFlowException,
    schoolflow_exception_handler,
    http_exception_handler,
    unhandled_exception_handler,
)
from app.middlewares.tenant import TenantMiddleware
from app.middlewares.request_id import RequestIDMiddleware
from app.middlewares.metrics import MetricsMiddleware, metrics_endpoint
from app.middlewares.quota import QuotaMiddleware
from app.api.v1.router import api_router
from fastapi.exceptions import HTTPException

# ─── Logging ───────────────────────────────────────────────────────────────────
setup_logging(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

# ─── Rate Limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
    headers_enabled=True,   # X-RateLimit-* headers dans les réponses
)

# ─── Application FastAPI ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="""
## SchoolFlow Pro — School Management System API

A comprehensive REST API for managing schools, students, teachers, grades,
attendance, messaging, admissions and more.

### Authentication
All endpoints require a valid JWT Bearer token (Keycloak) except public endpoints.

### Multi-Tenancy
SchoolFlow Pro is fully multi-tenant. Every request is automatically scoped to
the authenticated user's tenant via the `X-Tenant-ID` header.

### Rate Limiting
Default: **100 requests / minute** per IP. Rate-limit headers (`X-RateLimit-*`)
are included in every response.

### Observability
Prometheus metrics are available at `GET /metrics`.
Every response includes an `X-Request-ID` header for distributed tracing.
    """,
    version=settings.APP_VERSION,
    contact={
        "name": "SchoolFlow Pro Support",
        "url": "https://schoolflowpro.com/support",
    },
    license_info={"name": "Proprietary"},
    openapi_tags=[
        {"name": "health", "description": "Health-check endpoints"},
        {"name": "auth", "description": "Authentication and authorization"},
        {"name": "students", "description": "Student management"},
        {"name": "teachers", "description": "Teacher management"},
        {"name": "grades", "description": "Grade and assessment management"},
        {"name": "attendance", "description": "Attendance tracking"},
        {"name": "classes", "description": "Classroom management"},
        {"name": "messages", "description": "Internal messaging system"},
        {"name": "announcements", "description": "School announcements"},
        {"name": "homework", "description": "Homework assignments"},
        {"name": "admissions", "description": "Admissions workflow"},
        {"name": "tenants", "description": "Tenant (school) management"},
        {"name": "users", "description": "User account management"},
        {"name": "dashboard", "description": "Dashboard statistics and KPIs"},
        {"name": "notifications", "description": "Push notifications"},
        {"name": "analytics", "description": "Analytics and reporting"},
        {"name": "audit", "description": "Audit log"},
    ],
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# ─── Exception Handlers ────────────────────────────────────────────────────────
app.add_exception_handler(SchoolFlowException, schoolflow_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(Exception, unhandled_exception_handler)  # type: ignore[arg-type]

# Attacher le limiter à l'état de l'app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── Middlewares (order matters — first added = last executed) ─────────────────
# 1. Request ID — must be outermost so all handlers have request_id
app.add_middleware(RequestIDMiddleware)

# 2. Prometheus metrics
app.add_middleware(MetricsMiddleware)

# 3. Slow API rate limiter
app.add_middleware(SlowAPIMiddleware)

# 4. Tenant resolution
app.add_middleware(TenantMiddleware)

# 5. Quota enforcement (needs tenant in request.state)
app.add_middleware(QuotaMiddleware)

# 6. CORS — must be outermost (added last) to handle all responses
origins = []
if settings.BACKEND_CORS_ORIGINS:
    if isinstance(settings.BACKEND_CORS_ORIGINS, str):
        origins = [o.strip() for o in settings.BACKEND_CORS_ORIGINS.split(",") if o.strip()]
    else:
        origins = [str(o) for o in settings.BACKEND_CORS_ORIGINS]

# En production, on restreint. En dev, on est souple mais on doit supporter les credentials
allow_all = settings.DEBUG and not origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else origins,
    allow_origin_regex=None if allow_all else r"https?://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# CORS was moved to the top of the stack

# ─── Routes de base ────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
def root():
    return {"message": "SchoolFlow Pro API", "version": settings.APP_VERSION, "docs": "/docs"}


@app.get("/health/", tags=["health"], summary="Health check")
def health_check():
    """Returns 200 OK when the service is running."""
    return {"status": "healthy", "version": settings.APP_VERSION}


@app.get("/metrics/", include_in_schema=False)
async def prometheus_metrics(request: Request):
    """Prometheus metrics endpoint."""
    return await metrics_endpoint(request)


# ─── Router API v1 ─────────────────────────────────────────────────────────────
app.include_router(api_router, prefix=settings.API_V1_STR)

logger.info(
    "SchoolFlow Pro API started",
    extra={"debug": settings.DEBUG, "log_level": settings.LOG_LEVEL},
)
