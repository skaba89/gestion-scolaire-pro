"""Webhook call log for CinetPay/PayTech payment gateways.

Not a payment record itself (see app/models/payment.py) — one row per
webhook HTTP call received, regardless of outcome, so support can answer
"did a webhook ever arrive for this transaction, and what happened".
tenant_id is nullable: some outcomes (missing transaction_id, unknown
payment reference) are rejected before a tenant can be resolved at all.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String

from app.models.base import GUID, UUIDMixin
from app.core.database import Base


class PaymentWebhookEvent(Base, UUIDMixin):
    __tablename__ = "payment_webhook_events"

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    gateway = Column(String(20), nullable=False)  # "cinetpay" | "paytech"
    transaction_id = Column(String(255), nullable=True, index=True)
    # "confirmed" | "rejected" | "ignored" | "processed"
    outcome = Column(String(30), nullable=False, index=True)
    # Short, non-personal explanation — never the raw payload.
    reason = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
