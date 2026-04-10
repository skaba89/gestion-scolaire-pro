from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Room(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "rooms"
    
    name = Column(String(255), nullable=False)
    capacity = Column(Integer)
    campus_id = Column(GUID(), ForeignKey("campuses.id", ondelete="CASCADE"), nullable=True)
    
    # Relationships
    campus = relationship("Campus")
    classes = relationship("Classroom", back_populates="room")
