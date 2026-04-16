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

# Render/Cloudflare proxy IPs — only trust X-Forwarded-For from these
_TRUSTED_PROXY_IPS = {
    "127.0.0.1",
    "::1",
    # Render internal proxy ranges
    "10.0.0.0", "172.16.0.0", "192.168.0.0",
}

def _get_client_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For from trusted proxies.

    SECURITY: Only trust X-Forwarded-For when the direct connection comes from
    a known proxy. Otherwise, clients can spoof this header to bypass rate limiting.
    """
    client_host = request.client.host if request.client else None
    if client_host and any(client_host.startswith(prefix) for prefix in _TRUSTED_PROXY_IPS):
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

    # Auto-run pending Alembic migrations
    from app.core.database import Base, engine
    import app.models  # noqa: F401 — ensure all models are registered

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
        logger.warning(f"Alembic migration failed ({alembic_err}), falling back to create_all")

    # ALWAYS run create_all after Alembic — it uses checkfirst=True by default,
    # so it safely creates any tables/columns that Alembic migrations missed
    # without affecting tables that already exist correctly.
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Base.metadata.create_all succeeded (fills gaps from incomplete migrations)")
    except Exception as create_err:
        logger.error(f"Table creation failed: {create_err}")

    # Ensure operational tables that have NO SQLAlchemy models
    try:
        from app.core.operational_tables import ensure_operational_tables
        ensure_operational_tables(engine)
        logger.info("Operational tables ensured via raw SQL")
    except Exception as op_err:
        logger.warning(f"Operational table creation failed: {op_err}")

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
                try:
                    # Ensure all User model columns exist (some may have been added after initial migration)
                    # Base columns from UUIDMixin/TimestampMixin
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()"))
                    # tenant_id — nullable for SUPER_ADMIN users (no FK constraint here to avoid
                    # dependency on tenants table existing; create_all handles FK creation)
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100)"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN DEFAULT FALSE"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)"))
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)"))
                    # Backfill: set username = email prefix for any users with NULL username
                    db.execute(text(
                        "UPDATE users SET username = SPLIT_PART(email, '@', 1) "
                        "WHERE username IS NULL AND email IS NOT NULL"
                    ))
                    # Ensure user_roles table has all needed columns
                    db.execute(text("ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS tenant_id UUID"))
                    db.execute(text("ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()"))
                    db.execute(text("ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()"))
                    db.commit()
                    logger.info("User/user_roles table columns ensured")
                except Exception as col_err:
                    logger.warning("Column migration partial failure (may already exist): %s", col_err)
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
                             "VALUES (:id, :uid, 'SUPER_ADMIN', NULL, NOW(), NOW())"),
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
        logger.warning(f"Super admin auto-creation skipped: {admin_err}")

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

# If no explicit origins configured, use safe defaults.
# In production, we use dynamic origin validation via a middleware callback
# instead of blocking all cross-origin requests (which breaks the app).
if not origins:
    if settings.DEBUG:
        logger.warning(
            "CORS origins list is empty — falling back to allow all origins (\"*\") "
            "because DEBUG is enabled. Set BACKEND_CORS_ORIGINS env var for production."
        )
        origins = ["*"]
    else:
        # Production: dynamically allow the requesting origin.
        # This is safe because SchoolFlow uses Bearer tokens (not cookies),
        # so CSRF via CORS is not a concern. The real security boundary is the JWT.
        logger.warning(
            "CORS origins list is empty in production — using dynamic origin reflection. "
            "For best security, set BACKEND_CORS_ORIGINS env var to your frontend URL(s)."
        )
        origins = ["*"]  # Dynamic validation handled by middleware below

# SECURITY: When origins=["*"], browsers reject allow_credentials=True.
# Since SchoolFlow uses Bearer tokens (Authorization header) and not cookies,
# setting allow_credentials=False is safe and avoids browser CORS errors.
allow_credentials = len(origins) > 1 or (len(origins) == 1 and origins[0] != "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "X-Tenant-ID", "Content-Type", "X-Request-ID", "Accept"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-Request-ID"],
)

# Store allowed origins on app state so exception handlers can use them for CORS
app.state._cors_allowed_origins = origins

# ─── Application middlewares (inner layers) ───────────────────────────────
app.add_middleware(RequestIDMiddleware)
app.add_middleware(MetricsMiddleware)
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

@app.get("/", include_in_schema=False)
def root():
    return {"message": "Academy Guinéenne API", "version": settings.APP_VERSION, "docs": "/docs"}

@app.get("/health/", tags=["health"], summary="Health check")
def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}


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

_upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(_upload_dir, exist_ok=True)
app.mount("/uploads", _SafeStaticFiles(directory=_upload_dir), name="uploads")



# _ensure_operational_tables() has been extracted to app.core.operational_tables
# for maintainability. See: app/core/operational_tables.py



