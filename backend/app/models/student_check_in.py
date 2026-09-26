from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship
from app.models.base import Base, GUID, TimestampMixin, UUIDMixin, TenantMixin

class StudentCheckIn(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "student_check_ins"
    
    checked_at = Column(DateTime, nullable=False)
    direction = Column(String(20), default="IN") # IN or OUT
    source = Column(String(50)) # CARD, MANUAL, APP
    
    student_id = Column(GUID(), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)

    # No FK: check_in_sessions is a raw-SQL operational table created at
    # app startup (app/core/operational_tables.py), not by Alembic — see
    # the migration adding this column for why a DB-level FK isn't safe.
    session_id = Column(GUID(), nullable=True, index=True)

    # Relationships
    student = relationship("Student")
