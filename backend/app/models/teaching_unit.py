"""LMD teaching unit (UE) grouping existing subjects used as ECUEs."""
from sqlalchemy import Boolean, CheckConstraint, Column, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, TimestampMixin, UUIDMixin


class TeachingUnit(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "teaching_units"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_teaching_units_tenant_code"),
        UniqueConstraint("tenant_id", "id", name="uq_teaching_units_tenant_id_id"),
        CheckConstraint("ects >= 0", name="ck_teaching_units_ects_nonnegative"),
        CheckConstraint("revision >= 1", name="ck_teaching_units_revision"),
    )

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    semester_id = Column(GUID(), ForeignKey("semesters.id", ondelete="RESTRICT"), nullable=False, index=True)
    code = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    ects = Column(Float, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    revision = Column(Integer, nullable=False, default=1)

    semester = relationship("Semester", foreign_keys=[semester_id])
    subjects = relationship("Subject", back_populates="teaching_unit", foreign_keys="Subject.teaching_unit_id")
