from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin, TenantMixin


class Level(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "levels"
    
    name = Column(String(255), nullable=False)
    code = Column(String(50))
    order_index = Column(Integer, default=0)
    
    # Relationships
    # Add relationships as needed in the future
