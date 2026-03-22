from sqlalchemy import Column, String, Integer, Float, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin, UUIDMixin, TenantMixin

class Payslip(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "payslips"
    
    period_month = Column(Integer, nullable=False)
    period_year = Column(Integer, nullable=False)
    gross_salary = Column(Float, nullable=False)
    net_salary = Column(Float, nullable=False)
    pay_date = Column(Date, nullable=False)
    is_final = Column(String(50), default="false") # Matching frontend choice or Boolean
    pdf_url = Column(String(500))
    
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    
    # Relationships
    employee = relationship("Employee", back_populates="payslips")
