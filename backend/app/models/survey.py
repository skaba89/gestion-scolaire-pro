"""Sondages — deuxième module migré du DDL brut vers Alembic + ORM
(Horizon 2, suite du pilote clubs), voir
alembic/versions/20260823_0001_adopt_surveys_tables.py.

Schéma repris de app/core/operational_tables.py, created_by corrigé vers
users(id) (même correctif historique que clubs.advisor_id — voir la
migration pour le détail).
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, Integer, Text, ForeignKey, DateTime, JSON
from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Survey(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "surveys"

    title = Column(String(500), nullable=False)
    description = Column(Text)
    target_audience = Column(String(100), default="ALL")
    is_anonymous = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    starts_at = Column(DateTime(timezone=True))
    ends_at = Column(DateTime(timezone=True))
    created_by = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"))


class SurveyQuestion(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "survey_questions"

    survey_id = Column(GUID(), ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    question_type = Column(String(50), nullable=False)
    # Generic JSON (not JSONB) — matches the codebase's existing convention
    # (see e.g. Tenant.settings) for a column that must work identically on
    # PostgreSQL and SQLite; the real production column is JSONB, but
    # SQLAlchemy's JSON type reads/writes it transparently either way.
    options = Column(JSON)
    order_index = Column(Integer, nullable=False, default=0)
    is_required = Column(Boolean, default=True)


class SurveyResponse(Base, UUIDMixin, TenantMixin):
    __tablename__ = "survey_responses"

    survey_id = Column(GUID(), ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False, index=True)
    # Nullable: anonymous surveys (surveys.is_anonymous=True) never record
    # who responded — never overridden to a real user id for those, on
    # purpose (see crud/survey.py::add_survey_response).
    respondent_id = Column(GUID())
    # One JSON blob per response *session* (all answered questions in one
    # row), not one row per question — the shape the real table has always
    # had. The endpoint that used to assume a
    # question_id/response_text/submitted_by row-per-question shape never
    # matched this table and was completely broken (UndefinedColumn on
    # every insert, on top of a separate `UUID()` call-with-no-args crash
    # before it even got that far) — fixed alongside this migration.
    response_data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
