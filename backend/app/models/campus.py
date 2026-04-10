from sqlalchemy import Column, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Campus(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "campuses"
    
    name = Column(String(255), nullable=False)
    address = Column(String(500))
    phone = Column(String(50))
    is_main = Column(Boolean, default=False)
    
    # Relationships
    # Add relationships as needed in the future
