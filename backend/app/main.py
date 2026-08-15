import asyncio
import ipaddress
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings

# ─── Sentry — initialisation avant tout le reste ─────────────────────────────
def _init_sentry() -> None:
    """Initialise Sentry si SENTRY_DSN est configuré."""
    if not settings.SENTRY_DSN:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.redis import RedisIntegration

        def _scrub_sensitive(event, hint):
            """Supprimer les données sensibles avant envoi à Sentry (RGPD)."""
            if "request" in event:
                headers = event["request"].get("headers", {})
                for sensitive_header in ("authorization", "x-tenant-id", "cookie"):
                    headers.pop(sensitive_header, None)
            return event

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.SENTRY_ENVIRONMENT,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
                RedisIntegration(),
            ],
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            send_default_pii=False,  # RGPD : jamais de données personnelles
            before_send=_scrub_sensitive,
        )
        logging.getLogger(__name__).info(
            "Sentry initialized (env=%s, sample_rate=%.2f)",
            settings.SENTRY_ENVIRONMENT,
            settings.SENTRY_TRACES_SAMPLE_RATE,
        )
    except ImportError:
        logging.getLogger(__name__).warning(
            "sentry-sdk not installed — skipping Sentry init. "
            "Add sentry-sdk[fastapi,sqlalchemy] to requirements.txt."
        )


_init_sentry()
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

