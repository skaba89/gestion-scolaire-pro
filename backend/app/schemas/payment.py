"""Payment schemas for request/response validation"""
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, UUID4
from app.models.payment import PaymentStatus, PaymentMethod, InvoiceStatus

class StudentMin(BaseModel):
    id: UUID4
    first_name: str
    last_name: str
    registration_number: str
    
    class Config:
        from_attributes = True


# Payment schemas
class PaymentBase(BaseModel):
    amount: float = Field(..., gt=0)
    currency: str = Field(default="GNF", max_length=3)
    payment_date: date
    payment_method: PaymentMethod
    notes: Optional[str] = Field(None, max_length=500)


class PaymentCreate(PaymentBase):
    student_id: UUID4
    invoice_id: Optional[UUID4] = None
    transaction_id: Optional[str] = Field(None, max_length=255)


class PaymentUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    payment_date: Optional[date] = None
    payment_method: Optional[PaymentMethod] = None
    status: Optional[PaymentStatus] = None
    notes: Optional[str] = Field(None, max_length=500)


class Payment(PaymentBase):
    id: UUID4
    tenant_id: UUID4
    student_id: UUID4
    invoice_id: Optional[UUID4]
    status: PaymentStatus
    reference: str
    transaction_id: Optional[str]
    receipt_url: Optional[str]
    students: Optional[StudentMin] = Field(None, alias="student")
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
        populate_by_name = True


class PaymentList(BaseModel):
    items: list[Payment]
    total: int
    page: int
    page_size: int
    pages: int


# Invoice schemas
class InvoiceBase(BaseModel):
    issue_date: date
    due_date: date
    subtotal: float = Field(..., ge=0)
    tax_amount: float = Field(default=0.0, ge=0)
    discount_amount: float = Field(default=0.0, ge=0)
    total_amount: float = Field(..., gt=0)
    currency: str = Field(default="GNF", max_length=3)
    description: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=500)


class InvoiceCreate(InvoiceBase):
    student_id: UUID4
    invoice_number: str = Field(..., min_length=1, max_length=50)


class InvoiceUpdate(BaseModel):
    due_date: Optional[date] = None
    subtotal: Optional[float] = Field(None, ge=0)
    tax_amount: Optional[float] = Field(None, ge=0)
    discount_amount: Optional[float] = Field(None, ge=0)
    total_amount: Optional[float] = Field(None, gt=0)
    status: Optional[InvoiceStatus] = None
    description: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=500)


class Invoice(InvoiceBase):
    id: UUID4
    tenant_id: UUID4
    student_id: UUID4
    invoice_number: str
    status: InvoiceStatus
    amount_paid: float
    pdf_url: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    amount_due: float
    is_paid: bool
    student: Optional[StudentMin] = None
    
    class Config:
        from_attributes = True


class InvoiceList(BaseModel):
    items: list[Invoice]
    total: int
    page: int
    page_size: int
    pages: int
