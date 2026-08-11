from sqlalchemy import Column, String, ForeignKey
from app.models.base import Base, GUID, UUIDMixin, TimestampMixin

class Profile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "profiles"

    id = Column(GUID(), ForeignKey("users.id"), primary_key=True)
    # AUDIT 2026-08: index=True added for consistency with every other
    # tenant-scoped table (RLS filters on this column on every query) —
    # see alembic/versions/20260811_0001_index_profiles_tenant_id.py.
    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    phone = Column(String)
    avatar_url = Column(String)
