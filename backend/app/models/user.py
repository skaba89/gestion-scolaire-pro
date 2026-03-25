"""User model"""
from sqlalchemy import Column, String, Boolean
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin, TenantMixin


class User(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "users"
    
    # Legacy external identity id kept for backward compatibility during migration
    keycloak_id = Column(String(255), unique=True, nullable=False, index=True)
    
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=True)
    first_name = Column(String(100))
    last_name = Column(String(100))
    phone = Column(String(20))
    avatar_url = Column(String(500))
    
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="users", primaryjoin="User.tenant_id == Tenant.id")
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()
