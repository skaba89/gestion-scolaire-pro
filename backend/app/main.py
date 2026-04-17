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

def _ensure_all_table_columns(db, text):
    """Add ALL missing columns to ALL tables via PL/pgSQL DO blocks.

    Uses DO $$ BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END $$ per table
    so that if a table doesn't exist, the error is caught internally by
    PostgreSQL WITHOUT aborting the surrounding transaction.
    """
    # Each table's columns are wrapped in a DO block with EXCEPTION handler.
    # If the table doesn't exist, PostgreSQL catches the error internally
    # and the transaction continues cleanly.
    table_migrations = {
        "tenants": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "name VARCHAR(255)",
            "slug VARCHAR(100)",
            "type VARCHAR(50)",
            "country VARCHAR(2) DEFAULT 'GN'",
            "currency VARCHAR(3) DEFAULT 'GNF'",
            "timezone VARCHAR(50) DEFAULT 'Africa/Conakry'",
            "email VARCHAR(255)",
            "phone VARCHAR(50)",
            "address VARCHAR(500)",
            "website VARCHAR(255)",
            "is_active BOOLEAN DEFAULT TRUE",
            "settings JSON",
            "director_name VARCHAR(255)",
            "director_signature_url VARCHAR(500)",
            "secretary_name VARCHAR(255)",
            "secretary_signature_url VARCHAR(500)",
            "city VARCHAR(255)",
        ],
        "users": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "email VARCHAR(255)",
            "username VARCHAR(100)",
            "password_hash VARCHAR(255)",
            "first_name VARCHAR(100)",
            "last_name VARCHAR(100)",
            "phone VARCHAR(20)",
            "avatar_url VARCHAR(500)",
            "is_active BOOLEAN DEFAULT TRUE",
            "is_superuser BOOLEAN DEFAULT FALSE",
            "is_verified BOOLEAN DEFAULT FALSE",
            "mfa_enabled BOOLEAN DEFAULT FALSE",
            "must_change_password BOOLEAN DEFAULT FALSE",
        ],
        "user_roles": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "user_id UUID",
            "role VARCHAR(50)",
        ],
        "profiles": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "phone VARCHAR(50)",
            "avatar_url VARCHAR(500)",
        ],
        "students": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "registration_number VARCHAR(50)",
            "first_name VARCHAR(100)",
            "last_name VARCHAR(100)",
            "date_of_birth DATE",
            "gender VARCHAR(20)",
            "email VARCHAR(255)",
            "phone VARCHAR(20)",
            "address VARCHAR(500)",
            "city VARCHAR(100)",
            "level VARCHAR(50)",
            "class_name VARCHAR(100)",
            "academic_year VARCHAR(20)",
            "status VARCHAR(20) DEFAULT 'ACTIVE'",
            "photo_url VARCHAR(500)",
            "parent_name VARCHAR(200)",
            "parent_phone VARCHAR(20)",
            "parent_email VARCHAR(255)",
        ],
        "academic_years": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "name VARCHAR(255)",
            "code VARCHAR(50)",
            "start_date DATE",
            "end_date DATE",
            "is_current BOOLEAN DEFAULT FALSE",
        ],
        "terms": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "academic_year_id UUID",
            "name VARCHAR(255)",
            "start_date DATE",
            "end_date DATE",
            "sequence_number INTEGER DEFAULT 1",
            "is_active BOOLEAN DEFAULT FALSE",
        ],
        "audit_logs": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "user_id VARCHAR(255)",
            "action VARCHAR(50)",
            "severity VARCHAR(20) DEFAULT 'INFO'",
            "resource_type VARCHAR(50)",
            "resource_id VARCHAR(255)",
            "details JSON",
            "ip_address VARCHAR(45)",
            "user_agent TEXT",
        ],
        "grades": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "student_id UUID",
            "assessment_id UUID",
            "subject_id UUID",
            "academic_year_id UUID",
            "score FLOAT",
            "max_score FLOAT DEFAULT 20.0",
            "coefficient FLOAT DEFAULT 1.0",
            "comments VARCHAR(500)",
        ],
        "invoices": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "student_id UUID",
            "invoice_number VARCHAR(50)",
            "issue_date DATE",
            "due_date DATE",
            "subtotal FLOAT",
            "tax_amount FLOAT DEFAULT 0.0",
            "discount_amount FLOAT DEFAULT 0.0",
            "total_amount FLOAT",
            "paid_amount FLOAT DEFAULT 0.0",
            "currency VARCHAR(3) DEFAULT 'GNF'",
            "status VARCHAR(20) DEFAULT 'DRAFT'",
            "description VARCHAR(500)",
            "notes VARCHAR(500)",
            "items JSON",
            "has_payment_plan BOOLEAN DEFAULT FALSE",
            "installments_count INTEGER DEFAULT 1",
            "pdf_url VARCHAR(500)",
        ],
        "payments": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "student_id UUID",
            "invoice_id UUID",
            "amount FLOAT",
            "currency VARCHAR(3) DEFAULT 'GNF'",
            "payment_date DATE",
            "payment_method VARCHAR(20)",
            "status VARCHAR(20) DEFAULT 'PENDING'",
            "reference VARCHAR(100)",
            "transaction_id VARCHAR(255)",
            "notes VARCHAR(500)",
            "receipt_url VARCHAR(500)",
        ],
        "departments": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "name VARCHAR(255)",
            "code VARCHAR(50)",
            "description VARCHAR(500)",
            "head_id UUID",
        ],
        "subjects": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "name VARCHAR(255)",
            "code VARCHAR(50)",
            "coefficient FLOAT DEFAULT 1.0",
            "ects FLOAT DEFAULT 0",
            "cm_hours INTEGER DEFAULT 0",
            "td_hours INTEGER DEFAULT 0",
            "tp_hours INTEGER DEFAULT 0",
            "description TEXT",
        ],
        "levels": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "name VARCHAR(255)",
            "code VARCHAR(50)",
            "label VARCHAR(255)",
            "order_index INTEGER DEFAULT 0",
        ],
        "campuses": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "name VARCHAR(255)",
            "address VARCHAR(500)",
            "phone VARCHAR(50)",
            "is_main BOOLEAN DEFAULT FALSE",
        ],
        "rooms": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "name VARCHAR(255)",
            "capacity INTEGER",
            "campus_id UUID",
        ],
        "programs": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "name VARCHAR(255)",
            "code VARCHAR(50)",
            "description VARCHAR(500)",
        ],
        "classes": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "name VARCHAR(255)",
            "capacity INTEGER",
            "level_id UUID",
            "campus_id UUID",
            "program_id UUID",
            "academic_year_id UUID",
            "main_room_id UUID",
        ],
        "enrollments": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "student_id UUID",
            "class_id UUID",
            "academic_year_id UUID",
            "enrollment_date DATE",
            "status VARCHAR(50) DEFAULT 'ACTIVE'",
        ],
        "assessments": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "name VARCHAR(255)",
            "max_score FLOAT DEFAULT 20.0",
            "date TIMESTAMP",
            "assessment_type VARCHAR(50)",
            "subject_id UUID",
            "academic_year_id UUID",
            "term_id UUID",
        ],
        "attendance": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "date DATE",
            "status VARCHAR(50)",
            "reason TEXT",
            "student_id UUID",
            "subject_id UUID",
            "classroom_id UUID",
        ],
        "employees": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "employee_number VARCHAR(50)",
            "first_name VARCHAR(100)",
            "last_name VARCHAR(100)",
            "email VARCHAR(255)",
            "phone VARCHAR(50)",
            "job_title VARCHAR(100)",
            "department VARCHAR(100)",
            "hire_date DATE",
            "is_active BOOLEAN DEFAULT TRUE",
            "date_of_birth DATE",
            "place_of_birth VARCHAR(100)",
            "nationality VARCHAR(100)",
            "social_security_number VARCHAR(100)",
            "address VARCHAR(255)",
            "city VARCHAR(100)",
            "postal_code VARCHAR(20)",
            "country VARCHAR(100)",
            "bank_name VARCHAR(100)",
            "bank_iban VARCHAR(100)",
            "bank_bic VARCHAR(50)",
            "emergency_contact_name VARCHAR(100)",
            "emergency_contact_phone VARCHAR(50)",
        ],
        "employment_contracts": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "contract_number VARCHAR(50)",
            "contract_type VARCHAR(50)",
            "start_date DATE",
            "end_date DATE",
            "trial_period_end DATE",
            "job_title VARCHAR(100)",
            "gross_monthly_salary FLOAT",
            "weekly_hours FLOAT DEFAULT 35.0",
            "notes VARCHAR(1000)",
            "is_current BOOLEAN DEFAULT TRUE",
            "employee_id UUID",
        ],
        "leave_requests": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "leave_type VARCHAR(50)",
            "start_date DATE",
            "end_date DATE",
            "total_days INTEGER",
            "status VARCHAR(50) DEFAULT 'PENDING'",
            "reason TEXT",
            "reviewed_at DATE",
            "employee_id UUID",
        ],
        "payslips": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "period_month INTEGER",
            "period_year INTEGER",
            "gross_salary FLOAT",
            "net_salary FLOAT",
            "pay_date DATE",
            "is_final VARCHAR(50) DEFAULT 'false'",
            "pdf_url VARCHAR(500)",
            "employee_id UUID",
        ],
        "notifications": [
            "user_id UUID",
            "tenant_id UUID",
            "title VARCHAR(255)",
            "message TEXT",
            "type VARCHAR(50) DEFAULT 'info'",
            "link VARCHAR(255)",
            "is_read BOOLEAN DEFAULT FALSE",
            "created_at TIMESTAMPTZ DEFAULT NOW()",
            "updated_at TIMESTAMPTZ DEFAULT NOW()",
        ],
        "school_events": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "title VARCHAR(255)",
            "description TEXT",
            "start_date TIMESTAMP",
            "end_date TIMESTAMP",
            "location VARCHAR(255)",
            "is_all_day BOOLEAN DEFAULT FALSE",
            "event_type VARCHAR(50)",
        ],
        "student_check_ins": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "checked_at TIMESTAMP",
            "direction VARCHAR(20) DEFAULT 'IN'",
            "source VARCHAR(50)",
            "student_id UUID",
        ],
        "parent_students": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "parent_id UUID",
            "student_id UUID",
            "is_primary BOOLEAN DEFAULT FALSE",
            "relation_type VARCHAR(50)",
        ],
        "admission_applications": [
            "tenant_id UUID",
            "academic_year_id UUID",
            "level_id UUID",
            "student_first_name VARCHAR(100)",
            "student_last_name VARCHAR(100)",
            "student_date_of_birth TIMESTAMP",
            "student_gender VARCHAR(20)",
            "student_address VARCHAR(500)",
            "student_previous_school VARCHAR(255)",
            "parent_first_name VARCHAR(100)",
            "parent_last_name VARCHAR(100)",
            "parent_email VARCHAR(255)",
            "parent_phone VARCHAR(50)",
            "parent_address VARCHAR(500)",
            "parent_occupation VARCHAR(255)",
            "status VARCHAR(20) DEFAULT 'DRAFT'",
            "notes VARCHAR(1000)",
            "documents JSON",
            "submitted_at TIMESTAMP",
            "reviewed_at TIMESTAMP",
            "reviewed_by UUID",
            "converted_student_id UUID",
            "created_at TIMESTAMPTZ DEFAULT NOW()",
            "updated_at TIMESTAMPTZ DEFAULT NOW()",
        ],
        "tenant_security_settings": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "mfa_required BOOLEAN DEFAULT FALSE",
            "password_expiry_days INTEGER DEFAULT 90",
            "session_timeout_minutes INTEGER DEFAULT 60",
        ],
        "account_deletion_requests": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "user_id UUID",
            "reason TEXT",
            "status VARCHAR(20) DEFAULT 'PENDING'",
            "requested_at TIMESTAMP DEFAULT NOW()",
            "processed_at TIMESTAMP",
            "processed_by UUID",
            "rejection_reason TEXT",
        ],
        "rgpd_logs": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "user_id UUID",
            "action VARCHAR(255)",
            "target_user_id UUID",
            "details JSON",
            "status VARCHAR(50) DEFAULT 'SUCCESS'",
        ],
        "push_subscriptions": [
            "user_id UUID",
            "tenant_id UUID",
            "endpoint TEXT",
            "p256dh VARCHAR(255)",
            "auth VARCHAR(255)",
            "platform VARCHAR(50) DEFAULT 'web'",
            "is_active BOOLEAN DEFAULT TRUE",
            "created_at TIMESTAMPTZ DEFAULT NOW()",
            "updated_at TIMESTAMPTZ DEFAULT NOW()",
        ],
        "public_pages": [
            "created_at TIMESTAMP DEFAULT NOW()",
            "updated_at TIMESTAMP DEFAULT NOW()",
            "tenant_id UUID",
            "title VARCHAR(200)",
            "slug VARCHAR(200)",
            "page_type VARCHAR(50) DEFAULT 'CUSTOM'",
            "content JSON",
            "template VARCHAR(50) DEFAULT 'default'",
            "primary_color VARCHAR(7)",
            "secondary_color VARCHAR(7)",
            "is_published BOOLEAN DEFAULT FALSE",
            "sort_order INTEGER DEFAULT 0",
            "meta_title VARCHAR(200)",
            "meta_description TEXT",
            "show_in_nav BOOLEAN DEFAULT TRUE",
            "nav_label VARCHAR(100)",
        ],
        "schedule": [
            "tenant_id UUID",
            "class_id UUID",
            "subject_id UUID",
            "teacher_id UUID",
            "day_of_week INTEGER",
            "start_time TIME",
            "end_time TIME",
            "room_id UUID",
            "created_at TIMESTAMPTZ DEFAULT NOW()",
            "updated_at TIMESTAMPTZ DEFAULT NOW()",
        ],
    }

    for table_name, columns in table_migrations.items():
        alter_statements = "\n".join(
            f"    ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {col};"
            for col in columns
        )
        plpgsql = f"""
DO $$
BEGIN
{alter_statements}
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table {table_name} does not exist, skipping';
WHEN OTHERS THEN
    RAISE WARNING 'Column migration for {table_name} failed: %%', SQLERRM;
END $$;
"""
        db.execute(text(plpgsql))

    logger.info("_ensure_all_table_columns completed for all 30+ tables")


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

    # Ensure ALL missing columns on ALL tables (Alembic migrations may have failed partially)
    if not settings.is_sqlite:
        try:
            from app.core.database import SessionLocal
            from sqlalchemy import text
            db = SessionLocal()
            try:
                _ensure_all_table_columns(db, text)
                db.commit()
                logger.info("All table columns ensured via ALTER TABLE IF NOT EXISTS")
            except Exception as col_err:
                logger.warning("Column migration partial failure: %s", col_err)
                db.rollback()
            finally:
                db.close()
        except Exception as e:
            logger.warning("Column migration skipped: %s", e)

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
    return {"message": "Academy Guinéenne API", "version": settings.APP_VERSION, "docs": "/docs", "deploy": "v5-middleware-fix"}

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



