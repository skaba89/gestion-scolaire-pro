"""Worker Redis request budget (incident 2026-10-09).

The managed Redis plan caps the number of requests; ARQ's default 0.5 s
queue polling alone exhausted it and every worker start then failed with
"max requests limit exceeded". These settings bound the idle request rate.
"""
from app.workers.heartbeat import HEARTBEAT_INTERVAL_SECONDS, HEARTBEAT_TTL_SECONDS
from app.workers.tasks import WORKER_POLL_DELAY_SECONDS, WorkerSettings


def test_queue_polling_is_not_left_at_arq_default():
    assert WorkerSettings.poll_delay == WORKER_POLL_DELAY_SECONDS
    assert WORKER_POLL_DELAY_SECONDS >= 5


def test_heartbeat_and_health_check_intervals_are_bounded():
    assert HEARTBEAT_INTERVAL_SECONDS >= 60
    assert WorkerSettings.health_check_interval == HEARTBEAT_INTERVAL_SECONDS
    # A dead worker is still reported MISSING within a few minutes.
    assert HEARTBEAT_TTL_SECONDS <= 300


def _idle_requests_per_day(poll_delay: float) -> float:
    """Rough idle estimate per worker replica: ~2 commands per poll + 2
    writes per heartbeat period (own heartbeat + ARQ health check)."""
    return 86400 / poll_delay * 2 + 86400 / HEARTBEAT_INTERVAL_SECONDS * 2


def test_default_poll_delay_cuts_idle_requests_by_about_90_percent():
    arq_default = _idle_requests_per_day(0.5)
    assert _idle_requests_per_day(WORKER_POLL_DELAY_SECONDS) < arq_default * 0.12


def test_thirty_seconds_fits_a_500k_monthly_cap_with_headroom():
    """The documented setting for a capped plan (WORKER_POLL_DELAY_SECONDS=30)
    leaves room for the API's own Redis traffic."""
    assert _idle_requests_per_day(30) * 31 < 500_000 * 0.6


def test_poll_delay_setting_is_bounded():
    import pytest
    from pydantic import ValidationError

    from app.core.config import Settings

    for bad in (0.1, 120):
        with pytest.raises(ValidationError):
            Settings(WORKER_POLL_DELAY_SECONDS=bad)
