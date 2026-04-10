"""School Settings model — SaaS governance configuration per tenant."""
from sqlalchemy import Column, String, Boolean, Integer, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base, UUIDMixin, TimestampMixin


class SchoolSetting(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "school_settings"

    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    education_mode = Column(String(50), default="SCHOOL")
    period_type = Column(String(50), default="TRIMESTER")
    grading_system = Column(String(50), default="NUMERIC")
    grading_scale_max = Column(Numeric(5, 2), default=20)
    rounding_rule = Column(String(50), default="NEAREST_HALF")
    attendance_mode = Column(String(50), default="SESSION")
    resit_enabled = Column(Boolean, default=False)
    compensation_enabled = Column(Boolean, default=False)
    justification_deadline_days = Column(Integer, default=7)
    two_man_rule_enabled = Column(Boolean, default=False)
