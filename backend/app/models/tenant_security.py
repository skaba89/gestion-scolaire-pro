from sqlalchemy import Column, Boolean, Integer, ForeignKey
from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin

class TenantSecuritySettings(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "tenant_security_settings"
    
    mfa_required = Column(Boolean, default=False)
    password_expiry_days = Column(Integer, default=90)
    session_timeout_minutes = Column(Integer, default=60)
