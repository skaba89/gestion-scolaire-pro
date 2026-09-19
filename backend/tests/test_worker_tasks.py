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
from app.workers.tasks import (
    _job_finished, _job_started, deliver_payment_reminders,
    send_password_reset_email, send_welcome_email,
)


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

    @pytest.mark.asyncio
    async def test_provider_returns_false_marks_job_failed(self, monkeypatch):
        """The exact bug this audit targets: EmailSender.send() returning
        False (both Resend and SMTP declined, no exception raised) must be
        treated as a failure, not silently recorded as SUCCESS."""
        from app.services.notifications import EmailSender

        monkeypatch.setattr(EmailSender, "send", lambda self, to, subject, html, text=None: False)

        tenant_id = _make_tenant()
        result = await send_welcome_email(
            {}, tenant_id=tenant_id, to_email="directeur@ecole.example",
            first_name="Mariama", school_name="École Test", slug="ecole-test",
        )

        assert result["sent"] is False
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "FAILED"

    @pytest.mark.asyncio
    async def test_dashboard_link_uses_full_frontend_url(self, monkeypatch):
        """The link in the welcome email must be built from FRONTEND_URL
        (with scheme) — a bare hostname or a stale localhost:3000 value
        would send new schools a broken onboarding link."""
        from app.core.config import settings
        from app.services.notifications import EmailSender

        captured = {}
        monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.schoolflow.pro")

        def _capture_html(self, to, subject, html, text=None):
            captured["html"] = html
            return True

        monkeypatch.setattr(EmailSender, "send", _capture_html)

        tenant_id = _make_tenant()
        await send_welcome_email(
            {}, tenant_id=tenant_id, to_email="directeur@ecole.example",
            first_name="Ousmane", school_name="École Lien Test", slug="ecole-lien-test",
        )

        assert "https://app.schoolflow.pro/ecole-lien-test/admin/onboarding" in captured["html"]

    @pytest.mark.asyncio
    async def test_never_logs_the_resend_api_key_or_smtp_password(self, monkeypatch, caplog):
        from app.core.config import settings
        from app.services.notifications import EmailSender

        monkeypatch.setattr(settings, "RESEND_API_KEY", "re_super_secret_do_not_log_12345")
        monkeypatch.setattr(settings, "SMTP_PASS", "smtp_super_secret_do_not_log_67890")

        def _raise(self, to, subject, html, text=None):
            raise ConnectionError("provider down (simulated)")

        monkeypatch.setattr(EmailSender, "send", _raise)

        tenant_id = _make_tenant()
        with caplog.at_level("DEBUG"):
            await send_welcome_email(
                {}, tenant_id=tenant_id, to_email="directeur@ecole.example",
                first_name="Fatoumata", school_name="École Secrets Test", slug="ecole-secrets-test",
            )

        log_text = caplog.text
        assert "re_super_secret_do_not_log_12345" not in log_text
        assert "smtp_super_secret_do_not_log_67890" not in log_text


