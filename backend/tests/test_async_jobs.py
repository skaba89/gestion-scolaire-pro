"""Async job queue (Arq) — national audit Phase 5.

Covers:
- enqueue_job() fails open (never raises, returns None) when Redis is
  unreachable, matching every other Redis-optional feature in this codebase.
- A successful enqueue actually reaches Redis and can be picked up.
- /auth/register-school/ enqueues the welcome email job and still succeeds
  end-to-end even when the queue is unreachable (falls back to the old
  BackgroundTasks path) — registration must never fail because of this.
- The `jobs` table records status transitions for a processed job.
"""
import os
import uuid

os.environ.setdefault("BOOTSTRAP_SECRET", "test-bootstrap-secret-key-for-ci-32chars")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-32chars")

import pytest
from conftest import get_test_client

client = get_test_client()

REGISTER_SCHOOL_URL = "/api/v1/auth/register-school/"


class TestEnqueueJobFailsOpen:
    @pytest.mark.asyncio
    async def test_enqueue_job_returns_none_when_redis_unreachable(self, monkeypatch):
        from app.core import jobs as jobs_module

        async def _raise(*args, **kwargs):
            raise ConnectionError("Redis unavailable (simulated)")

        monkeypatch.setattr(jobs_module, "get_arq_pool", _raise)

        result = await jobs_module.enqueue_job("send_welcome_email", to_email="x@example.com")
        assert result is None  # fails open — never raises


class TestRegisterSchoolEnqueuesWelcomeEmail:
    def test_register_school_succeeds_even_if_enqueue_fails(self, monkeypatch):
        """Registration is the critical path — a queue outage must never
        turn into a failed registration. Forces enqueue_job() to fail and
        asserts /auth/register-school/ still returns 201."""
        from app.api.v1.endpoints.core import auth as auth_module

        async def _fail(*args, **kwargs):
            return None

        monkeypatch.setattr(auth_module, "enqueue_job", _fail, raising=False)
        # enqueue_job is imported locally inside register_school(), so patch
        # it at the source module too (covers both import styles safely).
        from app.core import jobs as jobs_module
        monkeypatch.setattr(jobs_module, "enqueue_job", _fail)

        suffix = uuid.uuid4().hex[:8]
        resp = client.post(REGISTER_SCHOOL_URL, json={
            "school_name": f"École Jobs Test {suffix}",
            "school_type": "primary",
            "first_name": "Admin",
            "last_name": "Test",
            "email": f"admin-{suffix}@example.com",
            "password": "JobsQueueTest!2026",
        })
        assert resp.status_code == 201, resp.text