setup_logging(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

# Render/Cloudflare proxy IPs — only trust X-Forwarded-For from these.
# These are CIDR *networks*, not literal address prefixes — a direct
# `str.startswith("10.0.0.0")` check (the previous implementation) never
# matches a real internal address like "10.0.4.23" (only literal strings
# starting with "10.0.0.0" would), so it silently never trusted Render's
# actual proxy IPs. Every request then fell back to get_remote_address(),
# which behind Render/Cloudflare resolves to the same edge connection for
# all traffic — collapsing every client onto one shared rate-limit bucket
# (discovered when a single visitor exhausted the 5/minute bootstrap
# limit and it never reset until the in-memory limiter was restarted).
_TRUSTED_PROXY_NETWORKS = [
    ipaddress.ip_network("127.0.0.1/32"),
    ipaddress.ip_network("::1/128"),
    # Render internal proxy ranges (RFC 1918 private space)
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
]

def _get_client_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For from trusted proxies.

    SECURITY: Only trust X-Forwarded-For when the direct connection comes from
    a known proxy. Otherwise, clients can spoof this header to bypass rate limiting.
    """
    client_host = request.client.host if request.client else None
    if client_host:
        try:
            addr = ipaddress.ip_address(client_host)
            is_trusted = any(addr in network for network in _TRUSTED_PROXY_NETWORKS)
        except ValueError:
            is_trusted = False
        if is_trusted:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                return forwarded.split(",")[0].strip()
    return get_remote_address(request)

limiter = Limiter(
    key_func=_get_client_ip,
    default_limits=["100/minute"],
    headers_enabled=True,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──
    logger.info("Academy Guinéenne API starting up...")

    # Auto-run pending Alembic migrations — SKIPPED when start.sh already ran
    # them (SCHOOLFLOW_MIGRATIONS_DONE=true). Without this guard, every
    # gunicorn worker re-runs "alembic upgrade head" concurrently at boot.
    from app.core.database import Base, engine
    import app.models  # noqa: F401 — ensure all models are registered

    if os.getenv("SCHOOLFLOW_MIGRATIONS_DONE", "").lower() == "true":
        logger.info("Alembic migrations already applied by start.sh — skipping lifespan migration")
    else:
        try:
            from alembic.config import Config
            from alembic import command

            backend_dir = os.path.dirname(os.path.dirname(__file__))
            alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
            alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
            alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC)
            command.upgrade(alembic_cfg, "head")
            logger.info("Alembic auto-migration: upgrade head succeeded")
        except Exception as alembic_err:
            logger.critical(
                "Alembic migration FAILED: %s — refusing to start. "
                "Fix the migration and retry. Do NOT use create_all as a fallback "
                "as it may create an incomplete or inconsistent schema.",
                alembic_err,
            )
            raise SystemExit(1)

    # create_all uniquement en mode SQLite/développement local sans Alembic
    # En production PostgreSQL, Alembic est l'unique source de vérité.
    if settings.is_sqlite:
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("SQLite dev mode: Base.metadata.create_all succeeded")
        except Exception as create_err:
            logger.error("SQLite table creation failed: %s", create_err)

    # Ensure operational tables that have NO SQLAlchemy models
    try:
        from app.core.operational_tables import ensure_operational_tables
        ensure_operational_tables(engine)
        logger.info("Operational tables ensured via raw SQL")
    except Exception as op_err:
        logger.warning("Operational table creation failed: %s", op_err)

    # NOTE: Column backfills previously done here are now managed by
    # Alembic migration 20260424_0003_ensure_core_table_columns.py
    # which runs automatically via `alembic upgrade head` at startup above.

    # Auto-create super admin if no admin exists
    try:
        from app.core.database import SessionLocal
        from app.models.user import User
        from app.core.security import get_password_hash
        from sqlalchemy import text
        import uuid

        db = SessionLocal()
        try:
            if not settings.is_sqlite:
                # Backfill: set username = email prefix for any users with NULL username
                try:
                    db.execute(text(
                        "UPDATE users SET username = SPLIT_PART(email, '@', 1) "
                        "WHERE username IS NULL AND email IS NOT NULL"
                    ))
                    db.commit()
                except Exception:
                    db.rollback()

            admin_email = settings.ADMIN_DEFAULT_EMAIL or "admin@schoolflow.local"
            admin_password = settings.ADMIN_DEFAULT_PASSWORD
            # SECURITY FIX: Refuse to use a hardcoded fallback password.
            # If no password is configured or it's too weak, skip admin creation.
            if not admin_password or len(admin_password) < 8:
                logger.critical(
                    "ADMIN_DEFAULT_PASSWORD not set or too short (min 8 chars). "
                    "Refusing to create admin user."
                )
                # Don't exit — just skip admin creation, the bootstrap endpoint can create one later
                admin_password = None

            existing = db.query(User).filter(User.email == admin_email).first()
            if not existing:
                if not admin_password:
                    logger.warning(
                        "ADMIN_DEFAULT_PASSWORD not configured. "
                        "Super admin not created. Use the /api/v1/auth/bootstrap/ endpoint."
                    )
                else:
                    admin_id = str(uuid.uuid4())
                    admin = User(
                        id=admin_id,
                        email=admin_email,
                        username="admin",
                        password_hash=get_password_hash(admin_password),
                        first_name="Super",
                        last_name="Admin",
                        is_active=True,
                        is_superuser=True,
                        tenant_id=None,
                    )
                    db.add(admin)
                    db.flush()
                    db.execute(
                        text("INSERT INTO user_roles (id, user_id, role, tenant_id, created_at, updated_at) "
                             "VALUES (:id, :uid, 'SUPER_ADMIN', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"),
                        {"id": str(uuid.uuid4()), "uid": admin_id}
                    )
                    db.commit()
                    logger.info("Auto-created super admin: %s", admin_email)
            else:
                # Update admin password if ADMIN_DEFAULT_PASSWORD is explicitly set.
                # Uses bcrypt check to avoid unnecessary hash rewrites when the
                # password hasn't actually changed.
                needs_update = False
                if not existing.password_hash:
                    needs_update = True
                    logger.info("Super admin has NULL password_hash, resetting...")
                elif admin_password and len(admin_password) >= 8:
                    # Verify current hash matches ADMIN_DEFAULT_PASSWORD
                    from passlib.context import CryptContext
                    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
                    if not pwd_context.verify(admin_password, existing.password_hash):
                        needs_update = True
                        logger.info("Super admin password differs from ADMIN_DEFAULT_PASSWORD, updating...")

                # Fix users missing username (column added after initial migration)
                if not getattr(existing, "username", None):
                    existing.username = admin_email.split("@")[0]
                    needs_update = True
                    logger.info("Super admin username was NULL, set to '%s'", existing.username)

                if needs_update and admin_password and len(admin_password) >= 8:
                    existing.password_hash = get_password_hash(admin_password)
                    existing.is_active = True
                    existing.is_superuser = True
                    db.commit()
                    logger.info("Super admin password updated successfully")
                elif needs_update:
                    logger.warning(
                        "Super admin needs password reset but ADMIN_DEFAULT_PASSWORD is not set "
                        "or too short. Use the /api/v1/auth/bootstrap/ endpoint."
                    )
                else:
                    logger.info("Super admin already exists, password OK, skipping")
        finally:
            db.close()
    except Exception as admin_err:
        logger.warning("Super admin auto-creation skipped: %s", admin_err)

    logger.info(
        "Academy Guinéenne API started",
        extra={"debug": settings.DEBUG, "log_level": settings.LOG_LEVEL},
    )

    yield  # App is running

    # ── SHUTDOWN ──
    logger.info("Academy Guinéenne API shutting down...")
    try:
        from app.core.cache import redis_client
        if redis_client._client is not None:
            await redis_client._client.close()
            logger.info("Redis connection closed")
    except Exception as e:
        logger.warning("Redis shutdown cleanup failed: %s", e)
    try:
        engine.dispose()
        logger.info("Database engine disposed")
    except Exception as e:
        logger.warning("Database shutdown cleanup failed: %s", e)
    logger.info("Academy Guinéenne API shutdown complete")


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    description="""
## Academy Guinéenne — School Management System API

A comprehensive REST API for managing schools, students, teachers, grades,
attendance, messaging, admissions and more.

### Authentication
All protected endpoints require a valid native JWT Bearer token except public endpoints.

### Multi-Tenancy
Academy Guinéenne is fully multi-tenant. Every request is automatically scoped to
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
        "name": "Academy Guinéenne Support",
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
    openapi_url=f"{settings.API_V1_STR}/openapi.json" if settings.DEBUG else None,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

app.add_exception_handler(SchoolFlowException, schoolflow_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(Exception, unhandled_exception_handler)  # type: ignore[arg-type]

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── CORS Middleware (MUST be first / outermost) ──────────────────────────
# In Starlette, the first middleware added is the outermost — it processes
# every request before any other middleware can interfere.  CORS *must*
# handle OPTIONS preflight requests at the outermost layer.
origins = []
if settings.BACKEND_CORS_ORIGINS:
    if isinstance(settings.BACKEND_CORS_ORIGINS, str):
        origins = [o.strip() for o in settings.BACKEND_CORS_ORIGINS.split(",") if o.strip()]
    else:
        origins = [str(o) for o in settings.BACKEND_CORS_ORIGINS]

    # FIX: Normalize origins — ensure https:// prefix is present.
    # Render's fromService.host returns bare hostnames (e.g. "site.onrender.com")
    # but the browser sends "Origin: https://site.onrender.com".
    _normalized = []
    for o in origins:
        if o and not o.startswith(("http://", "https://", "*")):
            o = f"https://{o}"
        _normalized.append(o)
    origins = _normalized

# Si aucune origine configurée : defaults sécurisés (jamais "*")
if not origins:
    if settings.DEBUG:
        # DEBUG : localhost uniquement — jamais de wildcard
        origins = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
        logger.warning(
            "CORS: BACKEND_CORS_ORIGINS not set — using localhost defaults (DEBUG mode). "
            "Set BACKEND_CORS_ORIGINS before deploying to production."
        )
    else:
        # Production sans BACKEND_CORS_ORIGINS : refus de démarrage
        logger.critical(
            "CORS: BACKEND_CORS_ORIGINS is required in production (DEBUG=False). "
            "Set it to your frontend URL, e.g.: https://yourapp.netlify.app"
        )
        raise SystemExit(1)

# SECURITY: Bearer tokens → pas de cookies → allow_credentials peut rester True
# sauf si on a le wildcard (impossible désormais)
allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "X-Tenant-ID", "Content-Type", "X-Request-ID", "Accept"],
    # X-Total-Count: pagination header on GET /tenants/ and /tenants/public/
    # (see tenants.py) — without it here, browsers strip the header from the
    # JS-visible response and the frontend can never read the real total.
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-Request-ID", "X-Total-Count"],
)

