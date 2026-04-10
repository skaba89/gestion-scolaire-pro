from sqlalchemy import Column, String, Date, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.models.base import Base, GUID, TimestampMixin, UUIDMixin, TenantMixin

class LeaveRequest(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "leave_requests"
    
    leave_type = Column(String(50), nullable=False) # CONGE_PAYE, MALADIE, etc.
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    total_days = Column(Integer, nullable=False)
    status = Column(String(50), default="PENDING") # PENDING, APPROVED, REJECTED
    reason = Column(Text)
    reviewed_at = Column(Date)
    
    employee_id = Column(GUID(), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    
    # Relationships
    employee = relationship("Employee", back_populates="leave_requests")
