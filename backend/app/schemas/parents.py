from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date, datetime

# --- ParentStudent Schemas ---

class ParentStudentBase(BaseModel):
    parent_id: UUID
    student_id: UUID
    is_primary: bool = False
    relation_type: Optional[str] = None

class ParentStudentCreate(ParentStudentBase):
    pass


class StudentSummary(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    registration_number: str
    photo_url: Optional[str] = None
    date_of_birth: Optional[date] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

    class Config:
        from_attributes = True


class ParentSummary(BaseModel):
    id: UUID
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True

class ParentStudent(ParentStudentBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime
    student: Optional[StudentSummary] = None
    parent: Optional[ParentSummary] = None

    class Config:
        from_attributes = True

# --- API Endpoints and CRUD logic (Simplified internal) ---
# This will be used in the router
