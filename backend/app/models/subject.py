from sqlalchemy import Column, String, Float, Integer, Text, ForeignKey, ForeignKeyConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Subject(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "subjects"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "teaching_unit_id"],
            ["teaching_units.tenant_id", "teaching_units.id"],
            name="fk_subjects_tenant_teaching_unit",
        ),
    )
    
    name = Column(String(255), nullable=False)
    code = Column(String(50))
    coefficient = Column(Float, default=1.0)
    ects = Column(Float, default=0)
    cm_hours = Column(Integer, default=0)
    td_hours = Column(Integer, default=0)
    tp_hours = Column(Integer, default=0)
    description = Column(Text, nullable=True)
    # Semester-progression build-out: a UE optionally belongs to one
    # Semester (LMD structure) — nullable, so a school-type tenant's
    # subjects (never assigned to a semester) are entirely unaffected.
    semester_id = Column(GUID(), ForeignKey("semesters.id", ondelete="SET NULL"), nullable=True)
    # Existing subjects remain valid. In an LMD curriculum a subject can be
    # attached to one UE and is then the ECUE/component taught and graded.
    teaching_unit_id = Column(GUID(), nullable=True, index=True)

    # Relationships
    departments = relationship("Department", secondary="subject_departments", back_populates="subjects")
    levels = relationship("Level", secondary="subject_levels")
    semester = relationship("Semester", foreign_keys=[semester_id])
    teaching_unit = relationship("TeachingUnit", back_populates="subjects", foreign_keys=[teaching_unit_id])
