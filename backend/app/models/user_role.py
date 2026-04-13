from sqlalchemy import Column, String, ForeignKey
from app.models.base import Base, UUIDMixin, TimestampMixin, GUID


class UserRole(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "user_roles"

    # tenant_id nullable — SUPER_ADMIN role is not tenant-scoped
    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)

    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(50), nullable=False)
