"""Tests pour la configuration et les utilitaires core."""
import os
import pytest


class TestDatabaseUrlNormalization:
    def test_sqlite_url_passthrough(self):
        from app.core.config import normalize_sync_database_url
        url = "sqlite:///./test.db"
        assert normalize_sync_database_url(url) == url

    def test_postgres_plain_becomes_psycopg(self):
        from app.core.config import normalize_sync_database_url
        url = "postgresql://user:pass@host/db"
        result = normalize_sync_database_url(url)
        assert result.startswith("postgresql+psycopg://")

    def test_postgres_heroku_style_becomes_psycopg(self):
        from app.core.config import normalize_sync_database_url
        url = "postgres://user:pass@host/db"
        result = normalize_sync_database_url(url)
        assert result.startswith("postgresql+psycopg://")

    def test_psycopg2_becomes_psycopg3(self):
        from app.core.config import normalize_sync_database_url
        url = "postgresql+psycopg2://user:pass@host/db"
        result = normalize_sync_database_url(url)
        assert "psycopg2" not in result
        assert "postgresql+psycopg://" in result

    def test_sqlite_async_gets_aiosqlite(self):
        from app.core.config import normalize_async_database_url
        url = "sqlite:///./test.db"
        result = normalize_async_database_url(url)
        assert "aiosqlite" in result

    def test_postgres_async_becomes_psycopg(self):
        from app.core.config import normalize_async_database_url
        url = "postgresql://user:pass@host/db"
        result = normalize_async_database_url(url)
        assert result.startswith("postgresql+psycopg://")

    def test_already_normalized_passthrough(self):
        from app.core.config import normalize_sync_database_url
        url = "postgresql+psycopg://user:pass@host/db"
        assert normalize_sync_database_url(url) == url

    def test_empty_url_returns_empty(self):
        from app.core.config import normalize_sync_database_url
        assert normalize_sync_database_url("") == ""


class TestIsSqliteUrl:
    def test_sqlite_detected(self):
        from app.core.config import is_sqlite_url
        assert is_sqlite_url("sqlite:///./test.db") is True

    def test_postgres_not_sqlite(self):
        from app.core.config import is_sqlite_url
        assert is_sqlite_url("postgresql://host/db") is False

    def test_empty_not_sqlite(self):
        from app.core.config import is_sqlite_url
        assert is_sqlite_url("") is False


class TestBuildExternalServiceUrl:
    def test_empty_hostname_returns_empty(self):
        from app.core.config import build_external_service_url
        assert build_external_service_url("") == ""

    def test_hostname_gets_https_prefix(self):
        from app.core.config import build_external_service_url
        result = build_external_service_url("minio.example.com")
        assert result == "https://minio.example.com"

    def test_hostname_with_suffix(self):
        from app.core.config import build_external_service_url
        result = build_external_service_url("minio.example.com", "/bucket")
        assert result == "https://minio.example.com/bucket"

    def test_suffix_without_leading_slash(self):
        from app.core.config import build_external_service_url
        result = build_external_service_url("minio.example.com", "bucket")
        assert result == "https://minio.example.com/bucket"


class TestSettings:
    def test_settings_is_sqlite_property(self):
        from app.core.config import settings
        # In test env, DATABASE_URL is sqlite
        result = settings.is_sqlite
        assert isinstance(result, bool)

    def test_app_version_is_set(self):
        from app.core.config import settings
        assert settings.APP_VERSION

    def test_algorithm_is_hs256(self):
        from app.core.config import settings
        assert settings.ALGORITHM == "HS256"

    def test_project_name_set(self):
        from app.core.config import settings
        assert "Gu" in settings.PROJECT_NAME or "School" in settings.PROJECT_NAME or "Academy" in settings.PROJECT_NAME
