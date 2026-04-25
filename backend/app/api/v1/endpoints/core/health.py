import time
import logging
from typing import Optional
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
import redis as redis_lib

from app.core.database import get_db
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


class ServiceStatus(BaseModel):
    status: str  # "healthy" | "unhealthy" | "degraded"
    latency_ms: Optional[float] = None
    detail: Optional[str] = None


class HealthResponse(BaseModel):
    status: str           # "healthy" | "degraded" | "unhealthy"
    version: str
    environment: str
    uptime_check: str     # timestamp ISO de ce check
    database: ServiceStatus
    redis: ServiceStatus


def _check_database(db: Session) -> ServiceStatus:
    t0 = time.monotonic()
    try:
        db.execute(text("SELECT 1"))
        return ServiceStatus(
            status="healthy",
            latency_ms=round((time.monotonic() - t0) * 1000, 2),
        )
    except Exception as e:
        logger.error("Database health check failed: %s", e)
        return ServiceStatus(status="unhealthy", detail="Database unreachable")


def _check_redis() -> ServiceStatus:
    t0 = time.monotonic()
    try:
        client = redis_lib.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        client.ping()
        client.close()
        return ServiceStatus(
            status="healthy",
            latency_ms=round((time.monotonic() - t0) * 1000, 2),
        )
    except Exception as e:
        logger.warning("Redis health check failed: %s", e)
        # Redis est optionnel en dev SQLite
        status = "degraded" if settings.is_sqlite else "unhealthy"
        return ServiceStatus(status=status, detail="Redis unreachable")


@router.get("/", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    """
    Health check enrichi — vérifie DB, Redis, retourne version et latences.
    Retourne HTTP 200 si tout est healthy, 503 si dégradé ou unhealthy.
    Utilisé par Railway, Netlify, UptimeRobot et le CD pipeline.
    """
    db_status = _check_database(db)
    redis_status = _check_redis()

    all_healthy = all(
        s.status == "healthy"
        for s in [db_status, redis_status]
    )
    any_unhealthy = any(
        s.status == "unhealthy"
        for s in [db_status, redis_status]
    )

    if all_healthy:
        global_status = "healthy"
        http_code = 200
    elif any_unhealthy:
        global_status = "unhealthy"
        http_code = 503
    else:
        global_status = "degraded"
        http_code = 503

    body = HealthResponse(
        status=global_status,
        version=settings.APP_VERSION,
        environment=settings.SENTRY_ENVIRONMENT,
        uptime_check=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        database=db_status,
        redis=redis_status,
    )

    return JSONResponse(
        status_code=http_code,
        content=body.model_dump(),
    )
