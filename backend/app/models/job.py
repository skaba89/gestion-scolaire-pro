"""Status tracking for async jobs (Arq) — national audit Phase 5.

tenant_id is nullable (unlike TenantMixin's NOT NULL): some job types are
platform-level (e.g. a future ministry export spanning tenants) rather than
scoped to a single school.
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base
from app.models.base import GUID, UUIDMixin


class Job(Base, UUIDMixin):
    __tablename__ = "jobs"

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    job_type = Column(String(100), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="PENDING", index=True)  # PENDING/RUNNING/SUCCESS/FAILED
    # Generic JSON (not dialect-specific JSONB) for SQLite/Postgres portability
    # — matches the pattern already used by Tenant.settings.
    payload = Column(JSON, nullable=True)
    result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