class TestDeliverPaymentRemindersTask:
    """deliver_payment_reminders — national audit Phase 5: the push/email
    half of send-reminders/ moved off in-process BackgroundTasks (see
    _deliver_reminders_background in payments.py, now called from inside
    this task instead of directly from the request path)."""

    @pytest.mark.asyncio
    async def test_success_path_marks_job_success_and_delivers_all(self, monkeypatch):
        from app.services.notifications import NotifResult

        calls = []

        class FakeService:
            whatsapp = None

            def send_payment_reminder(self, **kwargs):
                calls.append(kwargs)
                return NotifResult(email=True)

        monkeypatch.setattr(
            "app.services.notifications.build_service_from_db",
            lambda db, tenant_id: FakeService(),
        )

        tenant_id = _make_tenant()
        deliveries = [
            {"to_email": "parent1@ecole.gn", "invoice_number": "INV-1", "_skip_whatsapp": True},
            {"to_email": "parent2@ecole.gn", "invoice_number": "INV-2", "_skip_whatsapp": True},
        ]
        result = await deliver_payment_reminders({}, tenant_id=tenant_id, deliveries=deliveries)

        assert result["delivered"] == 2
        assert len(calls) == 2
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "SUCCESS"
            assert job.job_type == "deliver_payment_reminders"

    @pytest.mark.asyncio
    async def test_no_notification_service_configured_marks_job_failed(self, monkeypatch):
        """A tenant with no email/WhatsApp settings configured returns None
        from build_service_from_db — must be a recorded failure, not a
        crash (svc.whatsapp/svc.send_payment_reminder on None)."""
        monkeypatch.setattr(
            "app.services.notifications.build_service_from_db",
            lambda db, tenant_id: None,
        )

        tenant_id = _make_tenant()
        result = await deliver_payment_reminders(
            {}, tenant_id=tenant_id, deliveries=[{"to_email": "parent@ecole.gn"}],
        )

        assert result["delivered"] == 0
        assert "error" in result
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "FAILED"

    @pytest.mark.asyncio
    async def test_per_delivery_exception_does_not_fail_whole_batch(self, monkeypatch):
        """_deliver_reminders_background already catches per-delivery
        exceptions and keeps going (see its own docstring) — this task must
        still report the batch as a whole SUCCESS, matching that existing
        fail-soft behavior rather than aborting on the first bad recipient."""
        from app.services.notifications import NotifResult

        class FlakyService:
            whatsapp = None
            calls = 0

            def send_payment_reminder(self, **kwargs):
                self.calls += 1
                if self.calls == 1:
                    raise RuntimeError("provider timeout (simulated)")
                return NotifResult(email=True)

        monkeypatch.setattr(
            "app.services.notifications.build_service_from_db",
            lambda db, tenant_id: FlakyService(),
        )

        tenant_id = _make_tenant()
        deliveries = [
            {"to_email": "bad@ecole.gn", "invoice_number": "INV-1", "_skip_whatsapp": True},
            {"to_email": "good@ecole.gn", "invoice_number": "INV-2", "_skip_whatsapp": True},
        ]
        result = await deliver_payment_reminders({}, tenant_id=tenant_id, deliveries=deliveries)

        assert result["delivered"] == 2
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "SUCCESS"


class TestSendPasswordResetEmailTask:
    """send_password_reset_email — national audit Phase 5: forgot-password's
    reset link delivery moved off in-process BackgroundTasks (see
    _deliver_reset_link_background in auth.py, still the synchronous
    fallback when enqueueing itself fails)."""

    @pytest.mark.asyncio
    async def test_success_path_marks_job_success(self, monkeypatch):
        from app.services.account_provisioning import PasswordSetupDelivery

        captured = {}

        async def _fake_deliver(*, user_id, email, user_name, purpose, expires_in):
            captured.update(user_id=user_id, email=email, purpose=purpose, expires_in=expires_in)
            return PasswordSetupDelivery(token="tok", expires_in=expires_in)

        monkeypatch.setattr(
            "app.services.account_provisioning.deliver_password_setup_link", _fake_deliver,
        )

        result = await send_password_reset_email(
            {}, user_id="u1", email="directeur@ecole.example", user_name="Aïssatou",
        )

        assert result["sent"] is True
        assert captured["purpose"] == "reset"
        assert captured["expires_in"] == 900
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "SUCCESS"
            assert job.job_type == "send_password_reset_email"
            assert job.tenant_id is None  # not tenant-scoped — see _job_started

    @pytest.mark.asyncio
    async def test_delivery_error_marks_job_failed_and_does_not_raise(self, monkeypatch):
        from app.services.account_provisioning import PasswordSetupDeliveryError

        async def _raise(*, user_id, email, user_name, purpose, expires_in):
            raise PasswordSetupDeliveryError("Redis unavailable (simulated)")

        monkeypatch.setattr(
            "app.services.account_provisioning.deliver_password_setup_link", _raise,
        )

        result = await send_password_reset_email(
            {}, user_id="u2", email="directeur@ecole.example", user_name="Ibrahima",
        )

        assert result["sent"] is False
        assert "Redis unavailable" in result["error"]
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "FAILED"
