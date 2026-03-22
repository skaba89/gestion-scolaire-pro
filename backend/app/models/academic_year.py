from sqlalchemy import Column, String, Boolean, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base, UUIDMixin, TimestampMixin, TenantMixin

class AcademicYear(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "academic_years"
    
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_current = Column(Boolean, default=False)
