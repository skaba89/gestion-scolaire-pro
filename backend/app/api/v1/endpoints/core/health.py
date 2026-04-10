import time
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
import redis

from app.core.database import get_db
from app.core.config import settings

router = APIRouter()


class ServiceStatus(BaseModel):
    status: str
    latency_ms: float | None = None
    detail: str | None = None


class HealthResponse(BaseModel):
    status: str
    database: ServiceStatus
    redis: ServiceStatus


def _check_database(db: Session) -> ServiceStatus:
    t0 = time.monotonic()
    try:
        db.execute(text("SELECT 1"))
        return ServiceStatus(status="healthy", latency_ms=round((time.monotonic() - t0) * 1000, 2))
    except Exception as e:
        logging.getLogger(__name__).error("Database health check failed: %s", e)
        return ServiceStatus(status="unhealthy", detail="Database service unavailable")


def _check_redis() -> ServiceStatus:
    t0 = time.monotonic()
    try:
        client = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        client.ping()
        client.close()
        return ServiceStatus(status="healthy", latency_ms=round((time.monotonic() - t0) * 1000, 2))
    except Exception as e:
        logging.getLogger(__name__).error("Redis health check failed: %s", e)
        return ServiceStatus(status="unhealthy", detail="Redis service unavailable")


@router.get("/", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    """
    Health check for all critical services: Database, Redis.
    Returns status and latency for each service.
    Status is 'healthy' when all services are up, 'degraded' otherwise.
    Note: Redis is optional in SQLite dev mode — "degraded" is expected if Redis is not running.
    """
    db_status = _check_database(db)
    redis_status = _check_redis()

    all_healthy = all(
        s.status == "healthy"
        for s in [db_status, redis_status]
    )

    return HealthResponse(
        status="healthy" if all_healthy else "degraded",
        database=db_status,
        redis=redis_status,
    )
