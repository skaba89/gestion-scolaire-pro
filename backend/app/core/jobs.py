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
from redis.asyncio.retry import Retry
from redis.backoff import ExponentialBackoff
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.core.config import settings

logger = logging.getLogger(__name__)

_pool: Optional[ArqRedis] = None

# RELIABILITY (production incident, 2026-10-05/06): Arq's defaults are a
# 1-second connect timeout and NO retry. At 03:00 UTC two nights in a row,
# resolving the managed Redis host took longer than that while Arq was
# writing a finished cron job's result (`finish_job`); the TimeoutError is
# not caught anywhere in Arq's poll loop, so it killed the whole worker
# process — App Service restarted the container ~3 minutes later and the job
# was recorded as failed (max retries exceeded) although its database work
# had completed. Transient network/DNS hiccups must be retried, not fatal.
REDIS_CONNECT_TIMEOUT_SECONDS = 10
REDIS_RETRY_ATTEMPTS = 5
# builtin TimeoutError / OSError (DNS gaierror) are raised INSIDE redis-py's
# connect retry loop, before it converts them to its own exception types —
# they must be listed explicitly or the retry never triggers for them.
REDIS_RETRYABLE_ERRORS = (RedisConnectionError, RedisTimeoutError, TimeoutError, OSError)


def get_redis_settings() -> RedisSettings:
    """Parse the same REDIS_URL used everywhere else in this app (see
    app/core/cache.py) into Arq's connection settings, so the queue and
    the rest of the app always point at the same Redis instance.

    Deliberately keeps Arq's fast-fail defaults: this is what the API's
    enqueue_job() uses on the request path, which must fail open quickly
    (and fall back to BackgroundTasks) rather than block an HTTP request
    for a minute of retries. The worker uses get_worker_redis_settings()."""
    return RedisSettings.from_dsn(settings.REDIS_URL)


def get_worker_redis_settings() -> RedisSettings:
    """Same Redis as get_redis_settings(), with a connect timeout and retry
    policy that survive transient DNS/network blips instead of crashing the
    long-running worker process (see the incident comment above)."""
    redis_settings = get_redis_settings()
    redis_settings.conn_timeout = REDIS_CONNECT_TIMEOUT_SECONDS
    redis_settings.retry_on_timeout = True
    redis_settings.retry_on_error = [RedisConnectionError, RedisTimeoutError]
    redis_settings.retry = Retry(
        ExponentialBackoff(cap=10, base=0.5),
        REDIS_RETRY_ATTEMPTS,
        supported_errors=REDIS_RETRYABLE_ERRORS,
    )
    return redis_settings


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
