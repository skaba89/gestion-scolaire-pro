from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Department(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "departments"
    
    name = Column(String(255), nullable=False)
    code = Column(String(50))
    description = Column(String(500))
    head_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Relationships
    head = relationship("User", foreign_keys=[head_id])
    subjects = relationship("Subject", secondary="subject_departments", back_populates="departments")
