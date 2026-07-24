"""Redis-backed async job queue (Arq) — national audit Phase 5.

Foundation for moving heavy/slow work (bulk PDF generation, CSV imports,
SMS/email, ministry reports, payment reminders...) out of the synchronous
request path. FastAPI's BackgroundTasks (used elsewhere in this codebase)
runs in-process and is lost on restart or across multiple API replicas —
Arq persists jobs in Redis (already a hard dependency of this app) so a
restart or a second replica can still pick up pending/retrying work.

Scope of this first pass, deliberately narrow (see docs/ASYNC_JOBS_GUIDE.md
for the full rationale and how to add more task types):
- The queue infrastructure itself (this file + app/workers/).
- A `jobs` table for status visibility (app/models/job.py).
- ONE migrated task (the registration welcome email) as a proven, tested
  pattern — not a mass migration of every BackgroundTasks call in one PR.

Fails open by design: enqueue_job() never raises. If Redis is unreachable,
the caller falls back to its own synchronous/BackgroundTasks path instead
of failing the whole request — consistent with every other Redis-optional
feature in this codebase (blacklist, lockout, session limits...).
"""
import logging
from typing import Any, Optional

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import settings

logger = logging.getLogger(__name__)

_pool: Optional[ArqRedis] = None


def get_redis_settings() -> RedisSettings:
    """Parse the same REDIS_URL used everywhere else in this app (see
    app/core/cache.py) into Arq's connection settings, so the queue and
    the rest of the app always point at the same Redis instance."""
    return RedisSettings.from_dsn(settings.REDIS_URL)


async def get_arq_pool() -> ArqRedis:
    """Lazily create (and cache) the Arq connection pool. Mirrors the
    lazy-singleton pattern already used by app.core.cache.RedisClient."""
    global _pool
    if _pool is None:
        _pool = await create_pool(get_redis_settings())
    return _pool


async def enqueue_job(function_name: str, /, *args: Any, **kwargs: Any) -> Optional[str]:
    """Enqueue a job by task function name. Returns the Arq job id, or None
    if the queue is unreachable (caller must have its own fallback — see
    _send_welcome_email_background's caller in auth.py for the pattern).
    """
    try:
        pool = await get_arq_pool()
        job = await pool.enqueue_job(function_name, *args, **kwargs)
        if job is None:
            # Arq returns None if a job with the same _job_id already exists
            # (deliberate de-duplication) — not an error.
            return None
        return job.job_id
    except Exception as exc:
        logger.warning("Failed to enqueue job %s (Redis unavailable?): %s", function_name, exc)
        return None
