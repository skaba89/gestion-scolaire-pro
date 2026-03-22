from typing import Optional, List
from pydantic import BaseModel, UUID4
from datetime import datetime

class DeletionRequestBase(BaseModel):
    reason: Optional[str] = None

class DeletionRequestCreate(DeletionRequestBase):
    pass

class DeletionRequestUpdate(BaseModel):
    status: str
    rejection_reason: Optional[str] = None

class UserMin(BaseModel):
    id: UUID4
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    class Config:
        from_attributes = True

class DeletionRequestInDB(DeletionRequestBase):
    id: UUID4
    tenant_id: UUID4
    user_id: UUID4
    status: str
    requested_at: datetime
    processed_at: Optional[datetime] = None
    processed_by: Optional[UUID4] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DeletionRequest(DeletionRequestInDB):
    user: Optional[UserMin] = None
    processor: Optional[UserMin] = None
