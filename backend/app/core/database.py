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

    # Neon / cloud PostgreSQL requires SSL.  Detect sslmode in the URL and
    # pass it through connect_args so psycopg v3 can establish a secure conn.
    _db_url = settings.DATABASE_URL_SYNC or ""
    if "sslmode=require" in _db_url or "sslmode" in _db_url:
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
    """Dependency to get database session with RLS tenant_id set (PostgreSQL only)."""
    db = SessionLocal()

    if not settings.is_sqlite:
        # PostgreSQL Row Level Security: set tenant_id in the session
        tenant_id = tenant_context.get()
        if tenant_id:
            db.execute(
                text("SELECT set_config('app.current_tenant_id', :tid, false)"),
                {"tid": str(tenant_id)},
            )

    try:
        yield db
    finally:
        db.close()
