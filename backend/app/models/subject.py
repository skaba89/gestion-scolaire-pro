from sqlalchemy import Column, String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin, TenantMixin


class Subject(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "subjects"
    
    name = Column(String(255), nullable=False)
    code = Column(String(50))
    coefficient = Column(Float, default=1.0)
    
    # Relationships
    departments = relationship("Department", secondary="subject_departments", back_populates="subjects")
    levels = relationship("Level", secondary="subject_levels")
