"""Bibliothèque — troisième module migré du DDL brut vers Alembic + ORM
(Horizon 2, suite des pilotes clubs/surveys), voir
alembic/versions/20260827_0001_adopt_library_tables.py.

Schéma repris de app/core/operational_tables.py : le CREATE TABLE IF NOT
EXISTS d'origine (colonnes minimales) PLUS toutes les colonnes ajoutées
plus tard via ALTER TABLE ADD COLUMN IF NOT EXISTS sur library_resources
(isbn/copies/urls/tags/featured/public/views_count — jamais présentes
dans le CREATE TABLE d'origine, exactement le même piège que
clubs.meeting_day découvert lors du premier pilote, voir la migration
pour le détail de cette vérification).
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, Integer, Text, ForeignKey, DateTime, Date, JSON
from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class LibraryCategory(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "library_categories"

    name = Column(String(255), nullable=False)
    color = Column(String(50))
    description = Column(String(500))


class LibraryResource(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "library_resources"

    category_id = Column(GUID(), ForeignKey("library_categories.id", ondelete="SET NULL"), index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    author = Column(String(255))
    resource_type = Column(String(100))
    uploaded_by = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"))
    # Colonnes ajoutées après coup via ALTER TABLE (voir docstring du module)
    isbn = Column(String(50))
    total_copies = Column(Integer, default=1)
    available_copies = Column(Integer, default=1)
    file_url = Column(String(1000))
    cover_url = Column(String(1000))
    external_url = Column(String(1000))
    publication_year = Column(Integer)
    # Generic JSON (pas JSONB) — même convention que Survey.options : la
    # vraie colonne de production est JSONB, SQLAlchemy JSON lit/écrit de
    # façon transparente sur PostgreSQL comme sur SQLite.
    tags = Column(JSON, default=list)
    is_featured = Column(Boolean, default=False)
    is_public = Column(Boolean, default=False)
    # Jamais incrémentée par aucun endpoint actuel (vérifié : aucune
    # référence à views_count ailleurs que cette colonne) — conservée
    # pour compatibilité avec LibraryStats/LibraryGrid côté frontend, qui
    # l'affichent déjà.
    views_count = Column(Integer, default=0)


class LibraryBorrowRecord(Base, UUIDMixin, TenantMixin):
    __tablename__ = "library_borrow_records"

    # Pas de FK dans le DDL d'origine (bare UUID columns) — conservé tel
    # quel pour ne rien changer au comportement existant en production.
    resource_id = Column(GUID(), nullable=False, index=True)
    borrowed_by = Column(GUID(), nullable=False, index=True)
    borrowed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    due_date = Column(Date)
    returned_at = Column(DateTime)
    status = Column(String(20), nullable=False, default="BORROWED")
    notes = Column(Text)
