from sqlalchemy import Column, String, ForeignKey, Date
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Enrollment(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "enrollments"
    
    student_id = Column(GUID(), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    class_id = Column(GUID(), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False)
    academic_year_id = Column(GUID(), ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=False)
    enrollment_date = Column(Date)
    status = Column(String(50), default="ACTIVE") # ACTIVE, WITHDRAWN, GRADUATED
    
    # Relationships
    student = relationship("Student")
    classroom = relationship("Classroom", back_populates="enrollments")
    academic_year = relationship("AcademicYear")
