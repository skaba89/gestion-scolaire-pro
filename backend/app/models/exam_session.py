"""Historised LMD examination sessions, including retakes."""
from sqlalchemy import CheckConstraint, Column, Date, ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, TimestampMixin, UUIDMixin


class ExamSession(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "exam_sessions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_exam_sessions_tenant_code"),
        UniqueConstraint("tenant_id", "id", name="uq_exam_sessions_tenant_id_id"),
        ForeignKeyConstraint(
            ["tenant_id", "semester_id"], ["semesters.tenant_id", "semesters.id"],
            name="fk_exam_sessions_tenant_semester", ondelete="RESTRICT",
        ),
        CheckConstraint("session_type IN ('REGULAR', 'RETAKE')", name="ck_exam_sessions_type"),
        CheckConstraint("status IN ('DRAFT', 'OPEN', 'CLOSED')", name="ck_exam_sessions_status"),
        CheckConstraint("selection_policy IN ('BEST', 'LATEST')", name="ck_exam_sessions_policy"),
        CheckConstraint("sequence >= 1", name="ck_exam_sessions_sequence"),
        CheckConstraint("revision >= 1", name="ck_exam_sessions_revision"),
        CheckConstraint("ends_on >= starts_on", name="ck_exam_sessions_dates"),
    )

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    semester_id = Column(GUID(), nullable=False, index=True)
    code = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    session_type = Column(String(20), nullable=False, default="REGULAR")
    sequence = Column(Integer, nullable=False, default=1)
    starts_on = Column(Date, nullable=False)
    ends_on = Column(Date, nullable=False)
    status = Column(String(20), nullable=False, default="DRAFT")
    selection_policy = Column(String(20), nullable=False, default="BEST")
    revision = Column(Integer, nullable=False, default=1)

    semester = relationship("Semester", foreign_keys=[semester_id])
    assessments = relationship("Assessment", back_populates="exam_session", foreign_keys="Assessment.exam_session_id")
