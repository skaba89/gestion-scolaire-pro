"""Per-tenant, per-year sequential counter backing payment reference
numbers (REC-{year}-{seq}). See docs/PAYMENTS_READINESS.md — sequential
numbering was flagged as needing client confirmation; built on the most
common convention (reset per calendar year, per establishment) as a
reasonable default, additive and non-breaking.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint

from app.models.base import GUID, UUIDMixin
from app.core.database import Base


class PaymentReferenceCounter(Base, UUIDMixin):
    __tablename__ = "payment_reference_counters"
    __table_args__ = (UniqueConstraint("tenant_id", "year", name="uq_payment_reference_counters_tenant_year"),)

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    last_value = Column(Integer, nullable=False, default=0)

    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
