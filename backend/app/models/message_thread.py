"""Real conversation persistence for cross-channel messaging (currently
WhatsApp) — Phase 3 of the WhatsApp/offline hardening brief.

A MessageThread groups one back-and-forth with a parent/student (e.g. one
WhatsApp phone number's conversation with the school). MessageItem is one
message within that thread, in either direction. This is distinct from the
existing NotificationEvent table (a dispatch LOG for one-off outbound
sends like payment reminders) — a thread is a genuine, ongoing
conversation a staff member can read and reply to.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, UUIDMixin


class MessageThread(Base, UUIDMixin):
    __tablename__ = "message_threads"

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    student_id = Column(GUID(), ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True)
    subject = Column(String(255), nullable=True)

    # Identity for a sender we could NOT match to a User (parent_id stays
    # NULL for these). external_sender_hash = sha256(normalized_phone +
    # tenant_id + pepper) — never the phone number itself — so two
    # different unknown numbers get two distinct threads instead of being
    # merged into one "parent_id IS NULL" bucket, while the same unknown
    # number reliably reuses its own thread across messages. Always NULL
    # for threads with a known parent_id. See
    # whatsapp_service.hash_external_sender()/mask_phone_for_display().
    external_sender_hash = Column(String(64), nullable=True, index=True)
    external_sender_masked = Column(String(32), nullable=True)

    # OPEN | CLOSED
    status = Column(String(20), nullable=False, default="OPEN", index=True)

    # whatsapp | in_app | sms — the channel this thread originated on.
    source_channel = Column(String(20), nullable=False, default="whatsapp")

    created_by = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    items = relationship("MessageItem", back_populates="thread", cascade="all, delete-orphan")
