"""User model"""
from sqlalchemy import Column, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship, validates

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    # Override tenant_id as nullable — SUPER_ADMIN platform users have no tenant
    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)

    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=True)
    # NOTE: no "role" column here — authorization lives in user_roles.role.
    # A phantom role column (added without migration) broke every User query
    # on fresh databases (UndefinedColumn at login).
    first_name = Column(String(100))
    last_name = Column(String(100))
    phone = Column(String(20))
    address = Column(String(500))
    occupation = Column(String(100))
    avatar_url = Column(String(500))

    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    mfa_enabled = Column(Boolean, default=False, nullable=False)
    must_change_password = Column(Boolean, default=False, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="users", foreign_keys=[tenant_id])

    @validates("email")
    def _normalize_email(self, _key, value):
        """Emails are unique case-insensitively (uq_users_email_lower,
        migration 20261010_0001) and matched in lowercase at login: store them
        trimmed and lowercased whatever the write path."""
        return value.strip().lower() if isinstance(value, str) else value

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()
