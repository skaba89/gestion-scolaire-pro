from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime

class NotificationBase(BaseModel):
    title: str
    message: Optional[str] = None
    type: Optional[str] = "info"
    link: Optional[str] = None

class NotificationCreate(NotificationBase):
    user_id: UUID

class NotificationBulkCreate(BaseModel):
    notifications: List[NotificationCreate]

class NotificationUpdate(BaseModel):
    is_read: Optional[bool] = None

class NotificationResponse(NotificationBase):
    id: UUID
    user_id: UUID
    tenant_id: UUID
    is_read: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
