from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Faculty(Base, UUIDMixin, TimestampMixin, TenantMixin):
    """Top-level academic division for university-type tenants (LMD module).

    Sits above Department in the hierarchy (Faculty -> Department -> Subject/
    UE) — e.g. "Faculté des Sciences" containing the "Informatique" and
    "Mathématiques" departments. Optional for school-type tenants, which can
    leave departments unattached (faculty_id nullable on Department).
    """
    __tablename__ = "faculties"

    name = Column(String(255), nullable=False)
    code = Column(String(50))
    description = Column(String(500))
    dean_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    dean = relationship("User", foreign_keys=[dean_id])
    departments = relationship("Department", back_populates="faculty")
