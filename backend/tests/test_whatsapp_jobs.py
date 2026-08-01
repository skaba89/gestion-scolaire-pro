"""app/workers/tasks.py — WhatsApp Arq jobs (send_whatsapp_notification,
send_bulk_whatsapp_notifications, retry_failed_notifications,
sync_whatsapp_statuses). No real Arq worker or Meta call — WhatsAppSender
is monkeypatched.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.models.notification_event import NotificationEvent  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import whatsapp_service  # noqa: E402
from app.services.notifications import WhatsAppSender  # noqa: E402
from app.workers.tasks import (  # noqa: E402
    retry_failed_notifications,
    send_bulk_whatsapp_notifications,
    send_whatsapp_notification,
    sync_whatsapp_statuses,
)

CONFIGURED_SETTINGS = {"whatsappAccessToken": "EAAtest", "whatsappPhoneId": "1234567890"}


def _make_tenant(settings: dict | None = None) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Jobs Test", slug=f"wajob-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings=settings or CONFIGURED_SETTINGS,
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str, phone: str = "+224623456789") -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", password_hash="x", first_name="Test", last_name="Parent",
            phone=phone, is_active=True,
        ))
        db.commit()
    return user_id


class TestSendWhatsappNotificationJob:
    @pytest.mark.asyncio
    async def test_success_marks_job_success(self, monkeypatch):
        monkeypatch.setattr(
            WhatsAppSender, "send_smart_full",
            lambda self, to_phone, body, template=None, template_vars=None, language="fr": (True, f"wamid.{uuid.uuid4().hex}", None),
        )
        tenant_id = _make_tenant()
        result = await send_whatsapp_notification(
            {}, tenant_id=tenant_id, event_type="absence_alert", to_phone="+224623456789",
            template_key="absence_alert", body_vars=["A", "B"], fallback_text="Absent",
        )
        assert result["sent"] is True
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "SUCCESS"

    @pytest.mark.asyncio
    async def test_provider_failure_marks_job_failed(self, monkeypatch):
        monkeypatch.setattr(
            WhatsAppSender, "send_smart_full",
            lambda self, to_phone, body, template=None, template_vars=None, language="fr": (False, None, "rate limited"),
        )
        tenant_id = _make_tenant()
        result = await send_whatsapp_notification(
            {}, tenant_id=tenant_id, event_type="grade_alert", to_phone="+224623456789",
            template_key="grade_alert", body_vars=[],
        )
        assert result["sent"] is False
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job.status == "FAILED"

    @pytest.mark.asyncio
    async def test_unexpected_exception_does_not_propagate(self, monkeypatch):
        def _raise(self, to_phone, body, template=None, template_vars=None, language="fr"):
            raise ConnectionError("network down")

        monkeypatch.setattr(WhatsAppSender, "send_smart_full", _raise)
        tenant_id = _make_tenant()
        result = await send_whatsapp_notification(
            {}, tenant_id=tenant_id, event_type="grade_alert", to_phone="+224623456789",
            template_key="grade_alert",
        )
        assert result["sent"] is False
        assert "network down" in result["error"]


class TestSendBulkWhatsappNotificationsJob:
    @pytest.mark.asyncio
    async def test_one_failure_does_not_stop_the_batch(self, monkeypatch):
        calls = {"n": 0}

        def _alternating(self, to_phone, body, template=None, template_vars=None, language="fr"):
            calls["n"] += 1
            if calls["n"] == 1:
                return False, None, "boom"
            return True, f"wamid.{uuid.uuid4().hex}", None

        monkeypatch.setattr(WhatsAppSender, "send_smart_full", _alternating)
        tenant_id = _make_tenant()
        notifications = [
            {"to_phone": "+224600000001", "template_key": "absence_alert", "event_type": "absence_alert"},
            {"to_phone": "+224600000002", "template_key": "absence_alert", "event_type": "absence_alert"},
        ]
        result = await send_bulk_whatsapp_notifications({}, tenant_id=tenant_id, notifications=notifications)
        assert result["sent"] == 1
        assert result["failed"] == 1


class TestRetryFailedNotificationsJob:
    @pytest.mark.asyncio
    async def test_retries_and_resolves_phone_from_live_user_record(self, monkeypatch):
        """Retry must use the LIVE User.phone, not the masked value stored
        on the failed NotificationEvent — this is the whole point of not
        storing the real phone number there."""
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id, phone="+224699999999")

        with SessionLocal() as db:
            event = whatsapp_service.create_pending_event(
                db, tenant_id=tenant_id, event_type="payment_reminder", channel="whatsapp",
                recipient_phone="+224699999999", template_name="payment_reminder_school",
                payload={"body_vars": ["Mariama", "INV-1", "10000", "2026-08-01", "École"]},
                parent_id=parent_id,
            )
            whatsapp_service.mark_event_failed(db, event, "initial failure")

        captured_phone = {}

        def _capture_and_succeed(self, to_phone, body, template=None, template_vars=None, language="fr"):
            captured_phone["to_phone"] = to_phone
            return True, f"wamid.{uuid.uuid4().hex}", None

        monkeypatch.setattr(WhatsAppSender, "send_smart_full", _capture_and_succeed)

        result = await retry_failed_notifications({}, tenant_id=tenant_id)

        assert result["retried"] == 1
        assert captured_phone["to_phone"] == "+224699999999"

    @pytest.mark.asyncio
    async def test_skips_events_past_max_retry_count(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        with SessionLocal() as db:
            event = whatsapp_service.create_pending_event(
                db, tenant_id=tenant_id, event_type="absence_alert", channel="whatsapp",
                template_name="absence_alert_school", parent_id=parent_id,
            )
            event.retry_count = 5
            db.commit()

        result = await retry_failed_notifications({}, tenant_id=tenant_id, max_retry_count=3)
        assert result["retried"] == 0

    @pytest.mark.asyncio
    async def test_skips_event_with_no_resolvable_recipient(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            event = whatsapp_service.create_pending_event(
                db, tenant_id=tenant_id, event_type="absence_alert", channel="whatsapp",
                template_name="absence_alert_school",  # no parent_id/user_id
            )
            whatsapp_service.mark_event_failed(db, event, "no recipient")

        result = await retry_failed_notifications({}, tenant_id=tenant_id)
        assert result["retried"] == 0
        assert result["skipped"] >= 1


class TestSyncWhatsappStatusesJob:
    @pytest.mark.asyncio
    async def test_flags_stale_sent_events(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            event = whatsapp_service.create_pending_event(
                db, tenant_id=tenant_id, event_type="grade_alert", channel="whatsapp",
            )
            whatsapp_service.mark_event_sent(db, event, f"wamid.{uuid.uuid4().hex}")
            # Force it to look old — created 10h ago, still stuck at SENT.
            event.created_at = datetime.now(timezone.utc) - timedelta(hours=10)
            db.commit()

        result = await sync_whatsapp_statuses({}, tenant_id=tenant_id, stale_after_hours=6)
        assert result["stale_count"] == 1

    @pytest.mark.asyncio
    async def test_does_not_flag_recent_sent_events(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            event = whatsapp_service.create_pending_event(
                db, tenant_id=tenant_id, event_type="grade_alert", channel="whatsapp",
            )
            whatsapp_service.mark_event_sent(db, event, f"wamid.{uuid.uuid4().hex}")

        result = await sync_whatsapp_statuses({}, tenant_id=tenant_id, stale_after_hours=6)
        assert result["stale_count"] == 0

    @pytest.mark.asyncio
    async def test_does_not_flag_delivered_events(self):
        tenant_id = _make_tenant()
        mid = f"wamid.{uuid.uuid4().hex}"
        with SessionLocal() as db:
            event = whatsapp_service.create_pending_event(
                db, tenant_id=tenant_id, event_type="grade_alert", channel="whatsapp",
            )
            whatsapp_service.mark_event_sent(db, event, mid)
            whatsapp_service.apply_webhook_status(db, mid, "DELIVERED")
            event.created_at = datetime.now(timezone.utc) - timedelta(hours=10)
            db.commit()

        result = await sync_whatsapp_statuses({}, tenant_id=tenant_id, stale_after_hours=6)
        assert result["stale_count"] == 0
