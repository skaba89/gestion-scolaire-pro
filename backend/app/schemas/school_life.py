from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime

# --- Assessment Schemas ---

class AssessmentBase(BaseModel):
    name: str
    max_score: float = 20.0
    date: datetime
    assessment_type: Optional[str] = None
    subject_id: UUID
    academic_year_id: Optional[UUID] = None
    term_id: Optional[UUID] = None

class AssessmentCreate(AssessmentBase):
    pass

class AssessmentUpdate(BaseModel):
    name: Optional[str] = None
    max_score: Optional[float] = None
    date: Optional[datetime] = None
    assessment_type: Optional[str] = None

class Assessment(AssessmentBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Grade Schemas ---

class GradeBase(BaseModel):
    student_id: UUID
    assessment_id: Optional[UUID] = None
    subject_id: Optional[UUID] = None
    score: float
    max_score: float = 20.0
    coefficient: float = 1.0
    comments: Optional[str] = None

class GradeCreate(GradeBase):
    pass

class GradeUpdate(BaseModel):
    score: Optional[float] = None
    max_score: Optional[float] = None
    coefficient: Optional[float] = None
    comments: Optional[str] = None

class Grade(GradeBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime
    
    # Inclusion of Assessment and Student details for frontend
    assessment: Optional[Assessment] = None

    class Config:
        from_attributes = True

# --- Attendance Schemas ---

class AttendanceBase(BaseModel):
    date: date
    status: str
    reason: Optional[str] = None
    student_id: UUID
    subject_id: Optional[UUID] = None
    classroom_id: Optional[UUID] = None

class AttendanceCreate(AttendanceBase):
    pass

class AttendanceUpdate(BaseModel):
    status: Optional[str] = None
    reason: Optional[str] = None

class Attendance(AttendanceBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- School Event Schemas ---

class SchoolEventBase(BaseModel):
    title: str
    description: Optional[str] = None
    start_date: datetime
    end_date: Optional[datetime] = None
    location: Optional[str] = None
    is_all_day: bool = False
    event_type: Optional[str] = None

class SchoolEventCreate(SchoolEventBase):
    pass

class SchoolEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    location: Optional[str] = None
    is_all_day: Optional[bool] = None
    event_type: Optional[str] = None

class SchoolEvent(SchoolEventBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Student Check-In Schemas ---

class StudentCheckInBase(BaseModel):
    checked_at: datetime
    direction: str = "IN"
    source: Optional[str] = None
    student_id: UUID

class StudentCheckInCreate(StudentCheckInBase):
    pass

class StudentCheckIn(StudentCheckInBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
