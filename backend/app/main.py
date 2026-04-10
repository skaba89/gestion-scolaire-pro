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

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
    headers_enabled=True,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──
    logger.info("SchoolFlow Pro API starting up...")

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
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Base.metadata.create_all succeeded")
        except Exception as create_err:
            logger.error(f"Table creation also failed: {create_err}")

    # Ensure operational tables that have NO SQLAlchemy models
    try:
        _ensure_operational_tables(engine)
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
                    db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN DEFAULT FALSE"))
                    db.commit()
                except Exception:
                    db.rollback()

            admin_email = settings.ADMIN_DEFAULT_EMAIL or "admin@schoolflow.local"
            admin_password = settings.ADMIN_DEFAULT_PASSWORD

            existing = db.query(User).filter(User.email == admin_email).first()
            if not existing:
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
                logger.info("Auto-created super admin: admin@schoolflow.local")
            else:
                if not existing.password_hash:
                    existing.password_hash = get_password_hash(admin_password)
                    existing.is_active = True
                    existing.is_superuser = True
                    db.commit()
                    logger.info("Fixed super admin: reset NULL password_hash")
                else:
                    logger.info("Super admin already exists, skipping creation")
        finally:
            db.close()
    except Exception as admin_err:
        logger.warning(f"Super admin auto-creation skipped: {admin_err}")

    logger.info(
        "SchoolFlow Pro API started",
        extra={"debug": settings.DEBUG, "log_level": settings.LOG_LEVEL},
    )

    yield  # App is running

    # ── SHUTDOWN ──
    logger.info("SchoolFlow Pro API shutting down...")
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
    logger.info("SchoolFlow Pro API shutdown complete")


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    description="""
## SchoolFlow Pro — School Management System API

A comprehensive REST API for managing schools, students, teachers, grades,
attendance, messaging, admissions and more.

### Authentication
All protected endpoints require a valid native JWT Bearer token except public endpoints.

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

app.add_exception_handler(SchoolFlowException, schoolflow_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(Exception, unhandled_exception_handler)  # type: ignore[arg-type]

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── CORS Middleware (MUST be first / outermost) ──────────────────────────
# In Starlette, the first middleware added is the outermost — it processes
# every request before any other middleware can interfere.  CORS *must*
# handle OPTIONS preflight requests at the outermost layer.
origins = ["http://localhost:3000", "http://localhost:5173", "http://localhost:3002"]  # Dev defaults
if settings.BACKEND_CORS_ORIGINS:
    if isinstance(settings.BACKEND_CORS_ORIGINS, str):
        origins = [o.strip() for o in settings.BACKEND_CORS_ORIGINS.split(",") if o.strip()]
    else:
        origins = [str(o) for o in settings.BACKEND_CORS_ORIGINS]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
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
app.add_middleware(TenantMiddleware)
app.add_middleware(QuotaMiddleware)


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
                options={"verify_exp": False},  # Don't check expiry here (done by endpoint deps)
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
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response

@app.get("/", include_in_schema=False)
def root():
    return {"message": "SchoolFlow Pro API", "version": settings.APP_VERSION, "docs": "/docs"}

@app.get("/health/", tags=["health"], summary="Health check")
def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}

@app.get("/metrics/", include_in_schema=False)
async def prometheus_metrics(request: Request):
    return await metrics_endpoint(request)

app.include_router(api_router, prefix=settings.API_V1_STR)

# ─── Serve locally uploaded files ──────────────────────────────────────────
_upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(_upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_upload_dir), name="uploads")


def _ensure_operational_tables(engine):
    """Create all operational tables that have no SQLAlchemy models via raw SQL.

    These tables are referenced by SQL endpoints but are not covered by
    ``Base.metadata.create_all()`` because no ORM model exists for them.
    Uses CREATE TABLE IF NOT EXISTS so it is safe to run on every startup.
    """
    from sqlalchemy import text

    _DDL = [
        # ── Library ──────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS library_categories (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            color VARCHAR(50),
            description VARCHAR(500),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_library_categories_tenant_id
            ON library_categories(tenant_id)""",

        """CREATE TABLE IF NOT EXISTS library_resources (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            category_id UUID REFERENCES library_categories(id) ON DELETE SET NULL,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            author VARCHAR(255),
            resource_type VARCHAR(100),
            uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_library_resources_tenant_id
            ON library_resources(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_library_resources_category_id
            ON library_resources(category_id)""",

        # ── Inventory ────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS inventory_categories (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description VARCHAR(500),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_inventory_categories_tenant_id
            ON inventory_categories(tenant_id)""",

        """CREATE TABLE IF NOT EXISTS inventory_items (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            category_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL,
            name VARCHAR(255) NOT NULL,
            unit_price FLOAT NOT NULL DEFAULT 0,
            stock_quantity INTEGER NOT NULL DEFAULT 0,
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_inventory_items_tenant_id
            ON inventory_items(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_inventory_items_category_id
            ON inventory_items(category_id)""",

        """CREATE TABLE IF NOT EXISTS inventory_transactions (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
            type VARCHAR(50) NOT NULL,
            quantity INTEGER NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        """CREATE INDEX IF NOT EXISTS ix_inventory_transactions_tenant_id
            ON inventory_transactions(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_inventory_transactions_item_id
            ON inventory_transactions(item_id)""",

        """CREATE TABLE IF NOT EXISTS orders (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            student_id UUID REFERENCES students(id) ON DELETE SET NULL,
            total_amount FLOAT NOT NULL,
            payment_method VARCHAR(100) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_orders_tenant_id ON orders(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_orders_student_id ON orders(student_id)""",

        """CREATE TABLE IF NOT EXISTS order_items (
            id UUID PRIMARY KEY,
            order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
            item_name VARCHAR(255),
            quantity INTEGER NOT NULL,
            unit_price FLOAT NOT NULL,
            total_price FLOAT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        """CREATE INDEX IF NOT EXISTS ix_order_items_order_id ON order_items(order_id)""",

        # ── Clubs ────────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS clubs (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            advisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
            max_members INTEGER,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_clubs_tenant_id ON clubs(tenant_id)""",

        """CREATE TABLE IF NOT EXISTS club_memberships (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            role VARCHAR(50),
            joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_club_memberships_tenant_id
            ON club_memberships(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_club_memberships_student_id
            ON club_memberships(student_id)""",
        """CREATE INDEX IF NOT EXISTS ix_club_memberships_club_id
            ON club_memberships(club_id)""",

        # ── Surveys ──────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS surveys (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            target_audience VARCHAR(100) DEFAULT 'ALL',
            is_anonymous BOOLEAN DEFAULT false,
            is_active BOOLEAN DEFAULT true,
            starts_at TIMESTAMPTZ,
            ends_at TIMESTAMPTZ,
            created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_surveys_tenant_id ON surveys(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_surveys_created_by ON surveys(created_by)""",

        """CREATE TABLE IF NOT EXISTS survey_questions (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            question_text TEXT NOT NULL,
            question_type VARCHAR(50) NOT NULL,
            options JSONB,
            order_index INTEGER NOT NULL DEFAULT 0,
            is_required BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_survey_questions_tenant_id
            ON survey_questions(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_survey_questions_survey_id
            ON survey_questions(survey_id)""",

        """CREATE TABLE IF NOT EXISTS survey_responses (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            respondent_id UUID,
            response_data JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        """CREATE INDEX IF NOT EXISTS ix_survey_responses_tenant_id
            ON survey_responses(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_survey_responses_survey_id
            ON survey_responses(survey_id)""",

        # ── Announcements ────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS announcements (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(500) NOT NULL,
            content TEXT NOT NULL,
            target_roles JSONB,
            pinned BOOLEAN DEFAULT false,
            published_at TIMESTAMPTZ,
            deleted_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_announcements_tenant_id
            ON announcements(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_announcements_author_id
            ON announcements(author_id)""",

        # ── Conversations & Messaging ────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS conversations (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            type VARCHAR(50) NOT NULL DEFAULT 'DIRECT',
            title VARCHAR(255),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_conversations_tenant_id
            ON conversations(tenant_id)""",

        """CREATE TABLE IF NOT EXISTS conversation_participants (
            id UUID PRIMARY KEY,
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            last_read_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        """CREATE INDEX IF NOT EXISTS ix_conversation_participants_conversation_id
            ON conversation_participants(conversation_id)""",
        """CREATE INDEX IF NOT EXISTS ix_conversation_participants_user_id
            ON conversation_participants(user_id)""",

        """CREATE TABLE IF NOT EXISTS messages (
            id UUID PRIMARY KEY,
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
            content TEXT NOT NULL,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        """CREATE INDEX IF NOT EXISTS ix_messages_conversation_id
            ON messages(conversation_id)""",
        """CREATE INDEX IF NOT EXISTS ix_messages_tenant_id ON messages(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_messages_sender_id ON messages(sender_id)""",
        """CREATE INDEX IF NOT EXISTS ix_messages_created_at ON messages(created_at)""",

        """CREATE TABLE IF NOT EXISTS user_message_status (
            id UUID PRIMARY KEY,
            message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            is_read BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        """CREATE INDEX IF NOT EXISTS ix_user_message_status_message_id
            ON user_message_status(message_id)""",
        """CREATE INDEX IF NOT EXISTS ix_user_message_status_user_id
            ON user_message_status(user_id)""",

        # ── Forums ───────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS student_forums (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            category VARCHAR(100),
            is_active BOOLEAN DEFAULT true,
            created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_student_forums_tenant_id
            ON student_forums(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_student_forums_created_by
            ON student_forums(created_by)""",

        """CREATE TABLE IF NOT EXISTS forum_posts (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            forum_id UUID NOT NULL REFERENCES student_forums(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            author_id UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_forum_posts_tenant_id ON forum_posts(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_forum_posts_forum_id ON forum_posts(forum_id)""",

        # ── School Life ──────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS student_badges (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            badge_type VARCHAR(100) NOT NULL,
            badge_name VARCHAR(255) NOT NULL,
            description TEXT,
            status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
            issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_student_badges_tenant_id
            ON student_badges(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_student_badges_student_id
            ON student_badges(student_id)""",

        """CREATE TABLE IF NOT EXISTS career_event_registrations (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            event_id UUID NOT NULL REFERENCES career_events(id) ON DELETE CASCADE,
            student_id UUID,
            alumni_id UUID,
            registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        """CREATE INDEX IF NOT EXISTS ix_career_event_registrations_tenant_id
            ON career_event_registrations(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_career_event_registrations_event_id
            ON career_event_registrations(event_id)""",

        # ── Alumni ───────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS alumni_document_requests (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            alumni_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            document_type VARCHAR(100) NOT NULL,
            document_description TEXT,
            purpose VARCHAR(500) NOT NULL,
            urgency VARCHAR(50) NOT NULL DEFAULT 'normal',
            delivery_method VARCHAR(50) NOT NULL DEFAULT 'email',
            delivery_address VARCHAR(500),
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            validation_notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_alumni_document_requests_tenant_id
            ON alumni_document_requests(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_alumni_document_requests_alumni_id
            ON alumni_document_requests(alumni_id)""",

        """CREATE TABLE IF NOT EXISTS alumni_request_history (
            id UUID PRIMARY KEY,
            request_id UUID NOT NULL REFERENCES alumni_document_requests(id) ON DELETE CASCADE,
            action VARCHAR(100) NOT NULL,
            new_status VARCHAR(50),
            performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        """CREATE INDEX IF NOT EXISTS ix_alumni_request_history_request_id
            ON alumni_request_history(request_id)""",

        """CREATE TABLE IF NOT EXISTS job_offers (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            title VARCHAR(500) NOT NULL,
            company_name VARCHAR(255) NOT NULL,
            offer_type VARCHAR(100),
            description TEXT,
            location VARCHAR(255),
            is_remote BOOLEAN DEFAULT false,
            application_deadline TIMESTAMPTZ,
            contact_email VARCHAR(255),
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_job_offers_tenant_id ON job_offers(tenant_id)""",

        """CREATE TABLE IF NOT EXISTS alumni_mentors (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            first_name VARCHAR(255) NOT NULL,
            last_name VARCHAR(255) NOT NULL,
            current_position VARCHAR(255),
            current_company VARCHAR(255),
            bio TEXT,
            expertise_areas JSONB,
            linkedin_url VARCHAR(500),
            is_available BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_alumni_mentors_tenant_id
            ON alumni_mentors(tenant_id)""",

        """CREATE TABLE IF NOT EXISTS career_events (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            event_type VARCHAR(100),
            start_datetime TIMESTAMPTZ NOT NULL,
            end_datetime TIMESTAMPTZ,
            location VARCHAR(255),
            is_online BOOLEAN DEFAULT false,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_career_events_tenant_id
            ON career_events(tenant_id)""",

        """CREATE TABLE IF NOT EXISTS mentorship_requests (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            student_id UUID REFERENCES students(id) ON DELETE SET NULL,
            mentor_id UUID REFERENCES alumni_mentors(id) ON DELETE SET NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            message TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_mentorship_requests_tenant_id
            ON mentorship_requests(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_mentorship_requests_student_id
            ON mentorship_requests(student_id)""",
        """CREATE INDEX IF NOT EXISTS ix_mentorship_requests_mentor_id
            ON mentorship_requests(mentor_id)""",

        """CREATE TABLE IF NOT EXISTS job_applications (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            student_id UUID REFERENCES students(id) ON DELETE SET NULL,
            job_offer_id UUID NOT NULL REFERENCES job_offers(id) ON DELETE CASCADE,
            cover_letter TEXT,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_job_applications_tenant_id
            ON job_applications(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_job_applications_student_id
            ON job_applications(student_id)""",
        """CREATE INDEX IF NOT EXISTS ix_job_applications_job_offer_id
            ON job_applications(job_offer_id)""",

        # ── Finance ──────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS fees (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            amount FLOAT NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_fees_tenant_id ON fees(tenant_id)""",

        # ── School Settings ──────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS school_settings (
            id UUID PRIMARY KEY,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            settings JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_school_settings_tenant_id
            ON school_settings(tenant_id)""",

        # ── Invoices ──────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS invoices (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            student_id UUID REFERENCES students(id) ON DELETE SET NULL,
            invoice_number VARCHAR(100),
            subtotal FLOAT NOT NULL DEFAULT 0,
            tax_amount FLOAT NOT NULL DEFAULT 0,
            discount_amount FLOAT NOT NULL DEFAULT 0,
            total_amount FLOAT NOT NULL DEFAULT 0,
            paid_amount FLOAT NOT NULL DEFAULT 0,
            currency VARCHAR(10) NOT NULL DEFAULT 'GNF',
            status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            due_date DATE,
            issue_date DATE,
            description VARCHAR(500),
            items JSONB,
            notes TEXT,
            has_payment_plan BOOLEAN DEFAULT FALSE,
            installments_count INTEGER DEFAULT 1,
            pdf_url VARCHAR(500),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_invoices_tenant_id ON invoices(tenant_id)""",
        # ── Invoices: add missing columns for existing databases ──────────────
        """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal FLOAT NOT NULL DEFAULT 0""",
        """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount FLOAT NOT NULL DEFAULT 0""",
        """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount FLOAT NOT NULL DEFAULT 0""",
        """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GNF'""",
        """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description VARCHAR(500)""",
        """ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url VARCHAR(500)""",

        # ── Payment Schedules ──────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS payment_schedules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
            installment_number INTEGER NOT NULL,
            amount FLOAT NOT NULL DEFAULT 0,
            due_date DATE NOT NULL,
            paid_date TIMESTAMPTZ,
            status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_payment_schedules_tenant_id ON payment_schedules(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_payment_schedules_invoice_id ON payment_schedules(invoice_id)""",

        # ── Teacher Assignments ───────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS teacher_assignments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
            classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
            academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_teacher_assignments_tenant_id ON teacher_assignments(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_teacher_assignments_user_id ON teacher_assignments(user_id)""",

        # ── Homework ──────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS homework (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
            subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
            classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            due_date DATE,
            status VARCHAR(50) DEFAULT 'ACTIVE',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_homework_tenant_id ON homework(tenant_id)""",

        # ── Exams ─────────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS exams (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
            classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
            academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
            exam_date DATE,
            max_score FLOAT DEFAULT 20,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_exams_tenant_id ON exams(tenant_id)""",

        # ── Incidents ─────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS incidents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            student_id UUID REFERENCES students(id) ON DELETE SET NULL,
            reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
            incident_type VARCHAR(100),
            description TEXT,
            severity VARCHAR(50) DEFAULT 'LOW',
            status VARCHAR(50) DEFAULT 'OPEN',
            incident_date DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_incidents_tenant_id ON incidents(tenant_id)""",

        # ── Audit Logs — add missing columns (severity, user_agent) ──────────
        """ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'INFO'""",
        """CREATE INDEX IF NOT EXISTS ix_audit_logs_severity ON audit_logs(severity)""",
        """ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT""",

        # ── Student Risk Scores ───────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS student_risk_scores (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            student_id UUID REFERENCES students(id) ON DELETE CASCADE,
            risk_level VARCHAR(50) DEFAULT 'LOW',
            risk_score FLOAT DEFAULT 0,
            factors JSONB,
            calculated_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_student_risk_scores_tenant_id ON student_risk_scores(tenant_id)""",

        # ── Appointment Slots ──────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS appointment_slots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
            date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            max_appointments INTEGER DEFAULT 1,
            location VARCHAR(255),
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_appointment_slots_tenant_id ON appointment_slots(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_appointment_slots_teacher_id ON appointment_slots(teacher_id)""",

        # ── Appointments (Parent-Teacher) ──────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS appointments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            parent_id UUID REFERENCES users(id) ON DELETE CASCADE,
            teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
            student_id UUID REFERENCES students(id) ON DELETE CASCADE,
            appointment_date DATE NOT NULL,
            appointment_time TIME,
            slot_id UUID REFERENCES appointment_slots(id) ON DELETE SET NULL,
            notes TEXT,
            status VARCHAR(50) DEFAULT 'REQUESTED',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_appointments_tenant_id ON appointments(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_appointments_parent_id ON appointments(parent_id)""",

        # ── Check-In Sessions ──────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS check_in_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
            classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
            session_date DATE NOT NULL DEFAULT CURRENT_DATE,
            status VARCHAR(50) DEFAULT 'ACTIVE',
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_check_in_sessions_tenant_id ON check_in_sessions(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_check_in_sessions_teacher_id ON check_in_sessions(teacher_id)""",

        # ── Check-In Assignments ───────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS check_in_assignments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            student_id UUID REFERENCES students(id) ON DELETE SET NULL,
            session_id UUID REFERENCES check_in_sessions(id) ON DELETE CASCADE,
            status VARCHAR(50) DEFAULT 'PENDING',
            mood VARCHAR(50),
            notes TEXT,
            checked_in_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )""",
        """CREATE INDEX IF NOT EXISTS ix_check_in_assignments_tenant_id ON check_in_assignments(tenant_id)""",
        """CREATE INDEX IF NOT EXISTS ix_check_in_assignments_session_id ON check_in_assignments(session_id)""",

        # ── Tenant-scoped unique constraints ──────────────────────────────────
        """DO $$ BEGIN
            ALTER TABLE subjects ADD CONSTRAINT uq_subjects_tenant_name UNIQUE (tenant_id, name);
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$""",
        """DO $$ BEGIN
            ALTER TABLE departments ADD CONSTRAINT uq_departments_tenant_name UNIQUE (tenant_id, name);
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$""",
        """DO $$ BEGIN
            ALTER TABLE levels ADD CONSTRAINT uq_levels_tenant_name UNIQUE (tenant_id, name);
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$""",
    ]

    with engine.connect() as conn:
        for stmt in _DDL:
            try:
                conn.execute(text(stmt))
            except Exception as exc:
                logger.debug("Operational table DDL skipped: %s (%s)", stmt[:80], exc)
        conn.commit()



