from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime, Text, JSON
from sqlalchemy.sql import func
import uuid

from app.models.base import Base, GUID

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=True)
    type = Column(String(50), nullable=True, default="info") # info, grade, message, event, alert
    link = Column(String(255), nullable=True)
    
    is_read = Column(Boolean, default=False, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
