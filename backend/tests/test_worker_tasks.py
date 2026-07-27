"""app/workers/tasks.py — was at 0% test coverage (national audit, dette
technique). Covers job-status bookkeeping (_job_started/_job_finished) and
the send_welcome_email task's success and failure paths, without a real
Arq worker or SMTP/Resend call (EmailSender.send is monkeypatched).
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.models.job import Job
from app.models.tenant import Tenant
from app.workers.tasks import _job_finished, _job_started, send_welcome_email


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Worker Test", slug=f"worker-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


class TestJobStartedFinished:
    def test_job_started_creates_running_job(self):
        tenant_id = _make_tenant()
        job_id = _job_started("send_welcome_email", tenant_id, {"to_email": "a@b.com"})

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == job_id).first()
            assert job is not None
            assert job.status == "RUNNING"
            assert job.job_type == "send_welcome_email"
            assert job.payload == {"to_email": "a@b.com"}
            assert job.started_at is not None
            assert job.finished_at is None

    def test_job_started_accepts_no_tenant(self):
        """tenant_id is nullable — platform-level jobs (e.g. a future
        ministry export spanning tenants) must not require one."""
        job_id = _job_started("platform_job", None, {})
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == job_id).first()
            assert job.tenant_id is None

    def test_job_finished_success_records_result(self):
        tenant_id = _make_tenant()
        job_id = _job_started("send_welcome_email", tenant_id, {})

        _job_finished(job_id, success=True, result={"sent_to": "a@b.com"})

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == job_id).first()
            assert job.status == "SUCCESS"
            assert job.result == {"sent_to": "a@b.com"}
            assert job.error is None
            assert job.finished_at is not None

    def test_job_finished_failure_records_error(self):
        tenant_id = _make_tenant()
        job_id = _job_started("send_welcome_email", tenant_id, {})

        _job_finished(job_id, success=False, error="SMTP timeout")

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == job_id).first()
            assert job.status == "FAILED"
            assert job.error == "SMTP timeout"

    def test_job_finished_is_a_noop_for_unknown_job_id(self):
        """Must never raise — a race between job cleanup and completion
        should degrade silently, not crash the worker."""
        _job_finished(str(uuid.uuid4()), success=True, result={})  # no exception


class TestSendWelcomeEmailTask:
    @pytest.mark.asyncio
    async def test_success_path_marks_job_success_and_returns_sent_true(self, monkeypatch):
        from app.services.notifications import EmailSender

        captured = {}

        def _fake_send(self, to, subject, html, text=None):
            captured["to"] = to
            captured["subject"] = subject
            return True

        monkeypatch.setattr(EmailSender, "send", _fake_send)

        tenant_id = _make_tenant()
        result = await send_welcome_email(
            {}, tenant_id=tenant_id, to_email="directeur@ecole.example",
            first_name="Aïssatou", school_name="Lycée Test", slug="lycee-test",
        )

        assert result["sent"] is True
        assert captured["to"] == "directeur@ecole.example"
        assert "Lycée Test" in captured["subject"]

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "SUCCESS"
            assert job.result == {"sent_to": "directeur@ecole.example"}

    @pytest.mark.asyncio
    async def test_failure_path_marks_job_failed_and_returns_sent_false(self, monkeypatch):
        """If the email provider raises (e.g. SMTP unreachable), the task
        must not propagate the exception — it's caught, recorded on the
        job, and returned as a structured failure so Arq doesn't treat a
        transient provider outage as a crash needing max_tries retries for
        no reason beyond what's already configured."""
        from app.services.notifications import EmailSender

        def _raise(self, to, subject, html, text=None):
            raise ConnectionError("SMTP unreachable (simulated)")

        monkeypatch.setattr(EmailSender, "send", _raise)

        tenant_id = _make_tenant()
        result = await send_welcome_email(
            {}, tenant_id=tenant_id, to_email="directeur@ecole.example",
            first_name="Ibrahima", school_name="Collège Test", slug="college-test",
        )

        assert result["sent"] is False
        assert "SMTP unreachable" in result["error"]

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "FAILED"
            assert "SMTP unreachable" in job.error
