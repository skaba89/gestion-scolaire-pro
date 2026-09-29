"""MFA-related tables (backup codes, email OTPs, TOTP secrets).

These tables were previously created lazily at request time by
app/api/v1/endpoints/core/mfa.py::_ensure_mfa_tables() (removed — see
docs/AZURE_ONE_SHOT_MIGRATIONS.md; the API role has no DDL privileges).
PostgreSQL gets them from Alembic (mfa_backup_codes/email_otps via
20260406_add_mfa_and_perf_indexes.py, mfa_totp_secrets via
20260930_0001_adopt_operational_tables_into_alembic.py). SQLite (local
dev/tests) has no Alembic migration run — its schema comes entirely from
Base.metadata.create_all() — so these models exist to give it the same
tables via the ORM instead. mfa.py itself still talks to these tables via
raw SQL (db.execute(text(...))), not the ORM; these classes only need to
match the existing column set exactly, column-for-column, on both engines.
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from datetime import datetime, timezone

from app.models.base import Base, GUID


class MfaBackupCode(Base):
    __tablename__ = "mfa_backup_codes"

    id = Column(GUID(), primary_key=True)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(GUID(), nullable=True)
    code_hash = Column(String(255), nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class EmailOtp(Base):
    __tablename__ = "email_otps"

    id = Column(GUID(), primary_key=True)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    code_hash = Column(String(255), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_valid = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class MfaTotpSecret(Base):
    __tablename__ = "mfa_totp_secrets"

    id = Column(GUID(), primary_key=True)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    secret = Column(String(64), nullable=False)
    verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
