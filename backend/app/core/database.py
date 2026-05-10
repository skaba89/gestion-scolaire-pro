import os
from contextvars import ContextVar
from sqlalchemy import create_engine, text, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Global context for tenant_id to be used in database sessions
tenant_context: ContextVar[str] = ContextVar("tenant_id", default=None)

# ---------------------------------------------------------------------------
# Engine configuration — SQLite and PostgreSQL have different requirements.
# ---------------------------------------------------------------------------
_engine_kwargs = {
    "echo": settings.DEBUG,  # Log SQL queries in debug mode
}

if settings.is_sqlite:
    # SQLite: no connection pooling, enable WAL mode for better concurrency,
    # and support for foreign key constraints (off by default in SQLite).
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL: enable connection pooling and pre-ping checks.
    _engine_kwargs["pool_size"] = settings.DATABASE_POOL_SIZE
    _engine_kwargs["max_overflow"] = settings.DATABASE_MAX_OVERFLOW
    _engine_kwargs["pool_pre_ping"] = True

    _db_url = settings.DATABASE_URL_SYNC or ""
    _is_local_docker_db = any(
        marker in _db_url for marker in (
            "@postgres:",
            "@localhost:",
            "@127.0.0.1:",
            "sslmode=disable",
            "sslmode=prefer",
        )
    )

    # Respect explicit sslmode in URL. Previous implementation forced
    # sslmode=require whenever the URL contained the word "sslmode", which broke
    # local Docker PostgreSQL when DATABASE_URL ended with ?sslmode=disable.
    if "sslmode=require" in _db_url or "sslmode=verify-full" in _db_url or "sslmode=verify-ca" in _db_url:
        _engine_kwargs.setdefault("connect_args", {})["sslmode"] = "require"
    elif "sslmode=disable" in _db_url:
        _engine_kwargs.setdefault("connect_args", {})["sslmode"] = "disable"

    # SECURITY: Force SSL for PostgreSQL in non-DEBUG environments, except for
    # explicit local Docker/dev URLs. Local postgres image does not support SSL by
    # default and will fail with: "server does not support SSL, but SSL was required".
    if not settings.DEBUG and not settings.is_sqlite and not _is_local_docker_db:
        _engine_kwargs.setdefault("connect_args", {})["sslmode"] = "require"

# Create SQLAlchemy engine
engine = create_engine(settings.DATABASE_URL_SYNC, **_engine_kwargs)

# ---------------------------------------------------------------------------
# SQLite pragmas: enable WAL journal mode and foreign keys on every connection.
# ---------------------------------------------------------------------------
if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()


def get_db():
    """Dependency to get database session with RLS tenant_id set (PostgreSQL only).

    SECURITY: Always resets the RLS context to prevent connection pool leaks.
    Without this reset, a connection previously used for tenant A would
    retain app.current_tenant_id = A, causing tenant B's queries to be
    silently filtered (or blocked) by the wrong RLS policy.
    """
    db = SessionLocal()

    if not settings.is_sqlite:
        try:
            # ALWAYS reset RLS context first to prevent connection pool leaks
            # FIX: Use NULL instead of empty string — ''::uuid cast throws
            # "invalid input syntax for type uuid" in strict RLS policies.
            # NULL::uuid is valid in PostgreSQL (returns NULL).
            db.execute(
                text("SELECT set_config('app.current_tenant_id', NULL::text, false)")
            )
            # Then set the correct tenant_id if available
            tenant_id = tenant_context.get()
            if tenant_id:
                db.execute(
                    text("SELECT set_config('app.current_tenant_id', :tid, false)"),
                    {"tid": str(tenant_id)},
                )
        except Exception as exc:
            # RLS set_config may fail if the function doesn't exist yet
            # (e.g. fresh database before Alembic runs RLS migration).
            # Log but don't block — the connection is still usable.
            import logging
            logging.getLogger(__name__).warning(
                "set_config failed (RLS may not be configured yet): %s", exc
            )

    try:
        # Verify database connection is alive before yielding
        db.execute(text("SELECT 1"))
        yield db
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error(
            "Database connection failed in get_db(): %s", exc
        )
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        db.close()
