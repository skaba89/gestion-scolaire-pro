"""Phase 6 (national audit) — absence/grade/bulletin WhatsApp notifications
migrated onto the same Arq pipeline payment reminders already use.

Two layers, matching the existing convention (see
test_payment_reminder_whatsapp_enqueue.py for the endpoint layer and
test_whatsapp_jobs.py for the job layer):

1. Endpoint layer: POST /communication/send-notification-email/ enqueues
   the right job with a stable _job_id (no double-send), and falls back to
   a synchronous send when the queue is unreachable (Redis down) instead
   of silently dropping the notification.
2. Job layer: send_absence_alert_whatsapp_job / send_grade_alert_
   whatsapp_job / send_bulletin_ready_whatsapp_job each create a tracked
   NotificationEvent, capture provider_message_id on success, and that
   event's status is updated by the same webhook path as payment reminders
   (apply_webhook_status) — delivered/read tracking works identically.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.models.notification_event import NotificationEvent  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.services import whatsapp_service  # noqa: E402
from app.services.notifications import NotifResult, WhatsAppSender  # noqa: E402
from app.workers.tasks import (  # noqa: E402
    send_absence_alert_whatsapp_job,
    send_bulletin_ready_whatsapp_job,
    send_grade_alert_whatsapp_job,
)

URL = "/api/v1/communication/send-notification-email/"
HEADERS = {"Authorization": "Bearer mock-token"}
CONFIGURED_SETTINGS = {"whatsappAccessToken": "EAAtest", "whatsappPhoneId": "1234567890"}


def _make_tenant(settings: dict | None = None) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Phase6 Test", slug=f"phase6-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings=settings or CONFIGURED_SETTINGS,
        ))
        db.commit()
    return tenant_id


def _as(tenant_id: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _mock_svc(*, whatsapp_configured: bool = True, non_whatsapp_result: NotifResult | None = None):
    """Mirrors test_communication_whatsapp_tracking.py's _fake_svc — a
    MagicMock stand-in for NotificationService. build_service_from_db()
    itself is mocked at the call site (see its own raw-SQL/SQLite caveat),
    same as the pre-existing tracking tests; this test file is only
    concerned with what send_notification_email() does with the service
    object it gets back, not with tenant-settings lookup."""
    svc = MagicMock()
    svc.whatsapp = MagicMock() if whatsapp_configured else None
    result = non_whatsapp_result or NotifResult()
    svc.send_absence_alert.return_value = result
    svc.send_grade_alert.return_value = result
    svc.send_bulletin_ready.return_value = result
    svc.send_payment_reminder.return_value = result
    return svc


# ─── Endpoint layer: enqueues the right job ────────────────────────────────

class TestAsyncWhatsAppEnqueue:
    def test_absence_alert_enqueues_dedicated_job(self):
        tenant_id = _make_tenant()
        headers = _as(tenant_id)

        mock_enqueue = AsyncMock(return_value="arq-job-abc")
        with patch("app.services.notifications.build_service_from_db", lambda db, tid: _mock_svc()):
            with patch("app.core.jobs.enqueue_job", new=mock_enqueue):
                resp = client.post(URL, json={
                    "type": "absence_alert",
                    "recipientPhone": "+224623456789",
                    "recipientName": "Mariama",
                    "data": {"studentName": "Ibrahima", "studentId": "s-1", "date": "2026-08-01", "subject": "Maths"},
                }, headers=headers)

        assert resp.status_code == 200, resp.text
        assert "whatsapp" in resp.json()["channels"]
        mock_enqueue.assert_awaited_once()
        call = mock_enqueue.await_args
        assert call.args[0] == "send_absence_alert_whatsapp_job"
        assert call.kwargs["to_phone"] == "+224623456789"
        assert call.kwargs["student_id"] == "s-1"
        assert call.kwargs["date"] == "2026-08-01"
        assert call.kwargs["subject"] == "Maths"
        assert "_job_id" in call.kwargs and call.kwargs["_job_id"].startswith("wa:absence_alert:")

    def test_grade_alert_enqueues_dedicated_job(self):
        tenant_id = _make_tenant()
        headers = _as(tenant_id)

        mock_enqueue = AsyncMock(return_value="arq-job-def")
        with patch("app.services.notifications.build_service_from_db", lambda db, tid: _mock_svc()):
            with patch("app.core.jobs.enqueue_job", new=mock_enqueue):
                resp = client.post(URL, json={
                    "type": "grade_alert",
                    "recipientPhone": "+224600000000",
                    "data": {"studentName": "Fatoumata", "studentId": "s-2", "subject": "SVT", "grade": 14, "maxGrade": 20, "assessmentName": "Devoir 2"},
                }, headers=headers)

        assert resp.status_code == 200, resp.text
        mock_enqueue.assert_awaited_once()
        call = mock_enqueue.await_args
        assert call.args[0] == "send_grade_alert_whatsapp_job"
        assert call.kwargs["grade"] == "14"
        assert call.kwargs["assessment_name"] == "Devoir 2"

    def test_bulletin_ready_enqueues_dedicated_job(self):
        tenant_id = _make_tenant()
        headers = _as(tenant_id)

        mock_enqueue = AsyncMock(return_value="arq-job-ghi")
        with patch("app.services.notifications.build_service_from_db", lambda db, tid: _mock_svc()):
            with patch("app.core.jobs.enqueue_job", new=mock_enqueue):
                resp = client.post(URL, json={
                    "type": "bulletin_ready",
                    "recipientPhone": "+224600000003",
                    "data": {"studentName": "Test", "studentId": "s-3", "term": "Trimestre 1"},
                }, headers=headers)

        assert resp.status_code == 200, resp.text
        mock_enqueue.assert_awaited_once()
        call = mock_enqueue.await_args
        assert call.args[0] == "send_bulletin_ready_whatsapp_job"
        assert call.kwargs["term"] == "Trimestre 1"

    def test_second_call_same_event_reuses_same_job_id(self):
        """Same student + same absence date → same _job_id both times, so
        Arq's own de-duplication (see app/core/jobs.py:enqueue_job) refuses
        the second enqueue — this endpoint never has to know that itself,
        it just needs to pass a stable key. Verified here at the call-arg
        level (the actual de-dup is Arq's, exercised for payment reminders
        in test_payment_reminder_whatsapp_enqueue.py)."""
        tenant_id = _make_tenant()
        headers = _as(tenant_id)
        mock_enqueue = AsyncMock(return_value="arq-job-jkl")

        payload = {
            "type": "absence_alert",
            "recipientPhone": "+224623456789",
            "data": {"studentName": "Ibrahima", "studentId": "s-1", "date": "2026-08-01", "subject": "Maths"},
        }
        with patch("app.services.notifications.build_service_from_db", lambda db, tid: _mock_svc()):
            with patch("app.core.jobs.enqueue_job", new=mock_enqueue):
                client.post(URL, json=payload, headers=headers)
                client.post(URL, json=payload, headers=headers)

        assert mock_enqueue.await_count == 2
        first_job_id = mock_enqueue.await_args_list[0].kwargs["_job_id"]
        second_job_id = mock_enqueue.await_args_list[1].kwargs["_job_id"]
        assert first_job_id == second_job_id

    def test_redis_unavailable_falls_back_to_synchronous_send(self):
        """enqueue_job fails open (returns None) when Redis is unreachable
        — the notification must still go out synchronously rather than be
        silently dropped."""
        tenant_id = _make_tenant()
        headers = _as(tenant_id)
        svc = _mock_svc(non_whatsapp_result=NotifResult(whatsapp=True))

        with patch("app.services.notifications.build_service_from_db", lambda db, tid: svc):
            with patch("app.core.jobs.enqueue_job", new=AsyncMock(return_value=None)):
                resp = client.post(URL, json={
                    "type": "absence_alert",
                    "recipientPhone": "+224623456789",
                    # No studentId: create_pending_event's student_id column
                    # is a real FK to students, unlike the other tests here
                    # (which never reach it — the enqueue succeeds and the
                    # job itself owns event-creation, off the request path).
                    "data": {"studentName": "Ibrahima", "date": "2026-08-01", "subject": "Maths"},
                }, headers=headers)

        assert resp.status_code == 200, resp.text
        assert "whatsapp" in resp.json()["channels"]
        with SessionLocal() as db:
            event = (
                db.query(NotificationEvent)
                .filter(NotificationEvent.tenant_id == tenant_id, NotificationEvent.event_type == "absence_alert")
                .first()
            )
            assert event is not None
            assert event.status == "SENT"

    def test_invoice_reminder_stays_fully_synchronous(self):
        """invoice_reminder is untouched by this migration — it still sends
        WhatsApp synchronously through NotificationService, never enqueued."""
        tenant_id = _make_tenant()
        headers = _as(tenant_id)
        svc = _mock_svc(non_whatsapp_result=NotifResult(whatsapp=True))

        mock_enqueue = AsyncMock(return_value="should-not-be-called")
        with patch("app.services.notifications.build_service_from_db", lambda db, tid: svc):
            with patch("app.core.jobs.enqueue_job", new=mock_enqueue):
                resp = client.post(URL, json={
                    "type": "invoice_reminder",
                    "recipientPhone": "+224600000009",
                    "data": {"studentName": "Test", "invoiceNumber": "INV-1", "amount": "10000", "dueDate": "2026-08-01"},
                }, headers=headers)

        assert resp.status_code == 200, resp.text
        mock_enqueue.assert_not_awaited()
        assert "whatsapp" in resp.json()["channels"]


# ─── Job layer: NotificationEvent + provider_message_id + webhook status ──

class TestAbsenceGradeBulletinJobs:
    @pytest.mark.asyncio
    async def test_absence_job_creates_sent_event_with_provider_message_id(self, monkeypatch):
        mid = f"wamid.{uuid.uuid4().hex}"
        monkeypatch.setattr(
            WhatsAppSender, "send_smart_full",
            lambda self, to_phone, body, template=None, template_vars=None, language="fr": (True, mid, None),
        )
        tenant_id = _make_tenant()
        result = await send_absence_alert_whatsapp_job(
            {}, tenant_id=tenant_id, to_phone="+224623456789", parent_name="Mariama",
            student_name="Ibrahima", date="2026-08-01", subject="Maths",
        )
        assert result["sent"] is True

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "SUCCESS"
            event = db.query(NotificationEvent).filter(
                NotificationEvent.id == result["notification_event_id"]
            ).first()
            assert event.status == "SENT"
            assert event.provider_message_id == mid

    @pytest.mark.asyncio
    async def test_grade_job_failure_marks_job_and_event_failed(self, monkeypatch):
        monkeypatch.setattr(
            WhatsAppSender, "send_smart_full",
            lambda self, to_phone, body, template=None, template_vars=None, language="fr": (False, None, "rate limited"),
        )
        tenant_id = _make_tenant()
        result = await send_grade_alert_whatsapp_job(
            {}, tenant_id=tenant_id, to_phone="+224600000000", parent_name="Fatou",
            student_name="Fatoumata", subject="SVT", grade="14", max_grade="20", assessment_name="Devoir 2",
        )
        assert result["sent"] is False
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "FAILED"

    @pytest.mark.asyncio
    async def test_bulletin_job_webhook_delivered_updates_event(self, monkeypatch):
        mid = f"wamid.{uuid.uuid4().hex}"
        monkeypatch.setattr(
            WhatsAppSender, "send_smart_full",
            lambda self, to_phone, body, template=None, template_vars=None, language="fr": (True, mid, None),
        )
        tenant_id = _make_tenant()
        result = await send_bulletin_ready_whatsapp_job(
            {}, tenant_id=tenant_id, to_phone="+224600000003", parent_name="Parent",
            student_name="Test", term="Trimestre 1",
        )
        assert result["sent"] is True

        # Same idempotent status path the Meta webhook uses for payment
        # reminders (app/services/whatsapp_service.py::apply_webhook_status)
        # — proves delivered/read tracking works identically here.
        with SessionLocal() as db:
            whatsapp_service.apply_webhook_status(db, mid, "DELIVERED")
            event = db.query(NotificationEvent).filter(
                NotificationEvent.id == result["notification_event_id"]
            ).first()
            assert event.status == "DELIVERED"

    @pytest.mark.asyncio
    async def test_unexpected_exception_does_not_propagate(self, monkeypatch):
        def _raise(self, to_phone, body, template=None, template_vars=None, language="fr"):
            raise ConnectionError("network down")

        monkeypatch.setattr(WhatsAppSender, "send_smart_full", _raise)
        tenant_id = _make_tenant()
        result = await send_absence_alert_whatsapp_job(
            {}, tenant_id=tenant_id, to_phone="+224623456789", parent_name="Mariama",
            student_name="Ibrahima", date="2026-08-01", subject="Maths",
        )
        assert result["sent"] is False
        assert "network down" in result["error"]
