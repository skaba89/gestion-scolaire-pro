from typing import Optional, Any, Dict
from pydantic import BaseModel, UUID4
from datetime import datetime

class AuditLogBase(BaseModel):
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

class AuditLogCreate(AuditLogBase):
    pass

class AuditLog(AuditLogBase):
    id: UUID4
    tenant_id: UUID4
    user_id: Optional[UUID4] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
