from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base, UUIDMixin, TimestampMixin

class Profile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"))
    phone = Column(String)
    avatar_url = Column(String)
