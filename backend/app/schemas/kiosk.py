from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class KioskDeviceCreate(BaseModel):
    label: str
    # Classroom badge-in feature (institutional-readiness audit, 2026-09):
    # binds this device to a specific room's door instead of the generic
    # school entrance — see KioskDevice.room_id and kiosk_scan().
    room_id: Optional[str] = None


class KioskDeviceInDB(BaseModel):
    """Never includes the token or its hash — see KioskDeviceCreated for the
    one-time plaintext token shown at creation."""
    id: UUID
    label: str
    is_active: bool
    room_id: Optional[UUID] = None
    last_used_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class KioskDeviceCreated(KioskDeviceInDB):
    """Returned only from the create endpoint. The plaintext token is never
    retrievable again after this response — only the hash is persisted."""
    token: str


class KioskScanRequest(BaseModel):
    qr_payload: str
    direction: str = "IN"  # "IN" | "OUT"
