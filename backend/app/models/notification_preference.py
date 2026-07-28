"""Per-user notification preferences (which categories to receive).

Previously the frontend (src/hooks/usePushNotifications.ts) only kept these
in localStorage: they never synced across devices and the server never knew
about them, so every DB/push notification was still created unconditionally.
This table is the source of truth; one row per user (not per device/
subscription — a user's preference should follow them across devices).
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.models.base import GUID, UUIDMixin
from app.core.database import Base


class NotificationPreference(Base, UUIDMixin):
    __tablename__ = "notification_preferences"

    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)

    grades = Column(Boolean, nullable=False, default=True)
    absences = Column(Boolean, nullable=False, default=True)
    messages = Column(Boolean, nullable=False, default=True)
    homework = Column(Boolean, nullable=False, default=True)
    events = Column(Boolean, nullable=False, default=True)
    payments = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
