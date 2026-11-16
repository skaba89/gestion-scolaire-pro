"""Restriction of one staff account to some pedagogical cycles of its tenant.

No row for a user means "no cycle restriction" (validated opt-in model):
existing accounts keep their access. Enforcement lives in
``app.core.cycle_scope``; this table only records the administrator's choice.
"""
from sqlalchemy import Column, ForeignKey, ForeignKeyConstraint, UniqueConstraint

from app.models.base import Base, GUID, TimestampMixin, UUIDMixin


class StaffCycleAssignment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "staff_cycle_assignments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", "cycle_id", name="uq_staff_cycle_assignments_user_cycle"),
        # A cycle of another tenant can never be referenced, even by a bug.
        ForeignKeyConstraint(
            ["tenant_id", "cycle_id"],
            ["education_cycles.tenant_id", "education_cycles.id"],
            name="fk_staff_cycle_assignments_tenant_cycle",
        ),
    )

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    cycle_id = Column(GUID(), nullable=False, index=True)
    assigned_by = Column(GUID(), nullable=True)
