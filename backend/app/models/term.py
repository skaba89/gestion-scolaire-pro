from sqlalchemy import Column, String, Integer, Date, ForeignKey, Boolean
from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin

class Term(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "terms"
    
    academic_year_id = Column(GUID(), ForeignKey("academic_years.id"), nullable=False)
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    sequence_number = Column(Integer, default=1)
    is_active = Column(Boolean, default=False)
