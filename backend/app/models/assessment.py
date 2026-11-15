from sqlalchemy import Column, String, Float, ForeignKey, ForeignKeyConstraint, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import Base, GUID, TimestampMixin, UUIDMixin, TenantMixin

class Assessment(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "assessments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_assessments_tenant_id_id"),
        ForeignKeyConstraint(
            ["tenant_id", "exam_session_id"], ["exam_sessions.tenant_id", "exam_sessions.id"],
            name="fk_assessments_tenant_exam_session", ondelete="RESTRICT",
        ),
    )

    name = Column(String(255), nullable=False)
    max_score = Column(Float, default=20.0, nullable=False)
    date = Column(DateTime, nullable=False)
    assessment_type = Column(String(50)) # QUIZ, EXAM, etc.
    weight = Column(Float, default=1.0, nullable=False)  # coefficient
    description = Column(Text)
    
    subject_id = Column(GUID(), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    academic_year_id = Column(GUID(), ForeignKey("academic_years.id", ondelete="SET NULL"))
    term_id = Column(GUID(), ForeignKey("terms.id", ondelete="SET NULL"))
    # BUG FIX (institutional-readiness audit, 2026-09): academic/
    # assessments.py's AssessmentCreate/AssessmentUpdate schemas and
    # endpoints reference class_id, but this column never existed on the
    # ORM model or the migrated table — any request supplying class_id
    # raised UndefinedColumn on real Postgres. Added additively (see
    # matching Alembic migration).
    class_id = Column(GUID(), ForeignKey("classes.id", ondelete="SET NULL"))
    # Optional institutional session. Existing assessments remain unlinked
    # and keep their historical meaning as the regular baseline.
    exam_session_id = Column(GUID(), nullable=True, index=True)

    # Relationships
    subject = relationship("Subject")
    academic_year = relationship("AcademicYear")
    term = relationship("Term")
    classroom = relationship("Classroom")
    exam_session = relationship("ExamSession", back_populates="assessments", foreign_keys=[exam_session_id])
    grades = relationship("Grade", back_populates="assessment", cascade="all, delete-orphan")
