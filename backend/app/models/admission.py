from sqlalchemy import Column, String, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base

from app.models.base import GUID

class AdmissionStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CONVERTED_TO_STUDENT = "CONVERTED_TO_STUDENT"

class AdmissionApplication(Base):
    __tablename__ = "admission_applications"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"), nullable=False, index=True)
    academic_year_id = Column(GUID(), ForeignKey("academic_years.id"), nullable=True)
    level_id = Column(GUID(), ForeignKey("levels.id"), nullable=True)
    
    student_first_name = Column(String, nullable=False)
    student_last_name = Column(String, nullable=False)
    student_date_of_birth = Column(DateTime, nullable=True)
    student_gender = Column(String, nullable=True)
    student_address = Column(String, nullable=True)
    student_previous_school = Column(String, nullable=True)
    
    parent_first_name = Column(String, nullable=False)
    parent_last_name = Column(String, nullable=False)
    parent_email = Column(String, nullable=False)
    parent_phone = Column(String, nullable=False)
    parent_address = Column(String, nullable=True)
    parent_occupation = Column(String, nullable=True)
    
    status = Column(Enum(AdmissionStatus), default=AdmissionStatus.DRAFT, nullable=False)
    notes = Column(String, nullable=True)
    documents = Column(JSON, nullable=True)
    
    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(GUID(), ForeignKey("users.id"), nullable=True)
    converted_student_id = Column(GUID(), ForeignKey("students.id"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
