"""Audit log model for tracking system actions"""
from sqlalchemy import Column, String, JSON, Text
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base, UUIDMixin, TimestampMixin, TenantMixin

class AuditLog(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "audit_logs"

    # User who performed the action (Keycloak ID)
    user_id = Column(String(255), nullable=False, index=True)
    
    # Action type: CREATE, UPDATE, DELETE, LOGIN, etc.
    action = Column(String(50), nullable=False, index=True)
    
    # Target resource: USER, STUDENT, PAYMENT, etc.
    resource_type = Column(String(50), nullable=False, index=True)
    
    # ID of the target resource
    resource_id = Column(String(255), nullable=True)
    
    # Details of the change (JSON format preferred)
    details = Column(JSON, nullable=True)
    
    # IP Address or other metadata
    ip_address = Column(String(45), nullable=True)
