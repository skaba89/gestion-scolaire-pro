from sqlalchemy import Column, String, Date, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.models.base import Base, GUID, TimestampMixin, UUIDMixin, TenantMixin

class Attendance(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "attendance"
    
    date = Column(Date, nullable=False)
    status = Column(String(50), nullable=False) # PRESENT, ABSENT, LATE, EXCUSED
    reason = Column(Text)
    
    student_id = Column(GUID(), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(GUID(), ForeignKey("subjects.id", ondelete="SET NULL"))
    classroom_id = Column(GUID(), ForeignKey("classes.id", ondelete="SET NULL"))
    
    # Relationships
    student = relationship("Student")
    subject = relationship("Subject")
    classroom = relationship("Classroom")
