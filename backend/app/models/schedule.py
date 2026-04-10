from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Time
from sqlalchemy.sql import func
import uuid

from app.core.database import Base

from app.models.base import GUID

class ScheduleSlot(Base):
    __tablename__ = "schedule"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"), nullable=False, index=True)
    class_id = Column(GUID(), ForeignKey("classes.id"), nullable=False, index=True)
    subject_id = Column(GUID(), ForeignKey("subjects.id"), nullable=False)
    teacher_id = Column(GUID(), ForeignKey("users.id"), nullable=True)
    day_of_week = Column(Integer, nullable=False) # 0-6 or 1-7
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    room_id = Column(GUID(), ForeignKey("rooms.id"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
