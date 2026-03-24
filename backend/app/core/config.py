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


def normalize_async_database_url(url: str) -> str:
    if not url:
        return url
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def normalize_sync_database_url(url: str) -> str:
    if not url:
        return url
    if url.startswith("postgresql+psycopg2://"):
        return url
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg2://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg2://", 1)
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
_KEYCLOAK_EXTERNAL_HOSTNAME = get_secret("KEYCLOAK_EXTERNAL_HOSTNAME", "")
_MINIO_EXTERNAL_HOSTNAME = get_secret("MINIO_EXTERNAL_HOSTNAME", "")
_DEFAULT_KEYCLOAK_URL = build_external_service_url(_KEYCLOAK_EXTERNAL_HOSTNAME, "/keycloak") or "http://localhost:8080"
_DEFAULT_KEYCLOAK_ISSUER = build_external_service_url(_KEYCLOAK_EXTERNAL_HOSTNAME, "/keycloak/realms/schoolflow")
_DEFAULT_KEYCLOAK_JWKS_URL = build_external_service_url(
    _KEYCLOAK_EXTERNAL_HOSTNAME,
    "/keycloak/realms/schoolflow/protocol/openid-connect/certs",
)
_DEFAULT_MINIO_ENDPOINT = build_external_service_url(_MINIO_EXTERNAL_HOSTNAME) or "localhost:9000"


class Settings(BaseSettings):
    PROJECT_NAME: str = "SchoolFlow Pro"
    API_V1_STR: str = "/api/v1"

    LOG_LEVEL: str = "INFO"
    BACKEND_CORS_ORIGINS: Union[str, List[str]] = ""

    DATABASE_URL: str = _BASE_DATABASE_URL
    DATABASE_URL_ASYNC: str = get_secret("DATABASE_URL_ASYNC", normalize_async_database_url(_BASE_DATABASE_URL))
    DATABASE_URL_SYNC: str = get_secret("DATABASE_URL_SYNC", normalize_sync_database_url(_BASE_DATABASE_URL))
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40

    KEYCLOAK_EXTERNAL_HOSTNAME: str = _KEYCLOAK_EXTERNAL_HOSTNAME
    KEYCLOAK_URL: str = get_secret("KEYCLOAK_URL", _DEFAULT_KEYCLOAK_URL)
    KEYCLOAK_REALM: str = get_secret("KEYCLOAK_REALM", "schoolflow")
    KEYCLOAK_CLIENT_ID: str = get_secret("KEYCLOAK_CLIENT_ID", "schoolflow-backend")
    KEYCLOAK_CLIENT_SECRET: str = get_secret("KEYCLOAK_CLIENT_SECRET", "")
    KEYCLOAK_ISSUER: str = get_secret(
        "KEYCLOAK_ISSUER",
        _DEFAULT_KEYCLOAK_ISSUER or f"{_DEFAULT_KEYCLOAK_URL}/realms/schoolflow",
    )
    KEYCLOAK_AUDIENCE: str = get_secret("KEYCLOAK_AUDIENCE", "schoolflow-frontend")
    KEYCLOAK_JWKS_URL: str = get_secret(
        "KEYCLOAK_JWKS_URL",
        _DEFAULT_KEYCLOAK_JWKS_URL or f"{_DEFAULT_KEYCLOAK_URL}/realms/schoolflow/protocol/openid-connect/certs",
    )

    MINIO_EXTERNAL_HOSTNAME: str = _MINIO_EXTERNAL_HOSTNAME
    MINIO_ENDPOINT: str = get_secret("MINIO_ENDPOINT", _DEFAULT_MINIO_ENDPOINT)
    MINIO_ACCESS_KEY: str = get_secret("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = get_secret("MINIO_SECRET_KEY", "minioadmin")
    MINIO_SECURE: bool = False
    MINIO_BUCKET: str = get_secret("MINIO_BUCKET", "schoolflow")

    REDIS_URL: str = get_secret("REDIS_URL", "redis://localhost:6379/0")

    DEBUG: bool = os.getenv("DEBUG", "True").lower() == "true"
    APP_NAME: str = "SchoolFlow Pro API"
    APP_VERSION: str = "1.0.0"

    SECRET_KEY: str = get_secret("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        is_debug = os.getenv("DEBUG", "True").lower() == "true"
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

    @field_validator("KEYCLOAK_CLIENT_SECRET", mode="after")
    @classmethod
    def validate_keycloak_secret(cls, v: str) -> str:
        is_debug = os.getenv("DEBUG", "True").lower() == "true"
        if not is_debug and not v:
            raise ValueError(
                "KEYCLOAK_CLIENT_SECRET must be set in production. "
                "Check your Keycloak client configuration."
            )
        return v

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
