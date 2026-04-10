"""Payment and Invoice models"""
from sqlalchemy import Column, String, Float, ForeignKey, Date, Boolean, Integer, Enum as SQLEnum, JSON
from sqlalchemy.orm import relationship
import enum

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"
    REVERSED = "REVERSED"


class PaymentMethod(str, enum.Enum):
    CASH = "CASH"
    BANK_TRANSFER = "BANK_TRANSFER"
    MOBILE_MONEY = "MOBILE_MONEY"
    CARD = "CARD"


class Payment(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "payments"
    
    student_id = Column(GUID(), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id = Column(GUID(), ForeignKey("invoices.id", ondelete="SET NULL"), index=True)
    
    amount = Column(Float, nullable=False)
    currency = Column(String(3), default="GNF")
    payment_date = Column(Date, nullable=False)
    payment_method = Column(SQLEnum(PaymentMethod), nullable=False)
    status = Column(SQLEnum(PaymentStatus), default=PaymentStatus.PENDING)
    
    reference = Column(String(100), unique=True, index=True)
    transaction_id = Column(String(255))
    
    notes = Column(String(500))
    receipt_url = Column(String(500))
    
    # Relationships
    student = relationship("Student", back_populates="payments")
    invoice = relationship("Invoice", back_populates="payments")


class InvoiceStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    SENT = "SENT"
    PARTIAL = "PARTIAL"
    PAID = "PAID"
    OVERDUE = "OVERDUE"
    CANCELLED = "CANCELLED"


class Invoice(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "invoices"
    
    student_id = Column(GUID(), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    
    invoice_number = Column(String(50), unique=True, nullable=False, index=True)
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    
    subtotal = Column(Float, nullable=False)
    tax_amount = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    total_amount = Column(Float, nullable=False)
    paid_amount = Column(Float, default=0.0)
    
    currency = Column(String(3), default="GNF")
    status = Column(SQLEnum(InvoiceStatus), default=InvoiceStatus.DRAFT)
    
    description = Column(String(500))
    notes = Column(String(500))
    items = Column(JSON, default=[])
    has_payment_plan = Column(Boolean, default=False)
    installments_count = Column(Integer, default=1)
    pdf_url = Column(String(500))
    
    # Relationships
    student = relationship("Student")
    payments = relationship("Payment", back_populates="invoice")
    
    @property
    def amount_due(self):
        """Calculate remaining amount due"""
        return self.total_amount - self.paid_amount
    
    @property
    def is_paid(self):
        """Check if invoice is fully paid"""
        return self.paid_amount >= self.total_amount
