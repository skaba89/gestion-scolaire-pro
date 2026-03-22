from sqlalchemy import Column, String, Float, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin, UUIDMixin, TenantMixin

class Assessment(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "assessments"
    
    name = Column(String(255), nullable=False)
    max_score = Column(Float, default=20.0, nullable=False)
    date = Column(DateTime, nullable=False)
    assessment_type = Column(String(50)) # QUIZ, EXAM, etc.
    
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    academic_year_id = Column(UUID(as_uuid=True), ForeignKey("academic_years.id", ondelete="SET NULL"))
    term_id = Column(UUID(as_uuid=True), ForeignKey("terms.id", ondelete="SET NULL"))
    
    # Relationships
    subject = relationship("Subject")
    academic_year = relationship("AcademicYear")
    term = relationship("Term")
    grades = relationship("Grade", back_populates="assessment", cascade="all, delete-orphan")
