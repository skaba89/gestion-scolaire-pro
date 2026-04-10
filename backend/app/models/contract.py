from sqlalchemy import Column, String, Date, Float, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.models.base import Base, GUID, TimestampMixin, UUIDMixin, TenantMixin

class Contract(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "employment_contracts"
    
    contract_number = Column(String(50), nullable=False)
    contract_type = Column(String(50), nullable=False) # CDI, CDD, etc.
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)
    trial_period_end = Column(Date)
    job_title = Column(String(100), nullable=False)
    gross_monthly_salary = Column(Float, nullable=False)
    weekly_hours = Column(Float, default=35.0)
    notes = Column(String(1000))
    is_current = Column(Boolean, default=True)
    
    employee_id = Column(GUID(), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    
    # Relationships
    employee = relationship("Employee", back_populates="contracts")
