import logging
import os
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def get_secret(secret_name: str, default: str = "") -> str:
    """Read from Docker Secrets first, then environment variable, then default."""
    secret_path = f"/run/secrets/{secret_name}"
    if os.path.exists(secret_path):
        with open(secret_path, "r") as f:
            return f.read().strip()
    return os.getenv(secret_name, default)


class Settings(BaseSettings):
    PROJECT_NAME: str = "SchoolFlow Pro"
    API_V1_STR: str = "/api/v1"

    # Logging
    LOG_LEVEL: str = "INFO"

    # CORS — liste d'origines séparées par virgule ou liste directe
    BACKEND_CORS_ORIGINS: Union[str, List[str]] = ""

    # Database
    DATABASE_URL: str = get_secret("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40

    # Keycloak
    KEYCLOAK_URL: str = get_secret("KEYCLOAK_URL", "http://localhost:8080")
    KEYCLOAK_REALM: str = get_secret("KEYCLOAK_REALM", "schoolflow")
    KEYCLOAK_CLIENT_ID: str = get_secret("KEYCLOAK_CLIENT_ID", "schoolflow-backend")
    KEYCLOAK_CLIENT_SECRET: str = get_secret("KEYCLOAK_CLIENT_SECRET", "")
    KEYCLOAK_ISSUER: str = get_secret("KEYCLOAK_ISSUER", "")
    KEYCLOAK_AUDIENCE: str = get_secret("KEYCLOAK_AUDIENCE", "schoolflow-frontend")
    KEYCLOAK_JWKS_URL: str = get_secret("KEYCLOAK_JWKS_URL", "")

    # MinIO (S3-compatible storage)
    MINIO_ENDPOINT: str = get_secret("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY: str = get_secret("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = get_secret("MINIO_SECRET_KEY", "minioadmin")
    MINIO_SECURE: bool = False
    MINIO_BUCKET: str = get_secret("MINIO_BUCKET", "schoolflow")

    # Redis
    REDIS_URL: str = get_secret("REDIS_URL", "redis://localhost:6379/0")

    # Application
    DEBUG: bool = os.getenv("DEBUG", "True").lower() == "true"
    APP_NAME: str = "SchoolFlow Pro API"
    APP_VERSION: str = "1.0.0"

    # Security — clé vide par défaut (jamais hardcodée)
    SECRET_KEY: str = get_secret("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # ─── Validateurs de sécurité ───────────────────────────────────────────────

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
            # En dev, générer un secret temporaire et avertir
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

# Configure le niveau de log global selon la configuration
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
