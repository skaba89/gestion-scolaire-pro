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


def parse_int_env(name: str, default: int) -> int:
    """Read an int env var, tolerating unset/empty/invalid values.

    Unlike ``int(os.getenv(name, str(default)))``, this does not crash when
    the variable exists but is set to an empty string (a common state for
    optional env vars left blank in .env files) — it falls back to
    ``default`` instead of raising ValueError at import time.
    """
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("%s invalid: %r — using default %s", name, raw, default)
        return default


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


_BASE_DATABASE_URL = get_secret("DATABASE_URL", "")

# Startup validation: DATABASE_URL must be set in production
if not _BASE_DATABASE_URL and not os.getenv("DEBUG", "False").lower() == "true":
    logger.critical(
        "DATABASE_URL is not configured and DEBUG is not enabled. "
        "The application will not function correctly without a database connection. "
        "Please set the DATABASE_URL environment variable before deploying."
    )

_MINIO_EXTERNAL_HOSTNAME = get_secret("MINIO_EXTERNAL_HOSTNAME", "")
_DEFAULT_MINIO_ENDPOINT = build_external_service_url(_MINIO_EXTERNAL_HOSTNAME) or "localhost:9000"


class Settings(BaseSettings):
    PROJECT_NAME: str = "Academy Guinéenne"
    API_V1_STR: str = "/api/v1"

    LOG_LEVEL: str = "INFO"
    BACKEND_CORS_ORIGINS: Union[str, List[str]] = ""

    DATABASE_URL: str = _BASE_DATABASE_URL
    DATABASE_URL_ASYNC: str = get_secret("DATABASE_URL_ASYNC", _BASE_DATABASE_URL)
    DATABASE_URL_SYNC: str = get_secret("DATABASE_URL_SYNC", _BASE_DATABASE_URL)
    # Pool DB : 10 connexions stables + 20 overflow = 30 max par worker Uvicorn.
    # Render Starter (1 dyno) → 1 worker → 30 connexions max.
    # Render Standard (2+ dynos) → configurer DATABASE_POOL_SIZE=5, MAX_OVERFLOW=10
    # pour rester sous la limite PostgreSQL de 97 connexions (Render managed PG).
    DATABASE_POOL_SIZE: int = parse_int_env("DATABASE_POOL_SIZE", 5)
    DATABASE_MAX_OVERFLOW: int = parse_int_env("DATABASE_MAX_OVERFLOW", 10)

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
    MINIO_ACCESS_KEY: str = get_secret("MINIO_ACCESS_KEY", "")
    MINIO_SECRET_KEY: str = get_secret("MINIO_SECRET_KEY", "")
    MINIO_SECURE: bool = True  # SECURITY: Default to HTTPS for MinIO connections
    MINIO_BUCKET: str = get_secret("MINIO_BUCKET", "schoolflow")

    REDIS_URL: str = get_secret("REDIS_URL", "redis://localhost:6379/0")

    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    APP_NAME: str = "Academy Guinéenne API"
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
        env = os.getenv("ENVIRONMENT", "").lower()
        # SECURITY: Even if DEBUG=true, refuse to start in production/staging environments
        is_prod = env in ("production", "prod", "staging")
        if is_prod:
            if not v or len(v) < 32:
                logger.critical(
                    "SECRET_KEY not set or too short. Refusing to start in %s environment.",
                    env,
                )
                os._exit(1)
        elif not is_debug:
            if not v or len(v) < 32:
                logger.critical(
                    "SECRET_KEY not set or too short. Refusing to start.",
                )
                os._exit(1)
        elif not v:
            import secrets
            generated = secrets.token_hex(32)
            logger.warning(
                "SECRET_KEY not set. Using a temporary key for this session. "
                "Set SECRET_KEY in your .env file for persistence."
            )
            return generated
        return v

    # Security — MFA enforcement for privileged accounts
    # Set ENFORCE_MFA=true in production to require MFA for SUPER_ADMIN/TENANT_ADMIN/DIRECTOR.
    # In non-debug environments this defaults to True; override with ENFORCE_MFA=false only
    # during the initial rollout window.
    ENFORCE_MFA: bool = os.getenv("ENFORCE_MFA", "false" if os.getenv("DEBUG", "False").lower() == "true" else "true").lower() == "true"

    # Stripe Billing
    STRIPE_SECRET_KEY: str = get_secret("STRIPE_SECRET_KEY", "")
    STRIPE_PUBLISHABLE_KEY: str = get_secret("STRIPE_PUBLISHABLE_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = get_secret("STRIPE_WEBHOOK_SECRET", "")
    # Price IDs créés dans le dashboard Stripe (mode test ou live)
    STRIPE_PRICE_STARTER: str = get_secret("STRIPE_PRICE_STARTER", "")   # gratuit / essai
    STRIPE_PRICE_PRO: str = get_secret("STRIPE_PRICE_PRO", "")           # ~29 $/mois
    STRIPE_PRICE_ENTERPRISE: str = get_secret("STRIPE_PRICE_ENTERPRISE", "")  # ~99 $/mois

    # Email (Resend API + SMTP fallback)
    RESEND_API_KEY: str = get_secret("RESEND_API_KEY", "")
    SMTP_HOST: str = get_secret("SMTP_HOST", "")
    SMTP_PORT: int = 587
    SMTP_USER: str = get_secret("SMTP_USER", "")
    SMTP_PASS: str = get_secret("SMTP_PASS", "")
    FROM_EMAIL: str = get_secret("FROM_EMAIL", "noreply@schoolflow.pro")
    FROM_NAME: str = get_secret("FROM_NAME", "SchoolFlow Pro")
    # URL base utilisée dans les emails (lien de reset, etc.)
    FRONTEND_URL: str = get_secret("FRONTEND_URL", "http://localhost:3000")

    # Groq AI
    GROQ_API_KEY: str = get_secret("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    GROQ_MAX_TOKENS: int = 4096

    # OpenRouter AI (alternative / fallback provider)
    OPENROUTER_API_KEY: str = get_secret("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct")
    OPENROUTER_BASE_URL: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

    # Google Gemini (OpenAI-compatible endpoint — fallback provider)
    GEMINI_API_KEY: str = get_secret("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    GEMINI_BASE_URL: str = os.getenv(
        "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai"
    )

    # Zhipu GLM (OpenAI-compatible endpoint — fallback provider)
    GLM_API_KEY: str = get_secret("GLM_API_KEY", "")
    GLM_MODEL: str = os.getenv("GLM_MODEL", "glm-4.6")
    GLM_BASE_URL: str = os.getenv("GLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")

    # Observabilité — Sentry
    SENTRY_DSN: str = get_secret("SENTRY_DSN", "")
    SENTRY_ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    SENTRY_TRACES_SAMPLE_RATE: float = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05"))

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

if not settings.BOOTSTRAP_SECRET:
    if not settings.DEBUG:
        logger.critical(
            "BOOTSTRAP_SECRET is empty and DEBUG is False — refusing to start. "
            "The bootstrap endpoint could be used to create a super-admin account "
            "without authentication. Set BOOTSTRAP_SECRET in your environment."
        )
        raise SystemExit(1)
    else:
        logger.warning("BOOTSTRAP_SECRET is empty — bootstrap endpoint will reject all requests")
elif len(settings.BOOTSTRAP_SECRET) < 32:
    if not settings.DEBUG:
        logger.critical(
            "BOOTSTRAP_SECRET is too short (%d chars, minimum 32 required) and DEBUG is False — refusing to start. "
            "Set a strong BOOTSTRAP_SECRET (at least 32 characters) in your environment.",
            len(settings.BOOTSTRAP_SECRET),
        )
        raise SystemExit(1)
    else:
        logger.warning(
            "BOOTSTRAP_SECRET is too short (%d chars, minimum 32 required). "
            "Set a stronger secret for production.",
            len(settings.BOOTSTRAP_SECRET),
        )

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
