from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class ClubCreate(BaseModel):
    name: str
    description: Optional[str] = None
    advisor_id: Optional[UUID] = None
    meeting_day: Optional[str] = None
    meeting_time: Optional[str] = None
    location: Optional[str] = None
    max_members: Optional[int] = None
    is_active: bool = True


class ClubUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    advisor_id: Optional[UUID] = None
    meeting_day: Optional[str] = None
    meeting_time: Optional[str] = None
    location: Optional[str] = None
    max_members: Optional[int] = None
    is_active: Optional[bool] = None


class ClubOut(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    description: Optional[str] = None
    advisor_id: Optional[UUID] = None
    meeting_day: Optional[str] = None
    meeting_time: Optional[str] = None
    location: Optional[str] = None
    max_members: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClubMembershipCreate(BaseModel):
    club_id: UUID
    student_id: UUID
    role: Optional[str] = "MEMBER"


class ClubMembershipOut(BaseModel):
    id: UUID
    tenant_id: UUID
    club_id: UUID
    student_id: UUID
    role: Optional[str] = None
    joined_at: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
