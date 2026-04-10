from sqlalchemy import Column, String, Boolean, Date, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import Base, GUID, TimestampMixin, UUIDMixin, TenantMixin

class Employee(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "employees"
    
    employee_number = Column(String(50), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255))
    phone = Column(String(50))
    job_title = Column(String(100))
    department = Column(String(100)) # Can be linked to Department model later if needed
    hire_date = Column(Date, nullable=False)
    is_active = Column(Boolean, default=True)
    date_of_birth = Column(Date)
    place_of_birth = Column(String(100))
    nationality = Column(String(100))
    social_security_number = Column(String(100))
    address = Column(String(255))
    city = Column(String(100))
    postal_code = Column(String(20))
    country = Column(String(100))
    bank_name = Column(String(100))
    bank_iban = Column(String(100))
    bank_bic = Column(String(50))
    emergency_contact_name = Column(String(100))
    emergency_contact_phone = Column(String(50))
    
    # Relationships
    contracts = relationship("Contract", back_populates="employee", cascade="all, delete-orphan")
    leave_requests = relationship("LeaveRequest", back_populates="employee", cascade="all, delete-orphan")
    payslips = relationship("Payslip", back_populates="employee", cascade="all, delete-orphan")
