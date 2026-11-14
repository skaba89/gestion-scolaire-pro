"""Versioned module policy, separate from replaceable presentation settings."""
from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, JSON, String

from app.models.base import Base, GUID, TimestampMixin


class EducationConfiguration(Base, TimestampMixin):
    __tablename__ = "education_configurations"
    __table_args__ = (CheckConstraint("revision >= 1", name="ck_education_config_revision"),)

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    profile_id = Column(String(50), nullable=False)
    overrides = Column(JSON, nullable=False, default=dict)
    revision = Column(Integer, nullable=False, default=1)
