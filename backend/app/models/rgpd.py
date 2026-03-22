from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from app.models.base import Base, UUIDMixin, TimestampMixin, TenantMixin

class AccountDeletionRequest(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "account_deletion_requests"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    reason = Column(Text)
    status = Column(String, default='PENDING') # PENDING, PROCESSED, CANCELLED, REJECTED
    requested_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime)
    processed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    rejection_reason = Column(Text)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    processor = relationship("User", foreign_keys=[processed_by])

class RGPDLog(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "rgpd_logs"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False) # EXPORT, DELETE, ANONYMIZE, SEARCH
    target_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    details = Column(JSON, default={})
    status = Column(String, default="SUCCESS")

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    target_user = relationship("User", foreign_keys=[target_user_id])
