"""Tenant model"""
from sqlalchemy import Column, String, Boolean, JSON
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class Tenant(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tenants"
    
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    type = Column(String(50), nullable=False)  # SCHOOL, UNIVERSITY, TRAINING_CENTER
    country = Column(String(2), nullable=False, default="GN")  # ISO country code
    currency = Column(String(3), default="GNF")  # ISO currency code
    timezone = Column(String(50), default="Africa/Conakry")
    email = Column(String(255))
    phone = Column(String(50))
    address = Column(String(500))
    website = Column(String(255))
    is_active = Column(Boolean, default=True)
    settings = Column(JSON, default=dict)
    
    # Relationships
    users = relationship("User", back_populates="tenant")
    students = relationship("Student", back_populates="tenant")
