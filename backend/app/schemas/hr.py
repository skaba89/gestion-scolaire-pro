from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime

# --- Employee Schemas ---

class EmployeeBase(BaseModel):
    employee_number: str
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    hire_date: date
    is_active: bool = True
    date_of_birth: Optional[date] = None
    place_of_birth: Optional[str] = None
    nationality: Optional[str] = None
    social_security_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    bank_name: Optional[str] = None
    bank_iban: Optional[str] = None
    bank_bic: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

class EmployeeCreate(EmployeeBase):
    pass

class EmployeeUpdate(BaseModel):
    employee_number: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    hire_date: Optional[date] = None
    is_active: Optional[bool] = None
    date_of_birth: Optional[date] = None
    place_of_birth: Optional[str] = None
    nationality: Optional[str] = None
    social_security_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    bank_name: Optional[str] = None
    bank_iban: Optional[str] = None
    bank_bic: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

class Employee(EmployeeBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Contract Schemas ---

class ContractBase(BaseModel):
    contract_number: str
    contract_type: str
    start_date: date
    end_date: Optional[date] = None
    trial_period_end: Optional[date] = None
    job_title: str
    gross_monthly_salary: float
    weekly_hours: float = 35.0
    notes: Optional[str] = None
    is_current: bool = True
    employee_id: UUID

class ContractCreate(ContractBase):
    pass

class ContractUpdate(BaseModel):
    contract_number: Optional[str] = None
    contract_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    trial_period_end: Optional[date] = None
    job_title: Optional[str] = None
    gross_monthly_salary: Optional[float] = None
    weekly_hours: Optional[float] = None
    notes: Optional[str] = None
    is_current: Optional[bool] = None

class Contract(ContractBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Leave Request Schemas ---

class LeaveRequestBase(BaseModel):
    leave_type: str
    start_date: date
    end_date: date
    total_days: int
    status: str = "PENDING"
    reason: Optional[str] = None
    employee_id: UUID

class LeaveRequestCreate(LeaveRequestBase):
    pass

class LeaveRequestUpdate(BaseModel):
    status: Optional[str] = None
    reviewed_at: Optional[date] = None

class LeaveRequest(LeaveRequestBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime
    reviewed_at: Optional[date] = None

    class Config:
        from_attributes = True

# --- Payslip Schemas ---

class PayslipBase(BaseModel):
    period_month: int
    period_year: int
    gross_salary: float
    net_salary: float
    pay_date: date
    is_final: str = "false"
    pdf_url: Optional[str] = None
    employee_id: UUID

class PayslipCreate(PayslipBase):
    pass

class PayslipUpdate(BaseModel):
    is_final: Optional[str] = None
    pdf_url: Optional[str] = None

class Payslip(PayslipBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
