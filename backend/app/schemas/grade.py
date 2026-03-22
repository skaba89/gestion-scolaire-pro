"""Grade schemas for request/response validation"""
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, UUID4


# Base schema
class GradeBase(BaseModel):
    subject: str = Field(..., min_length=1, max_length=100)
    grade_type: str = Field(..., min_length=1, max_length=50)
    score: float = Field(..., ge=0)
    max_score: float = Field(default=20.0, gt=0)
    coefficient: float = Field(default=1.0, gt=0)
    academic_year: str = Field(..., min_length=1, max_length=20)
    semester: Optional[int] = Field(None, ge=1, le=2)
    trimester: Optional[int] = Field(None, ge=1, le=3)
    exam_date: Optional[date] = None
    comments: Optional[str] = Field(None, max_length=500)


# Schema for creating a grade
class GradeCreate(GradeBase):
    student_id: UUID4


# Schema for updating a grade
class GradeUpdate(BaseModel):
    subject: Optional[str] = Field(None, min_length=1, max_length=100)
    grade_type: Optional[str] = Field(None, min_length=1, max_length=50)
    score: Optional[float] = Field(None, ge=0)
    max_score: Optional[float] = Field(None, gt=0)
    coefficient: Optional[float] = Field(None, gt=0)
    academic_year: Optional[str] = Field(None, min_length=1, max_length=20)
    semester: Optional[int] = Field(None, ge=1, le=2)
    trimester: Optional[int] = Field(None, ge=1, le=3)
    exam_date: Optional[date] = None
    comments: Optional[str] = Field(None, max_length=500)


# Schema for grade in database (response)
class Grade(GradeBase):
    id: UUID4
    tenant_id: UUID4
    student_id: UUID4
    created_at: datetime
    updated_at: datetime
    
    # Computed fields
    percentage: float
    weighted_score: float
    
    class Config:
        from_attributes = True


# Schema for list response
class GradeList(BaseModel):
    items: list[Grade]
    total: int
    page: int
    page_size: int
    pages: int
