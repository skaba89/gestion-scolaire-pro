"""Kiosk devices — unattended QR check-in/check-out stations.

A kiosk is a shared, unattended device (tablet at the school entrance)
that must be able to record student check-ins without a staff member
logging in on it (a shared device holding a staff JWT would be a much
worse security posture than a scoped, revocable device credential).

The token itself is never stored — only its SHA-256 hash, same principle
as a password. The plaintext token is returned exactly once, at creation
time (see POST /kiosk/devices/), and cannot be retrieved again — only
regenerated (delete + recreate).
"""
from sqlalchemy import Boolean, Column, DateTime, String
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, TenantMixin, TimestampMixin, UUIDMixin


class KioskDevice(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "kiosk_devices"

    label = Column(String(100), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    # No FK to users.id — informational lineage only, same rationale as
    # AuditLog.user_id (survives the user later being deleted, and is never
    # required to reference a still-existing row).
    created_by_user_id = Column(GUID(), nullable=True)
    last_used_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant")
