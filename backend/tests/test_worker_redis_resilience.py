"""Worker ↔ Redis resilience — production incident 2026-10-05/06.

At 03:00 UTC two nights in a row, a slow DNS resolution of the managed
Redis host exceeded Arq's default 1-second connect timeout while the worker
was storing a finished cron job's result. The builtin TimeoutError escaped
Arq's poll loop and killed the worker process (container restarted ~3 min
later, job recorded as failed). These tests pin the retry/timeout policy
that turns such blips into retries instead of a crash — for the worker
only: the API request path must keep failing fast (enqueue_job falls open).
"""
import os
import socket

os.environ.setdefault("BOOTSTRAP_SECRET", "test-bootstrap-secret-key-for-ci-32chars")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-32chars")

import pytest
import redis.asyncio.retry as redis_retry_module

from app.core import jobs as jobs_module


def test_redis_settings_have_connect_timeout_and_retry_policy():
    s = jobs_module.get_worker_redis_settings()
    assert s.conn_timeout >= 10  # Arq default (1s) caused the 03:00 crash
    assert s.retry_on_timeout is True
    assert s.retry is not None
    supported = s.retry._supported_errors
    # The exact error types seen in the production traceback must be retried.
    assert TimeoutError in supported
    assert OSError in supported  # socket.gaierror (DNS) is an OSError
    assert issubclass(socket.gaierror, OSError)


def test_api_enqueue_settings_stay_fast_fail():
    # The API calls enqueue_job() on the HTTP request path: it must fail open
    # quickly (BackgroundTasks fallback), never block a request for a minute.
    s = jobs_module.get_redis_settings()
    assert s.conn_timeout <= 2
    assert s.retry is None


def test_tls_scheme_is_preserved(monkeypatch):
    # Production uses a TLS (rediss://) managed Redis — the hardening must
    # not drop TLS or the host parsed from the DSN.
    monkeypatch.setattr(jobs_module.settings, "REDIS_URL", "rediss://default:not-a-secret@redis.example.test:6379/0")
    s = jobs_module.get_worker_redis_settings()
    assert s.ssl is True
    assert s.host == "redis.example.test"
    assert s.port == 6379
    assert s.conn_timeout >= 10


@pytest.mark.asyncio
@pytest.mark.parametrize("transient_error", [TimeoutError(), socket.gaierror(-3, "Temporary failure in name resolution")])
async def test_retry_survives_transient_connect_errors(monkeypatch, transient_error):
    sleeps = []

    async def _no_sleep(delay):
        sleeps.append(delay)

    # redis-py does `from asyncio import sleep` — patch its own reference.
    monkeypatch.setattr(redis_retry_module, "sleep", _no_sleep)
    retry = jobs_module.get_worker_redis_settings().retry
    calls = {"n": 0}

    async def _flaky_connect():
        calls["n"] += 1
        if calls["n"] < 3:
            raise transient_error
        return "connected"

    async def _on_failure(_error):
        return None

    assert await retry.call_with_retry(_flaky_connect, _on_failure) == "connected"
    assert calls["n"] == 3
    assert len(sleeps) == 2  # backed off between attempts


@pytest.mark.asyncio
async def test_retry_gives_up_after_bounded_attempts(monkeypatch):
    async def _no_sleep(delay):
        return None

    # redis-py does `from asyncio import sleep` — patch its own reference.
    monkeypatch.setattr(redis_retry_module, "sleep", _no_sleep)
    retry = jobs_module.get_worker_redis_settings().retry

    async def _always_down():
        raise TimeoutError()

    async def _on_failure(_error):
        return None

    with pytest.raises(TimeoutError):
        await retry.call_with_retry(_always_down, _on_failure)


def test_worker_uses_hardened_redis_settings():
    from app.workers.tasks import WorkerSettings

    s = WorkerSettings.redis_settings
    assert s.conn_timeout >= 10
    assert s.retry is not None
    assert s.retry_on_timeout is True
