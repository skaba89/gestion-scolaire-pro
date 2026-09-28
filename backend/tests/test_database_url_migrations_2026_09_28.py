"""Settings.effective_migrations_url — Postgres non-superuser app role pass.

DATABASE_URL_MIGRATIONS carries the admin connection string alembic uses
once DATABASE_URL_SYNC has been rotated to the restricted app role (see
infra/azure/sql/create_app_role.sql). Unset (the default everywhere
today — local dev, tests, CI, and any environment that hasn't run the
role-creation script yet), it must fall back to DATABASE_URL_SYNC exactly
as before this change, so nothing breaks until an operator deliberately
opts in.
"""
from app.core.config import Settings


class TestEffectiveMigrationsUrl:
    def test_falls_back_to_database_url_sync_when_unset(self, monkeypatch):
        monkeypatch.delenv("DATABASE_URL_MIGRATIONS", raising=False)
        s = Settings(DATABASE_URL_SYNC="postgresql+psycopg://app:pw@host/db", DATABASE_URL_MIGRATIONS="")
        assert s.effective_migrations_url == "postgresql+psycopg://app:pw@host/db"

    def test_uses_database_url_migrations_when_set(self, monkeypatch):
        s = Settings(
            DATABASE_URL_SYNC="postgresql+psycopg://app:pw@host/db",
            DATABASE_URL_MIGRATIONS="postgresql+psycopg://admin:adminpw@host/db",
        )
        assert s.effective_migrations_url == "postgresql+psycopg://admin:adminpw@host/db"

    def test_database_url_migrations_is_normalized_to_psycopg_driver(self):
        s = Settings(
            DATABASE_URL_SYNC="postgresql+psycopg://app:pw@host/db",
            DATABASE_URL_MIGRATIONS="postgresql://admin:adminpw@host/db",
        )
        assert s.DATABASE_URL_MIGRATIONS == "postgresql+psycopg://admin:adminpw@host/db"

    def test_empty_database_url_migrations_normalizes_to_empty(self):
        s = Settings(DATABASE_URL_SYNC="postgresql+psycopg://app:pw@host/db", DATABASE_URL_MIGRATIONS="")
        assert s.DATABASE_URL_MIGRATIONS == ""
