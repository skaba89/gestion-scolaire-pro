"""Base model with common fields.

Provides mixins for UUID primary keys, timestamps, and tenant isolation.
Works with both PostgreSQL and SQLite backends.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, String, ForeignKey, TypeDecorator, CHAR
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
import uuid

from app.core.database import Base


class GUID(TypeDecorator):
    """Platform-independent GUID type.

    Uses PostgreSQL's native UUID type when available.
    Falls back to CHAR(32) for SQLite and other databases.
    """
    impl = CHAR(32)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(32))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return str(value)
        else:
            if isinstance(value, uuid.UUID):
                return value.hex
            else:
                return uuid.UUID(value).hex

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, uuid.UUID):
                return uuid.UUID(str(value))
            return value


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps"""
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=datetime.now, nullable=False)


class UUIDMixin:
    """Mixin for UUID primary key (works with PostgreSQL and SQLite)"""
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)


class TenantMixin:
    """Mixin for tenant_id foreign key (works with PostgreSQL and SQLite)"""
    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
