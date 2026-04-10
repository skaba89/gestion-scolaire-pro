import logging
import os
from typing import List, Union

from dotenv import load_dotenv
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()

logger = logging.getLogger(__name__)


def get_secret(secret_name: str, default: str = "") -> str:
    """Read from Docker Secrets first, then environment variable, then default."""
    secret_path = f"/run/secrets/{secret_name}"
    if os.path.exists(secret_path):
        with open(secret_path, "r", encoding="utf-8") as f:
            return f.read().strip()
    return os.getenv(secret_name, default)


def is_sqlite_url(url: str) -> bool:
    """Check if a database URL uses SQLite."""
    return url.startswith("sqlite:") if url else False


def normalize_async_database_url(url: str) -> str:
    """Normalize a database URL for async connections.

    - PostgreSQL URLs → ``postgresql+psycopg://`` (psycopg v3 async)
    - SQLite URLs → ``sqlite+aiosqlite://``
    - Pass-through for anything already correct or non-PostgreSQL.
    """
    if not url:
        return url

    # SQLite — use aiosqlite for async
    if url.startswith("sqlite://"):
        return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    if url.startswith("sqlite+aiosqlite://"):
        return url

    # PostgreSQL — use psycopg v3
    if url.startswith("postgresql+psycopg://"):
        return url
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


def normalize_sync_database_url(url: str) -> str:
    """Normalize a database URL for synchronous connections.

    - PostgreSQL URLs → ``postgresql+psycopg://`` (psycopg v3 sync)
    - SQLite URLs → ``sqlite://`` (pass-through)
    - Pass-through for anything already correct.
    """
    if not url:
        return url

    # SQLite — pass-through as-is
    if url.startswith("sqlite://"):
        return url

    # PostgreSQL — use psycopg v3
    if url.startswith("postgresql+psycopg://"):
        return url
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


def build_external_service_url(hostname: str, suffix: str = "") -> str:
    hostname = hostname.strip()
    if not hostname:
        return ""
    base = f"https://{hostname}"
    if not suffix:
        return base
    suffix = suffix if suffix.startswith("/") else f"/{suffix}"
    return f"{base}{suffix}"


_BASE_DATABASE_URL = get_secret("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
_MINIO_EXTERNAL_HOSTNAME = get_secret("MINIO_EXTERNAL_HOSTNAME", "")
_DEFAULT_MINIO_ENDPOINT = build_external_service_url(_MINIO_EXTERNAL_HOSTNAME) or "localhost:9000"


class Settings(BaseSettings):
    PROJECT_NAME: str = "SchoolFlow Pro"
    API_V1_STR: str = "/api/v1"

    LOG_LEVEL: str = "INFO"
    BACKEND_CORS_ORIGINS: Union[str, List[str]] = ""

    DATABASE_URL: str = _BASE_DATABASE_URL
    DATABASE_URL_ASYNC: str = get_secret("DATABASE_URL_ASYNC", _BASE_DATABASE_URL)
    DATABASE_URL_SYNC: str = get_secret("DATABASE_URL_SYNC", _BASE_DATABASE_URL)
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40

    @field_validator("DATABASE_URL_ASYNC", "DATABASE_URL_SYNC", mode="before")
    @classmethod
    def _normalize_db_url(cls, v: str, info) -> str:
        """Always normalize database URLs to use the correct driver prefix.

        Ensures that even when DATABASE_URL_SYNC / DATABASE_URL_ASYNC are set
        directly as environment variables (e.g. ``postgresql://...`` on Render),
        they get rewritten to ``postgresql+psycopg://`` so that SQLAlchemy uses
        psycopg v3 instead of the missing psycopg2.
        """
        if not isinstance(v, str):
            return v
        if info.field_name == "DATABASE_URL_ASYNC":
            return normalize_async_database_url(v)
        return normalize_sync_database_url(v)

    @field_validator("DATABASE_POOL_SIZE", "DATABASE_MAX_OVERFLOW", mode="before")
    @classmethod
    def _parse_pool_int(cls, v):
        """Accept empty strings and coerce to int."""
        if isinstance(v, str) and v.strip() == "":
            return None  # fall back to default
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError:
                return None
        return v

    MINIO_EXTERNAL_HOSTNAME: str = _MINIO_EXTERNAL_HOSTNAME
    BACKEND_URL: str = get_secret("BACKEND_URL", "")
    MINIO_ENDPOINT: str = get_secret("MINIO_ENDPOINT", _DEFAULT_MINIO_ENDPOINT)
    MINIO_ACCESS_KEY: str = get_secret("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = get_secret("MINIO_SECRET_KEY", "minioadmin")
    MINIO_SECURE: bool = True  # SECURITY: Default to HTTPS for MinIO connections
    MINIO_BUCKET: str = get_secret("MINIO_BUCKET", "schoolflow")

    REDIS_URL: str = get_secret("REDIS_URL", "redis://localhost:6379/0")

    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    APP_NAME: str = "SchoolFlow Pro API"
    APP_VERSION: str = "1.0.0"

    ADMIN_DEFAULT_EMAIL: str = get_secret("ADMIN_DEFAULT_EMAIL", "admin@schoolflow.local")
    ADMIN_DEFAULT_PASSWORD: str = get_secret("ADMIN_DEFAULT_PASSWORD", "")
    BOOTSTRAP_SECRET: str = get_secret("BOOTSTRAP_SECRET", "")
    SECRET_KEY: str = get_secret("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        is_debug = os.getenv("DEBUG", "False").lower() == "true"
        if not is_debug:
            if not v or len(v) < 32:
                raise ValueError(
                    "SECRET_KEY must be at least 32 characters in production. "
                    "Generate one with: openssl rand -hex 32"
                )
        elif not v:
            import secrets
            generated = secrets.token_hex(32)
            logger.warning(
                "SECRET_KEY not set. Using a temporary key for this session. "
                "Set SECRET_KEY in your .env file for persistence."
            )
            return generated
        return v

    # Groq AI
    GROQ_API_KEY: str = get_secret("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    GROQ_MAX_TOKENS: int = 4096

    @field_validator("GROQ_MAX_TOKENS", mode="before")
    @classmethod
    def _parse_groq_tokens(cls, v):
        """Accept empty strings and coerce to int."""
        if isinstance(v, str) and v.strip() == "":
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError:
                return None
        return v

    @property
    def is_sqlite(self) -> bool:
        """Return True if the configured database is SQLite."""
        return is_sqlite_url(self.DATABASE_URL_SYNC)

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        extra="ignore",
    )


settings = Settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
