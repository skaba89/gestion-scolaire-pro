"""Student model"""
from sqlalchemy import Column, String, Date, Boolean, Integer, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base, UUIDMixin, TimestampMixin, TenantMixin


class Gender(str, enum.Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"


class StudentStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    GRADUATED = "GRADUATED"
    DROPPED_OUT = "DROPPED_OUT"


class Student(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "students"
    
    # Identification
    registration_number = Column(String(50), unique=True, nullable=False, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    date_of_birth = Column(Date, nullable=False)
    gender = Column(SQLEnum(Gender), nullable=False)
    
    # Contact
    email = Column(String(255), index=True)
    phone = Column(String(20))
    address = Column(String(500))
    city = Column(String(100))
    
    # Academic
    level = Column(String(50))  # e.g., "6ème", "Licence 1"
    class_name = Column(String(100))
    academic_year = Column(String(20))
    status = Column(SQLEnum(StudentStatus), default=StudentStatus.ACTIVE)
    
    # Media
    photo_url = Column(String(500))
    
    # Parent/Guardian
    parent_name = Column(String(200))
    parent_phone = Column(String(20))
    parent_email = Column(String(255))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="students", primaryjoin="Student.tenant_id == Tenant.id")
    grades = relationship("Grade", back_populates="student", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="student", cascade="all, delete-orphan")
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"
    
    @property
    def age(self):
        from datetime import date
        today = date.today()
        return today.year - self.date_of_birth.year - (
            (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day)
        )
