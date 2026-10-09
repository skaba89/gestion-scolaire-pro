"""Platform-level audit trail (SUPER_ADMIN actions on tenants)."""
from sqlalchemy import Column, JSON, String

from app.models.base import Base, TimestampMixin, UUIDMixin


class PlatformAuditLog(Base, UUIDMixin, TimestampMixin):
    """Append-only record of platform operations (tenant deletion,
    activation/deactivation, creation).

    Deliberately NOT tenant-scoped (no tenant_id, no RLS): `audit_logs`
    rows cascade with their tenant, so the trace of a tenant deletion
    vanished with it. The target tenant is identified by value
    (target_id + details) — no foreign key, so the row survives the tenant.
    Runtime roles may INSERT and SELECT only (migration 20261011_0001).
    """

    __tablename__ = "platform_audit_logs"

    actor_user_id = Column(String(255), nullable=False, index=True)
    action = Column(String(50), nullable=False, index=True)
    target_type = Column(String(50), nullable=False)
    target_id = Column(String(255), nullable=True, index=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
