"""Grade model"""
from sqlalchemy import Column, String, Float, ForeignKey, Date, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin, TenantMixin


class Grade(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "grades"
    
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=True) # Optional for manual grades
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    
    score = Column(Float, nullable=False)
    max_score = Column(Float, default=20.0, nullable=False)
    coefficient = Column(Float, default=1.0)
    
    comments = Column(String(500))
    
    # Relationships
    student = relationship("Student", back_populates="grades")
    assessment = relationship("Assessment", back_populates="grades")
    subject = relationship("Subject")
    
    @property
    def percentage(self):
        """Calculate percentage score"""
        return (self.score / self.max_score) * 100 if self.max_score > 0 else 0
    
    @property
    def weighted_score(self):
        """Calculate weighted score"""
        return self.score * self.coefficient
