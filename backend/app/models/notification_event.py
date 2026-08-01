"""Dispatch log for outbound notifications (WhatsApp/Push/SMS/Email) —
WhatsApp Cloud API industrialization.

Distinct from Notification (app/models/notification.py), which is the
in-app activity feed a user sees in the UI. This table tracks the actual
provider-level send: one row per attempt, per channel, with the provider's
message id so incoming webhook status updates (sent/delivered/read/failed)
can be matched back without guessing. Mirrors the pattern already used for
payment webhooks (PaymentWebhookEvent) — log everything, never trust a
webhook blindly, dedupe on the provider's own id.

Recipient phone/email are stored masked (e.g. "+2246*****89",
"d***@ecole.gn"), never in full — this table is read by support/admin
dashboards, not meant to be a PII store.
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base
from app.models.base import GUID, UUIDMixin


class NotificationEvent(Base, UUIDMixin):
    __tablename__ = "notification_events"

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    student_id = Column(GUID(), ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True)
    parent_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    event_type = Column(String(50), nullable=False, index=True)  # payment_reminder, absence_alert, ...
    channel = Column(String(20), nullable=False, index=True)  # whatsapp | push | sms | email
    recipient_phone = Column(String(30), nullable=True)  # masked, e.g. "+2246*****89"
    recipient_email = Column(String(255), nullable=True)  # masked, e.g. "d***@ecole.gn"
    template_name = Column(String(100), nullable=True)

    # Small, non-sensitive payload (template variables actually sent) — never
    # full student/payment records, just what's needed to re-render/debug.
    payload_json = Column(JSON, nullable=True)

    # PENDING | QUEUED | SENT | DELIVERED | READ | FAILED | CANCELED
    status = Column(String(20), nullable=False, default="PENDING", index=True)

    # Meta's wamid (or provider-equivalent) — unique so a webhook replay or
    # a duplicate enqueue can never be recorded/counted twice.
    provider_message_id = Column(String(255), nullable=True, unique=True, index=True)
    error_reason = Column(Text, nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    sent_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    failed_at = Column(DateTime, nullable=True)
