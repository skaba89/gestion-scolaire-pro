from sqlalchemy import Column, Boolean, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base, UUIDMixin, TimestampMixin, TenantMixin

class TenantSecuritySettings(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "tenant_security_settings"
    
    mfa_required = Column(Boolean, default=False)
    password_expiry_days = Column(Integer, default=90)
    session_timeout_minutes = Column(Integer, default=60)
