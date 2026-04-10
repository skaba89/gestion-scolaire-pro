from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional

class PushSubscriptionBase(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    platform: Optional[str] = "web"
    is_active: Optional[bool] = True

class PushSubscriptionCreate(PushSubscriptionBase):
    pass

class PushSubscriptionUpdate(BaseModel):
    is_active: Optional[bool] = None

class PushSubscriptionInDB(PushSubscriptionBase):
    id: UUID
    user_id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
