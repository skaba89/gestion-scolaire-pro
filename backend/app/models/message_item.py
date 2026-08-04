"""One message within a MessageThread — see message_thread.py for the
rationale of a real conversation model separate from NotificationEvent."""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Text, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, UUIDMixin


class MessageItem(Base, UUIDMixin):
    __tablename__ = "message_items"

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    thread_id = Column(GUID(), ForeignKey("message_threads.id", ondelete="CASCADE"), nullable=False, index=True)

    # school | parent | system — who wrote it, independent of direction
    # (a school staff reply is OUTBOUND but sender_type="school").
    sender_type = Column(String(20), nullable=False)
    sender_user_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # INBOUND (parent -> school) | OUTBOUND (school -> parent)
    direction = Column(String(10), nullable=False)
    channel = Column(String(20), nullable=False, default="whatsapp")

    # Message text only — never the full raw provider payload (see
    # process_webhook_event(), which extracts just this before discarding
    # the rest of Meta's payload).
    body = Column(Text, nullable=False)

    # Meta's wamid (or provider-equivalent) for outbound messages, so a
    # later webhook status update can be matched back. Nullable + unique
    # only when set, exactly like NotificationEvent.provider_message_id —
    # a webhook replay must never create a duplicate row.
    provider_message_id = Column(String(255), nullable=True, unique=True, index=True)

    # QUEUED | SENT | DELIVERED | READ | FAILED (outbound) | RECEIVED (inbound)
    status = Column(String(20), nullable=False, default="RECEIVED")

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)

    thread = relationship("MessageThread", back_populates="items")