# Store allowed origins on app state so exception handlers can use them for CORS
app.state._cors_allowed_origins = origins

# ─── Application middlewares (inner layers) ───────────────────────────────
app.add_middleware(RequestIDMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(QuotaMiddleware)
app.add_middleware(TenantMiddleware)


# ─── Token Version Validation Middleware ────────────────────────────────
@app.middleware("http")
async def token_version_middleware(request: Request, call_next):
    """Validate JWT token version for authenticated requests.

    After a user calls logout-all, their token version is bumped in Redis.
    This middleware checks every authenticated request's token version
    against Redis, rejecting stale tokens with 401 Unauthorized.
    This ensures logout-all is enforced globally without modifying each endpoint.
    """
    # Skip non-API paths and health/docs
    path = request.url.path
    if not path.startswith(settings.API_V1_STR):
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token_str = auth_header.split(" ")[1]
        try:
            import jwt as jwt_lib
            payload = jwt_lib.decode(
                token_str,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
                options={"verify_exp": True},  # Always verify token expiry
                audience="schoolflow-api",
                issuer="schoolflow-pro",
            )
            token_version = payload.get("tv", 0)
            user_id = payload.get("sub")
            if token_version and token_version > 0 and user_id:
                from app.core.security import _get_token_version_from_redis
                current_version = await _get_token_version_from_redis(user_id)
                if current_version > token_version:
                    logger.info(
                        "Token version rejected via middleware: token=%d, current=%d, user=%s",
                        token_version, current_version, user_id,
                    )
                    from fastapi.responses import JSONResponse
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Token has been invalidated (logged out from all devices)"},
                        headers={"WWW-Authenticate": "Bearer"},
                    )
        except Exception:
            # Token parsing failed — let the endpoint dependency handle it
            pass

    return await call_next(request)


