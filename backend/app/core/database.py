from contextvars import ContextVar
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Global context for tenant_id to be used in database sessions
tenant_context: ContextVar[str] = ContextVar("tenant_id", default=None)

# Create SQLAlchemy engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    pool_pre_ping=True,  # Verify connections before using
    echo=settings.DEBUG,  # Log SQL queries in debug mode
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()


def get_db():
    """Dependency to get database session with RLS tenant_id set"""
    db = SessionLocal()
    tenant_id = tenant_context.get()
    
    if tenant_id:
        # Set the tenant_id for Row Level Security in this session
        db.execute(text("SELECT set_config('app.current_tenant_id', :tid, false)"), {"tid": str(tenant_id)})
    
    try:
        yield db
    finally:
        db.close()
