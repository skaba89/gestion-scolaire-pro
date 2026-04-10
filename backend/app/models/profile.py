from sqlalchemy import Column, String, ForeignKey
from app.models.base import Base, GUID, UUIDMixin, TimestampMixin

class Profile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "profiles"

    id = Column(GUID(), ForeignKey("users.id"), primary_key=True)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"))
    phone = Column(String)
    avatar_url = Column(String)