# ─── Security Headers Middleware ──────────────────────────────────────────
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Add security headers to every response.

    - Strict-Transport-Security (HSTS): Force HTTPS for 1 year, include subdomains
    - X-Content-Type-Options: Prevent MIME type sniffing
    - X-Frame-Options: Prevent clickjacking (DENY = never allow framing)
    - X-XSS-Protection: Legacy XSS filter for older browsers
    - Referrer-Policy: Limit referrer leakage
    - Permissions-Policy: Restrict browser features
    """
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # CSP: Allow API responses to include image URLs from any origin (logos, uploads)
    # while still blocking framing (clickjacking protection via frame-ancestors).
    # The backend serves JSON + static uploads, not HTML, so default-src 'none' is
    # too restrictive — it blocks browsers from loading images from our own /uploads/.
    # CSP for an API backend: only frame-ancestors matters (prevent clickjacking).
    # Do NOT set connect-src or default-src — the browser applies the API's CSP
    # to the calling page, which breaks cross-origin frontend→backend requests.
    response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


# Registered last so it is the OUTERMOST layer: requests short-circuited by
# TenantMiddleware or token-version checks (401/403) must still be counted in
# http_requests_total / authz_denied_total — that traffic is exactly what
# brute-force and cross-tenant-probe alerting needs to see.
app.add_middleware(MetricsMiddleware)


@app.get("/", include_in_schema=False)
def root():
    return {
        "message": "Academy Guinéenne API is operational",
        "service": "Academy Guinéenne API",
        "version": settings.APP_VERSION,
        "status": "operational",
        "docs": "/docs" if settings.DEBUG else None,
        "health": "/health/ready",
        "liveness": "/health/live",
        "api": settings.API_V1_STR,
    }


def _check_database_and_rls() -> tuple[str, str]:
    """Check PostgreSQL connectivity and every tenant table's RLS policy."""
    from app.core.database import SessionLocal
    from sqlalchemy import text as sa_text

    try:
        with SessionLocal() as _db:
            _db.execute(sa_text("SELECT 1"))
    except Exception as exc:
        logger.warning("Readiness database check failed: %s", exc)
        return "unreachable", "unknown"

    if settings.is_sqlite:
        return "connected", "skipped"

    try:
        with SessionLocal() as _db:
            scoped_tables, unprotected_tables = _db.execute(sa_text("""
                SELECT
                    count(*) AS scoped_tables,
                    count(*) FILTER (
                        WHERE NOT cls.relrowsecurity
                           OR NOT cls.relforcerowsecurity
                           OR NOT EXISTS (
                               SELECT 1
                               FROM pg_policy pol
                               WHERE pol.polrelid = cls.oid
                                 AND (
                                     COALESCE(
                                         pg_get_expr(pol.polqual, pol.polrelid),
                                         ''
                                     ) LIKE '%app.current_tenant_id%'
                                     OR COALESCE(
                                         pg_get_expr(pol.polwithcheck, pol.polrelid),
                                         ''
                                     ) LIKE '%app.current_tenant_id%'
                                 )
                           )
                    ) AS unprotected_tables
                FROM pg_class cls
                JOIN pg_namespace ns ON ns.oid = cls.relnamespace
                WHERE ns.nspname = 'public'
                  AND cls.relkind IN ('r', 'p')
                  AND EXISTS (
                      SELECT 1
                      FROM pg_attribute attr
                      WHERE attr.attrelid = cls.oid
                        AND attr.attname = 'tenant_id'
                        AND NOT attr.attisdropped
                  )
            """)).one()
        if scoped_tables == 0:
            return "connected", "missing"
        return "connected", "active" if unprotected_tables == 0 else "disabled"
    except Exception as exc:
        logger.warning("Readiness RLS check failed: %s", exc)
        return "connected", "unknown"


