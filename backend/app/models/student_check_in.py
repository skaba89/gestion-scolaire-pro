from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import Base, GUID, TimestampMixin, UUIDMixin, TenantMixin

class StudentCheckIn(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "student_check_ins"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "kiosk_device_id", "client_event_id",
            name="ux_student_check_ins_kiosk_event",
        ),
    )
    
    checked_at = Column(DateTime, nullable=False)
    direction = Column(String(20), default="IN") # IN or OUT
    source = Column(String(50)) # CARD, MANUAL, APP
    
    student_id = Column(GUID(), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)

    # No FK: check_in_sessions is a raw-SQL operational table created at
    # app startup (app/core/operational_tables.py), not by Alembic — see
    # the migration adding this column for why a DB-level FK isn't safe.
    session_id = Column(GUID(), nullable=True, index=True)

    # Stable event identity for unattended classroom tablets. Both values
    # are null for staff/manual pointages, preserving the historical flow.
    # A retry after a lost response reuses client_event_id and is replayed
    # instead of creating a second movement.
    kiosk_device_id = Column(
        GUID(), ForeignKey("kiosk_devices.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    client_event_id = Column(GUID(), nullable=True)

    # Relationships
    student = relationship("Student")
