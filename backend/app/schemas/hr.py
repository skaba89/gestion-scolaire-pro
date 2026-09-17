from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Literal, Optional, List
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
    total_days: int = Field(..., gt=0)
    status: str = "PENDING"
    reason: Optional[str] = None
    employee_id: UUID

    # BUSINESS-RULE FIX (institutional-readiness audit, 2026-09):
    # total_days was a fully independent client-supplied int, never
    # checked against start_date/end_date — payroll/leave-balance
    # calculations relying on it could be fed a number inconsistent with
    # the actual date range.
    @model_validator(mode="after")
    def _dates_and_total_days_consistent(self):
        if self.end_date < self.start_date:
            raise ValueError("La date de fin ne peut pas précéder la date de début")
        span_days = (self.end_date - self.start_date).days + 1
        if self.total_days > span_days:
            raise ValueError(
                f"total_days ({self.total_days}) ne peut pas dépasser la durée du congé ({span_days} jours)"
            )
        return self

class LeaveRequestCreate(LeaveRequestBase):
    pass

class LeaveRequestUpdate(BaseModel):
    # BUSINESS-RULE FIX (institutional-readiness audit, 2026-09): status
    # accepted any string with no allowed-transition enforcement — see
    # crud.hr.update_leave_status() for the PENDING-only transition rule.
    # Restricted to the only two actions the UI ever sends
    # (LeavesTab.tsx handleStatusUpdate).
    status: Optional[Literal["APPROVED", "REJECTED"]] = None
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
