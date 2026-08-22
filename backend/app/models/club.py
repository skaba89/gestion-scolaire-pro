"""Clubs et adhésions — pilote de la migration des modules non-ORM
(bibliothèque, inventaire, clubs, sondages, messagerie, forums) vers
Alembic + SQLAlchemy, voir alembic/versions/20260822_0001_adopt_clubs_tables.py.

Schéma repris de app/core/operational_tables.py (DDL brut historique),
FK advisor_id corrigée vers users(id) — voir la migration pour le détail
du correctif appliqué en production après la création initiale.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, Integer, Text, ForeignKey, DateTime
from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Club(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "clubs"

    name = Column(String(255), nullable=False)
    description = Column(Text)
    advisor_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"))
    meeting_day = Column(String(50))
    meeting_time = Column(String(50))
    location = Column(String(255))
    max_members = Column(Integer)
    is_active = Column(Boolean, default=True)


class ClubMembership(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "club_memberships"

    club_id = Column(GUID(), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(GUID(), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50))
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
