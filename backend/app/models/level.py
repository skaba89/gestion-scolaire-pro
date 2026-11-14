from sqlalchemy import Column, String, Integer, ForeignKey, ForeignKeyConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Level(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "levels"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "cycle_id"],
            ["education_cycles.tenant_id", "education_cycles.id"],
            name="fk_levels_tenant_cycle",
        ),
    )
    
    name = Column(String(255), nullable=False)
    code = Column(String(50))
    label = Column(String(255), nullable=True)
    order_index = Column(Integer, default=0)
    cycle_id = Column(GUID(), nullable=True, index=True)
    
    # Relationships
    # Add relationships as needed in the future
