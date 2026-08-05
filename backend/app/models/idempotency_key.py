"""Backend idempotency for the offline queue (Phase 5, WhatsApp/offline
hardening brief). A mobile client retrying a POST/PATCH after a dropped
response (common on flaky connectivity) must never create the same
attendance mark / message twice — the client sends an X-Idempotency-Key
header, and this table remembers the first response for that key so a
retry gets the same result instead of a second side effect."""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.core.database import Base
from app.models.base import GUID, UUIDMixin


class IdempotencyKey(Base, UUIDMixin):
    __tablename__ = "idempotency_keys"
    # Same name/columns as the Postgres index created by
    # alembic/versions/20260804_0002_idempotency_keys.py — declared here
    # too so SQLite (Base.metadata.create_all(), used by the test suite and
    # any ad-hoc local SQLite run) enforces the same guarantee: a
    # concurrent double-insert for the same (tenant_id, user_id, key) is
    # impossible at the DB level, not just via the app's SELECT-then-INSERT
    # check in app/core/idempotency.py.
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", "key", name="ux_idempotency_keys_tenant_user_key"),
    )

    key = Column(String(255), nullable=False, index=True)
    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    method = Column(String(10), nullable=False)
    endpoint = Column(String(255), nullable=False)

    # sha256 of the request body — the same key replayed with a DIFFERENT
    # body is a client bug (or a key collision), not a legitimate retry; it
    # must be rejected (409) rather than silently returning the old response.
    request_hash = Column(String(64), nullable=False)

    response_json = Column(Text, nullable=False)
    status_code = Column(Integer, nullable=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