async def _check_cache_readiness() -> str:
    """Bound Redis readiness latency so a failed cache cannot hang the probe."""
    try:
        from app.core.cache import redis_client

        client = await redis_client.client
        await asyncio.wait_for(client.ping(), timeout=2.0)
        return "connected"
    except Exception as exc:
        logger.warning("Readiness Redis check failed: %s", exc)
        return "unreachable"


async def _check_storage_readiness() -> str:
    """MinIO readiness — reports "disabled" (not a failure) when the app is
    deliberately running on the local-disk fallback (see app/core/storage.py),
    so a dev/staging environment without MinIO configured doesn't report
    unhealthy for a component it isn't even using.
    """
    try:
        from app.core.storage import storage_client

        minio = storage_client._minio
        if not minio.enabled:
            return "disabled"
        return await asyncio.wait_for(
            asyncio.to_thread(minio.client.bucket_exists, minio.bucket_name),
            timeout=2.0,
        ) and "connected" or "unreachable"
    except Exception as exc:
        logger.warning("Readiness MinIO check failed: %s", exc)
        return "unreachable"


def _readiness_is_healthy(
    *,
    database: str,
    cache: str,
    rls: str,
    storage: str,
    is_sqlite: bool,
) -> bool:
    if database != "connected":
        return False
    if is_sqlite:
        return True
    if storage == "unreachable":
        return False
    return cache == "connected" and rls == "active"


@app.get("/health/live", tags=["Health"], summary="Liveness probe")
async def liveness_check():
    """Report only that the API process can serve requests."""
    return JSONResponse(
        status_code=200,
        headers={"Cache-Control": "no-store"},
        content={"status": "alive", "version": settings.APP_VERSION},
    )


@app.get("/health/ready", tags=["Health"], summary="Readiness probe")
async def readiness_check():
    """Require every production-critical dependency before receiving traffic."""
    db_status, rls_status = await asyncio.to_thread(_check_database_and_rls)
    redis_status = await _check_cache_readiness()
    storage_status = await _check_storage_readiness()
    healthy = _readiness_is_healthy(
        database=db_status,
        cache=redis_status,
        rls=rls_status,
        storage=storage_status,
        is_sqlite=settings.is_sqlite,
    )

    return JSONResponse(
        status_code=200 if healthy else 503,
        headers={"Cache-Control": "no-store"},
        content={
            "status": "healthy" if healthy else "unhealthy",
            "version": settings.APP_VERSION,
            "components": {
                "database": db_status,
                "cache": redis_status,
                "rls": rls_status,
                "storage": storage_status,
            },
        },
    )


@app.get("/health/", tags=["Health"], summary="Compatibility readiness probe")
async def health_check():
    """Keep the historical endpoint as an alias of the canonical readiness probe."""
    return await readiness_check()


def _check_disk_space() -> dict:
    """Disk space on the volume that matters most for this deployment: the
    local upload fallback directory (see app/core/storage.py) when MinIO is
    disabled, otherwise the app's own working directory as a proxy for the
    container filesystem. Non-fatal: any error reports "unknown" rather than
    failing the whole /health/deep/ response over a diagnostic side-check.
    """
    import shutil

    try:
        from app.core.storage import _UPLOAD_DIR
        path = _UPLOAD_DIR if os.path.isdir(_UPLOAD_DIR) else os.getcwd()
        total, used, free = shutil.disk_usage(path)
        percent_used = round(used / total * 100, 1) if total else 0.0
        if percent_used >= 90:
            status = "critical"
        elif percent_used >= 80:
            status = "low"
        else:
            status = "ok"
        return {
            "status": status,
            "path": path,
            "percent_used": percent_used,
            "free_gb": round(free / (1024 ** 3), 2),
            "total_gb": round(total / (1024 ** 3), 2),
        }
    except Exception as exc:
        logger.warning("Deep health check: disk space check failed: %s", exc)
        return {"status": "unknown", "detail": str(exc)}


