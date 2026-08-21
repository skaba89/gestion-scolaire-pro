"""POST /communication/send-notification-email/ — WhatsApp tracking wiring.

bulletin_ready/payment_reminder still send synchronously here (the
frontend awaits the real result for immediate feedback). absence_alert/
grade_alert were migrated onto the Arq pipeline in Phase 6 (see
communication.py's docstring and test_whatsapp_absence_grade_bulletin_
jobs.py) — the two tests exercising those types below force the enqueue
to fail (`app.core.jobs.enqueue_job` → None) so they deterministically
exercise the endpoint's synchronous fallback path instead of depending on
whether a real Redis happens to be reachable in the test environment
(it is on the CI "Backend Tests (PostgreSQL)" job, which runs a real
Redis service — and isn't on a bare local/SQLite run, which is what let
this pass locally but fail there until this fix).
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.notification_event import NotificationEvent  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.services.notifications import NotifResult  # noqa: E402

URL = "/api/v1/communication/send-notification-email/"
HEADERS = {"Authorization": "Bearer mock-token"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Comm Test", slug=f"comm-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
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


def _fake_svc(*, whatsapp_configured: bool, send_result: NotifResult):
    svc = MagicMock()
    svc.whatsapp = MagicMock() if whatsapp_configured else None
    svc.send_absence_alert.return_value = send_result
    svc.send_grade_alert.return_value = send_result
    svc.send_bulletin_ready.return_value = send_result
    svc.send_payment_reminder.return_value = send_result
    return svc


class TestWhatsAppEventTracking:
    def test_absence_alert_success_creates_sent_event(self, monkeypatch):
        tenant_id = _make_tenant()
        svc = _fake_svc(whatsapp_configured=True, send_result=NotifResult(whatsapp=True))
        monkeypatch.setattr("app.services.notifications.build_service_from_db", lambda db, tid: svc)

        headers = _as(tenant_id)
        with patch("app.core.jobs.enqueue_job", new=AsyncMock(return_value=None)):
            resp = client.post(URL, json={
                "type": "absence_alert",
                "recipientPhone": "+224623456789",
                "recipientName": "Mariama",
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
            assert event.channel == "whatsapp"

    def test_grade_alert_whatsapp_failure_creates_failed_event(self, monkeypatch):
        tenant_id = _make_tenant()
        svc = _fake_svc(
            whatsapp_configured=True,
            send_result=NotifResult(whatsapp=False, email=True, errors=["WhatsApp: template rejected"]),
        )
        monkeypatch.setattr("app.services.notifications.build_service_from_db", lambda db, tid: svc)

        headers = _as(tenant_id)
        with patch("app.core.jobs.enqueue_job", new=AsyncMock(return_value=None)):
            resp = client.post(URL, json={
                "type": "grade_alert",
                "recipientPhone": "+224600000000",
                "recipientEmail": "parent@example.com",
                "data": {"studentName": "Fatoumata", "subject": "SVT", "grade": 14, "maxGrade": 20, "assessmentName": "Devoir 2"},
            }, headers=headers)
        assert resp.status_code == 200, resp.text
        assert "whatsapp" not in resp.json()["channels"]
        assert "email" in resp.json()["channels"]

        with SessionLocal() as db:
            event = (
                db.query(NotificationEvent)
                .filter(NotificationEvent.tenant_id == tenant_id, NotificationEvent.event_type == "grade_alert")
                .first()
            )
            assert event is not None
            assert event.status == "FAILED"
            assert "template rejected" in event.error_reason

    def test_no_phone_number_creates_no_event(self, monkeypatch):
        tenant_id = _make_tenant()
        svc = _fake_svc(whatsapp_configured=True, send_result=NotifResult(email=True))
        monkeypatch.setattr("app.services.notifications.build_service_from_db", lambda db, tid: svc)

        headers = _as(tenant_id)
        resp = client.post(URL, json={
            "type": "bulletin_ready",
            "recipientEmail": "parent@example.com",  # no recipientPhone
            "data": {"studentName": "Test", "term": "Trimestre 1"},
        }, headers=headers)
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            count = (
                db.query(NotificationEvent)
                .filter(NotificationEvent.tenant_id == tenant_id, NotificationEvent.event_type == "bulletin_ready")
                .count()
            )
            assert count == 0

    def test_whatsapp_not_configured_creates_no_event(self, monkeypatch):
        tenant_id = _make_tenant()
        svc = _fake_svc(whatsapp_configured=False, send_result=NotifResult(email=True))
        monkeypatch.setattr("app.services.notifications.build_service_from_db", lambda db, tid: svc)

        headers = _as(tenant_id)
        resp = client.post(URL, json={
            "type": "absence_alert",
            "recipientPhone": "+224600000001",
            "recipientEmail": "parent@example.com",
            "data": {"studentName": "Test", "date": "2026-08-01", "subject": "Physique"},
        }, headers=headers)
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            count = (
                db.query(NotificationEvent)
                .filter(NotificationEvent.tenant_id == tenant_id)
                .count()
            )
            assert count == 0

    def test_generic_email_only_type_creates_no_whatsapp_event(self, monkeypatch):
        """The free-form email composer path (unmatched `type`) — never
        touches WhatsApp at all, must not create a notification_event."""
        tenant_id = _make_tenant()
        svc = MagicMock()
        svc.whatsapp = MagicMock()
        svc.email.send.return_value = True
        monkeypatch.setattr("app.services.notifications.build_service_from_db", lambda db, tid: svc)

        headers = _as(tenant_id)
        resp = client.post(URL, json={
            "type": "custom_email_blast",
            "recipientEmail": "parent@example.com",
            "recipientPhone": "+224600000002",
            "data": {"subject": "Info", "message": "Bonjour"},
        }, headers=headers)
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            count = db.query(NotificationEvent).filter(NotificationEvent.tenant_id == tenant_id).count()
            assert count == 0
