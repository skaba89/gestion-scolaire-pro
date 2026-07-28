from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class NotificationPreferenceBase(BaseModel):
    grades: bool = True
    absences: bool = True
    messages: bool = True
    homework: bool = True
    events: bool = True
    payments: bool = True


class NotificationPreferenceUpdate(BaseModel):
    grades: Optional[bool] = None
    absences: Optional[bool] = None
    messages: Optional[bool] = None
    homework: Optional[bool] = None
    events: Optional[bool] = None
    payments: Optional[bool] = None


class NotificationPreferenceInDB(NotificationPreferenceBase):
    id: UUID
    user_id: UUID
    tenant_id: Optional[UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