def _check_db_pool() -> dict:
    """SQLAlchemy connection pool occupancy — helps distinguish "DB is down"
    from "DB is fine but our own pool is exhausted" (see
    docs/reports/LOAD_TEST_CAMPAIGN_2026-08-07.md for why this distinction
    matters: the pool has been a real, measured bottleneck under load).
    """
    try:
        from app.core.database import engine
        pool = engine.pool
        return {
            "status": "ok",
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
            "size": pool.size(),
        }
    except Exception as exc:
        logger.warning("Deep health check: DB pool check failed: %s", exc)
        return {"status": "unknown", "detail": str(exc)}


def _check_alembic_revision() -> dict:
    """Compares the DB's current Alembic revision against the head revision
    declared in this codebase's migration scripts — surfaces "DB schema is
    behind the code that's running" (a real incident class: a bad deploy
    that skips migrations, or a rollback that forgets to also roll back the
    schema) rather than only checking that Alembic ran without erroring.
    """
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from sqlalchemy import text as _text
        from app.core.database import engine

        backend_dir = os.path.dirname(os.path.dirname(__file__))
        alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
        alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
        script = ScriptDirectory.from_config(alembic_cfg)
        head_revision = script.get_current_head()

        with engine.connect() as conn:
            result = conn.execute(_text(
                "SELECT version_num FROM alembic_version LIMIT 1"
            )).first()
            db_revision = result[0] if result else None

        if db_revision is None:
            return {"status": "unknown", "detail": "No alembic_version row found"}
        return {
            "status": "up_to_date" if db_revision == head_revision else "outdated",
            "db_revision": db_revision,
            "head_revision": head_revision,
        }
    except Exception as exc:
        logger.warning("Deep health check: alembic revision check failed: %s", exc)
        return {"status": "unknown", "detail": str(exc)}


def _cors_headers_for(request: Request) -> dict:
    """Lightweight CORS header generator for error responses in main.py.

    Reuses the allowed origins stored on app.state by the CORS middleware setup.
    """
    origin = request.headers.get("origin", "")
    if not origin:
        return {}
    allowed = getattr(request.app.state, "_cors_allowed_origins", [])
    if "*" in allowed or origin in allowed:
        return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
    return {}

@app.get("/metrics/", include_in_schema=False)
async def prometheus_metrics(request: Request):
    """Prometheus metrics — protected by METRICS_SECRET env var in production.

    In production (DEBUG=false), requires a METRICS_SECRET to be configured
    and passed as a query parameter or Authorization header.
    This prevents information leakage about endpoint patterns, error rates,
    and active connections to unauthenticated observers.
    """
    # In debug mode, allow unrestricted access for local development
    if settings.DEBUG:
        return await metrics_endpoint(request)

    # In production, require METRICS_SECRET
    metrics_secret = os.getenv("METRICS_SECRET", "")
    if not metrics_secret:
        # If no secret configured, deny access rather than allowing open access
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=403,
            content={"detail": "Metrics endpoint disabled. Set METRICS_SECRET env var."},
            headers=_cors_headers_for(request) if hasattr(request.app.state, '_cors_allowed_origins') else {},
        )

    # Accept secret via query param (?secret=...) or Authorization header
    import hmac as _hmac
    query_secret = request.query_params.get("secret", "")
    auth_header = request.headers.get("Authorization", "")
    bearer_secret = auth_header.split(" ", 1)[1] if auth_header.startswith("Bearer ") else ""

    if not (_hmac.compare_digest(query_secret, metrics_secret) or
            _hmac.compare_digest(bearer_secret, metrics_secret)):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid or missing metrics secret"},
            headers=_cors_headers_for(request) if hasattr(request.app.state, '_cors_allowed_origins') else {},
        )

    return await metrics_endpoint(request)

