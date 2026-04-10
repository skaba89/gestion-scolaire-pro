"""Grade schemas for request/response validation"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, UUID4


# Base schema — aligned with the Grade SQLAlchemy model
class GradeBase(BaseModel):
    student_id: UUID4
    subject_id: Optional[UUID4] = None
    assessment_id: Optional[UUID4] = None
    score: float = Field(..., ge=0)
    max_score: float = Field(default=20.0, gt=0)
    coefficient: float = Field(default=1.0, gt=0)
    comments: Optional[str] = Field(None, max_length=500)


# Schema for creating a grade
class GradeCreate(GradeBase):
    pass


# Schema for updating a grade
class GradeUpdate(BaseModel):
    student_id: Optional[UUID4] = None
    subject_id: Optional[UUID4] = None
    assessment_id: Optional[UUID4] = None
    score: Optional[float] = Field(None, ge=0)
    max_score: Optional[float] = Field(None, gt=0)
    coefficient: Optional[float] = Field(None, gt=0)
    comments: Optional[str] = Field(None, max_length=500)


# Schema for grade in database (response)
class Grade(BaseModel):
    id: UUID4
    tenant_id: UUID4
    student_id: UUID4
    subject_id: Optional[UUID4] = None
    assessment_id: Optional[UUID4] = None
    score: float
    max_score: float
    coefficient: float
    comments: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Computed fields
    percentage: float = 0.0
    weighted_score: float = 0.0

    class Config:
        from_attributes = True


# Schema for list response
class GradeList(BaseModel):
    items: list[Grade]
    total: int
    page: int
    page_size: int
    pages: int
