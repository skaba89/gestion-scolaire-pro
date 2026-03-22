"""Student schemas for request/response validation"""
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, UUID4
from app.models.student import Gender, StudentStatus


# Base schema with common fields
class StudentBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    date_of_birth: date
    gender: Gender
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    level: Optional[str] = Field(None, max_length=50)
    class_name: Optional[str] = Field(None, max_length=100)
    academic_year: Optional[str] = Field(None, max_length=20)
    photo_url: Optional[str] = Field(None, max_length=500)
    parent_name: Optional[str] = Field(None, max_length=200)
    parent_phone: Optional[str] = Field(None, max_length=20)
    parent_email: Optional[EmailStr] = None


# Schema for creating a student
class StudentCreate(StudentBase):
    registration_number: str = Field(..., min_length=1, max_length=50)


# Schema for updating a student
class StudentUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    level: Optional[str] = Field(None, max_length=50)
    class_name: Optional[str] = Field(None, max_length=100)
    academic_year: Optional[str] = Field(None, max_length=20)
    status: Optional[StudentStatus] = None
    photo_url: Optional[str] = Field(None, max_length=500)
    parent_name: Optional[str] = Field(None, max_length=200)
    parent_phone: Optional[str] = Field(None, max_length=20)
    parent_email: Optional[EmailStr] = None


# Schema for student in database (response)
class Student(StudentBase):
    id: UUID4
    tenant_id: UUID4
    registration_number: str
    status: StudentStatus
    created_at: datetime
    updated_at: datetime
    
    # Computed fields
    full_name: str
    age: int
    
    class Config:
        from_attributes = True  # Pydantic v2 (was orm_mode in v1)


# Schema for list response with pagination
class StudentList(BaseModel):
    items: list[Student]
    total: int
    page: int
    page_size: int
    pages: int
