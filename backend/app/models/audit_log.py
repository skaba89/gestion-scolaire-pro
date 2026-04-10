"""Audit log model for tracking system actions"""
from sqlalchemy import Column, String, JSON, Text
from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin

class AuditLog(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "audit_logs"

    # User who performed the action (User ID)
    user_id = Column(String(255), nullable=False, index=True)

    # Action type: CREATE, UPDATE, DELETE, LOGIN, etc.
    action = Column(String(50), nullable=False, index=True)

    # Severity level: INFO, WARNING, CRITICAL, ERROR
    severity = Column(String(20), nullable=True, index=True, default="INFO")

    # Target resource: USER, STUDENT, PAYMENT, etc.
    resource_type = Column(String(50), nullable=False, index=True)

    # ID of the target resource
    resource_id = Column(String(255), nullable=True)

    # Details of the change (JSON format preferred)
    details = Column(JSON, nullable=True)

    # IP Address or other metadata
    ip_address = Column(String(45), nullable=True)

    # User agent string (browser/client info)
    user_agent = Column(Text, nullable=True)