@app.get("/health/deep", tags=["Health"], summary="Protected deep diagnostic probe", include_in_schema=False)
async def deep_health_check(request: Request):
    """Extended diagnostics beyond /health/ready — disk space, DB connection
    pool occupancy, Alembic schema drift. Not meant for uptime monitors or
    load balancers (those should keep using /health/ready); meant for an
    operator debugging "something's off" without SSHing into the box.

    PHASE 3 (issue #19, PR1): protected the same way as /metrics/ — a
    shared secret via query param or Authorization header, open in DEBUG
    mode. This is diagnostic detail (pool occupancy, disk paths, schema
    revision hashes) that shouldn't be exposed to unauthenticated callers
    the way the coarse healthy/unhealthy status on /health/ready is.
    """
    if not settings.DEBUG:
        health_deep_secret = os.getenv("HEALTH_DEEP_SECRET", "")
        if not health_deep_secret:
            return JSONResponse(
                status_code=403,
                content={"detail": "Deep health endpoint disabled. Set HEALTH_DEEP_SECRET env var."},
                headers=_cors_headers_for(request) if hasattr(request.app.state, '_cors_allowed_origins') else {},
            )

        import hmac as _hmac
        query_secret = request.query_params.get("secret", "")
        auth_header = request.headers.get("Authorization", "")
        bearer_secret = auth_header.split(" ", 1)[1] if auth_header.startswith("Bearer ") else ""

        if not (_hmac.compare_digest(query_secret, health_deep_secret) or
                _hmac.compare_digest(bearer_secret, health_deep_secret)):
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing health-deep secret"},
                headers=_cors_headers_for(request) if hasattr(request.app.state, '_cors_allowed_origins') else {},
            )

    db_status, rls_status = await asyncio.to_thread(_check_database_and_rls)
    redis_status = await _check_cache_readiness()
    storage_status = await _check_storage_readiness()
    disk = await asyncio.to_thread(_check_disk_space)
    db_pool = await asyncio.to_thread(_check_db_pool)
    alembic_status = await asyncio.to_thread(_check_alembic_revision) if not settings.is_sqlite else {"status": "skipped", "detail": "SQLite (dev) — alembic_version check is PostgreSQL-only"}

    return JSONResponse(
        status_code=200,
        headers={"Cache-Control": "no-store"},
        content={
            "version": settings.APP_VERSION,
            "environment": settings.SENTRY_ENVIRONMENT,
            "components": {
                "database": db_status,
                "rls": rls_status,
                "cache": redis_status,
                "storage": storage_status,
            },
            "disk": disk,
            "db_pool": db_pool,
            "alembic": alembic_status,
        },
    )


app.include_router(api_router, prefix=settings.API_V1_STR)

# ─── Serve locally uploaded files ──────────────────────────────────────────
# SECURITY: Custom StaticFiles subclass to enforce Content-Disposition
# on non-image uploads, preventing inline execution of uploaded scripts.
import posixpath
from starlette.staticfiles import StaticFiles as _BaseStaticFiles

class _SafeStaticFiles(_BaseStaticFiles):
    """StaticFiles subclass that adds Content-Disposition: attachment
    for non-image file types to prevent XSS via uploaded HTML/SVG files."""

    # SECURITY: SVG removed from inline extensions — SVG can contain JavaScript
    # for XSS. All SVGs are served with Content-Disposition: attachment.
    _INLINE_EXTENSIONS = frozenset({
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".ico",
        ".woff", ".woff2", ".ttf", ".otf", ".eot",
    })

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        _, ext = posixpath.splitext(path)
        # Wrap send to inject Content-Disposition for non-image files
        original_send = send
        async def _send_with_disposition(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                # Add Content-Disposition for non-inline file types
                if ext.lower() not in self._INLINE_EXTENSIONS:
                    # Extract filename from path for proper Content-Disposition
                    filename = posixpath.basename(path) or "download"
                    # Sanitize filename to prevent header injection
                    safe_name = filename.replace('"', '').replace('\\', '')
                    header_val = f'attachment; filename="{safe_name}"'
                    headers.append((b"content-disposition", header_val.encode()))
                message["headers"] = headers
            await original_send(message)
        await super().__call__(scope, receive, _send_with_disposition)

try:
    from app.core.storage import _UPLOAD_DIR as _upload_dir
except Exception:
    _upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(_upload_dir, exist_ok=True)
app.mount("/uploads", _SafeStaticFiles(directory=_upload_dir), name="uploads")



# _ensure_operational_tables() has been extracted to app.core.operational_tables
# for maintainability. See: app/core/operational_tables.py
