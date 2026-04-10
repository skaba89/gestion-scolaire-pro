from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Classroom(Base, UUIDMixin, TimestampMixin, TenantMixin):
    """Represents the 'classes' table in the database."""
    __tablename__ = "classes"
    
    name = Column(String(255), nullable=False)
    capacity = Column(Integer)
    level_id = Column(GUID(), ForeignKey("levels.id", ondelete="SET NULL"), nullable=True)
    campus_id = Column(GUID(), ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True)
    program_id = Column(GUID(), ForeignKey("programs.id", ondelete="SET NULL"), nullable=True)
    academic_year_id = Column(GUID(), ForeignKey("academic_years.id", ondelete="SET NULL"), nullable=True)
    main_room_id = Column(GUID(), ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True)
    
    # Relationships
    level = relationship("Level")
    campus = relationship("Campus")
    program = relationship("Program")
    academic_year = relationship("AcademicYear")
    room = relationship("Room", back_populates="classes")
    
    departments = relationship("Department", secondary="classroom_departments")
    subjects = relationship("Subject", secondary="class_subjects")
    enrollments = relationship("Enrollment", back_populates="classroom")
