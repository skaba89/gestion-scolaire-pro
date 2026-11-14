"""A pedagogical cycle inside one administrative tenant."""
from sqlalchemy import Boolean, CheckConstraint, Column, ForeignKey, Integer, String, UniqueConstraint

from app.models.base import Base, GUID, TimestampMixin, UUIDMixin


class EducationCycle(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "education_cycles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_education_cycles_tenant_code"),
        UniqueConstraint("tenant_id", "id", name="uq_education_cycles_tenant_id_id"),
        CheckConstraint("revision >= 1", name="ck_education_cycles_revision"),
    )

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    institution_type = Column(String(50), nullable=False)
    period_type = Column(String(30), nullable=False)
    order_index = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    revision = Column(Integer, nullable=False, default=1)
