from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Level(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "levels"
    
    name = Column(String(255), nullable=False)
    code = Column(String(50))
    label = Column(String(255), nullable=True)
    order_index = Column(Integer, default=0)
    
    # Relationships
    # Add relationships as needed in the future
