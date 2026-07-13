from typing import Literal, Optional
from pydantic import BaseModel, Field, UUID4, model_validator
from datetime import datetime

class DeletionRequestBase(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=2000)

class DeletionRequestCreate(DeletionRequestBase):
    pass

class DeletionRequestUpdate(BaseModel):
    status: Literal["PROCESSED", "REJECTED", "CANCELLED"]
    rejection_reason: Optional[str] = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def require_rejection_reason(self):
        if self.status == "REJECTED" and not (self.rejection_reason or "").strip():
            raise ValueError("rejection_reason is required when rejecting a request")
        return self

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
