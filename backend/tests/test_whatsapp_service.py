"""app/services/whatsapp_service.py — WhatsApp Cloud API industrialization
(model + service + webhook layer, no HTTP endpoint or Arq job here — see
test_whatsapp_jobs.py for those). No real network call: WhatsAppSender's
Meta HTTP call is monkeypatched throughout.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.models.notification_event import NotificationEvent  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import whatsapp_service  # noqa: E402
from app.services.notifications import WhatsAppSender  # noqa: E402


def _make_tenant(**overrides) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École WhatsApp Test", slug=f"wa-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


CONFIGURED_SETTINGS = {"whatsappAccessToken": "EAAtest123", "whatsappPhoneId": "1234567890"}


class TestMasking:
    def test_mask_phone_keeps_prefix_and_suffix_only(self):
        assert whatsapp_service.mask_phone("224623456789") == "2246******89"

    def test_mask_phone_handles_short_input(self):
        assert whatsapp_service.mask_phone("123") == "***"

    def test_mask_phone_handles_none(self):
        assert whatsapp_service.mask_phone(None) is None

    def test_mask_email_keeps_first_letter_and_domain(self):
        assert whatsapp_service.mask_email("directeur@ecole.gn") == "d***@ecole.gn"

    def test_mask_email_handles_none(self):
        assert whatsapp_service.mask_email(None) is None


class TestSendWhatsappTemplate:
    def test_success_creates_sent_event_with_provider_message_id(self, monkeypatch):
        message_id = f"wamid.{uuid.uuid4().hex}"
        monkeypatch.setattr(
            WhatsAppSender, "send_smart_full",
            lambda self, to_phone, body, template=None, template_vars=None, language="fr": (True, message_id, None),
        )
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            event = whatsapp_service.send_whatsapp_template(
                db, tenant_id=tenant_id, tenant_settings=CONFIGURED_SETTINGS,
                to_phone="+224623456789", template_key="absence_alert", event_type="absence_alert",
                body_vars=["Aïssatou", "Mamadou"], fallback_text="Mamadou était absent",
            )
            assert event.status == "SENT"
            assert event.provider_message_id == message_id
            assert event.channel == "whatsapp"
            # Never store the full phone number, only masked.
            assert event.recipient_phone != "+224623456789"
            assert "623456789" not in (event.recipient_phone or "")

    def test_provider_failure_creates_failed_event(self, monkeypatch):
        monkeypatch.setattr(
            WhatsAppSender, "send_smart_full",
            lambda self, to_phone, body, template=None, template_vars=None, language="fr": (False, None, "Template not approved"),
        )
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            event = whatsapp_service.send_whatsapp_template(
                db, tenant_id=tenant_id, tenant_settings=CONFIGURED_SETTINGS,
                to_phone="+224623456789", template_key="grade_alert", event_type="grade_alert",
            )
            assert event.status == "FAILED"
            assert event.error_reason == "Template not approved"
            assert event.retry_count == 1

    def test_not_configured_fails_without_calling_provider(self, monkeypatch):
        def _fail_if_called(*a, **kw):
            raise AssertionError("Must not call Meta API when WhatsApp isn't configured")

        monkeypatch.setattr(WhatsAppSender, "send_smart_full", _fail_if_called)
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            event = whatsapp_service.send_whatsapp_template(
                db, tenant_id=tenant_id, tenant_settings={}, to_phone="+224623456789",
                template_key="payment_reminder", event_type="payment_reminder",
            )
            assert event.status == "FAILED"
            assert "non configuré" in event.error_reason

    def test_missing_phone_fails_without_calling_provider(self, monkeypatch):
        def _fail_if_called(*a, **kw):
            raise AssertionError("Must not call Meta API without a recipient phone")

        monkeypatch.setattr(WhatsAppSender, "send_smart_full", _fail_if_called)
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            event = whatsapp_service.send_whatsapp_template(
                db, tenant_id=tenant_id, tenant_settings=CONFIGURED_SETTINGS, to_phone="",
                template_key="payment_reminder", event_type="payment_reminder",
            )
            assert event.status == "FAILED"


class TestBusinessWrappers:
    def test_payment_reminder_uses_correct_template_and_event_type(self, monkeypatch):
        captured = {}

        def _capture(self, to_phone, body, template=None, template_vars=None, language="fr"):
            captured["template"] = template
            captured["vars"] = template_vars
            return True, f"wamid.{uuid.uuid4().hex}", None

        monkeypatch.setattr(WhatsAppSender, "send_smart_full", _capture)
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            event = whatsapp_service.send_payment_reminder_whatsapp(
                db, tenant_id=tenant_id, tenant_settings=CONFIGURED_SETTINGS, school_name="École Test",
                to_phone="+224623456789", parent_name="Mariama", student_name="Ibrahima",
                invoice_number="INV-001", amount="500000 GNF", due_date="2026-08-15",
            )
            assert event.event_type == "payment_reminder"
            assert event.template_name == "payment_reminder_school"
        assert captured["template"] == "payment_reminder"

    def test_account_invitation_includes_setup_url_in_vars(self, monkeypatch):
        captured = {}

        def _capture(self, to_phone, body, template=None, template_vars=None, language="fr"):
            captured["vars"] = template_vars
            return True, f"wamid.{uuid.uuid4().hex}", None

        monkeypatch.setattr(WhatsAppSender, "send_smart_full", _capture)
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            event = whatsapp_service.send_account_invitation_whatsapp(
                db, tenant_id=tenant_id, tenant_settings=CONFIGURED_SETTINGS, school_name="École Test",
                to_phone="+224623456789", user_name="Fatoumata", setup_url="https://app.schoolflow.pro/reset-password?token=abc",
            )
            assert event.event_type == "account_invitation"
        assert "https://app.schoolflow.pro/reset-password?token=abc" in captured["vars"]


class TestVerifyWebhook:
    def test_valid_subscribe_returns_challenge(self):
        result = whatsapp_service.verify_webhook("subscribe", "correct-token", "challenge-123", "correct-token")
        assert result == "challenge-123"

    def test_wrong_token_returns_none(self):
        result = whatsapp_service.verify_webhook("subscribe", "wrong-token", "challenge-123", "correct-token")
        assert result is None

    def test_wrong_mode_returns_none(self):
        result = whatsapp_service.verify_webhook("unsubscribe", "correct-token", "challenge-123", "correct-token")
        assert result is None

    def test_no_expected_token_configured_returns_none(self):
        result = whatsapp_service.verify_webhook("subscribe", "anything", "challenge-123", "")
        assert result is None


class TestApplyWebhookStatus:
    def _make_sent_event(self, tenant_id: str, provider_message_id: str) -> NotificationEvent:
        with SessionLocal() as db:
            event = whatsapp_service.create_pending_event(
                db, tenant_id=tenant_id, event_type="absence_alert", channel="whatsapp",
                recipient_phone="+224623456789",
            )
            whatsapp_service.mark_event_sent(db, event, provider_message_id)
            return event

    def test_unknown_message_id_returns_false(self):
        matched = None
        with SessionLocal() as db:
            matched = whatsapp_service.apply_webhook_status(db, "wamid.does-not-exist", "DELIVERED")
        assert matched is False

    def test_advances_sent_to_delivered_to_read(self):
        tenant_id = _make_tenant()
        mid = f"wamid.PROGRESS-{uuid.uuid4().hex}"
        self._make_sent_event(tenant_id, mid)
        with SessionLocal() as db:
            assert whatsapp_service.apply_webhook_status(db, mid, "DELIVERED") is True
            event = db.query(NotificationEvent).filter(NotificationEvent.provider_message_id == mid).first()
            assert event.status == "DELIVERED"
            assert event.delivered_at is not None

            assert whatsapp_service.apply_webhook_status(db, mid, "READ") is True
            db.refresh(event)
            assert event.status == "READ"
            assert event.read_at is not None

    def test_replayed_delivered_after_read_does_not_downgrade(self):
        """Meta doesn't guarantee webhook delivery order — a late/duplicate
        'delivered' arriving after 'read' was already applied must not
        move the status backwards."""
        tenant_id = _make_tenant()
        mid = f"wamid.REPLAY-{uuid.uuid4().hex}"
        self._make_sent_event(tenant_id, mid)
        with SessionLocal() as db:
            whatsapp_service.apply_webhook_status(db, mid, "READ")
            whatsapp_service.apply_webhook_status(db, mid, "DELIVERED")
            event = db.query(NotificationEvent).filter(NotificationEvent.provider_message_id == mid).first()
            assert event.status == "READ"

    def test_duplicate_same_status_is_a_safe_noop(self):
        tenant_id = _make_tenant()
        mid = f"wamid.DUP-{uuid.uuid4().hex}"
        self._make_sent_event(tenant_id, mid)
        with SessionLocal() as db:
            assert whatsapp_service.apply_webhook_status(db, mid, "DELIVERED") is True
            assert whatsapp_service.apply_webhook_status(db, mid, "DELIVERED") is True  # no crash, no error


class TestProcessWebhookEvent:
    def test_processes_status_update_payload(self):
        tenant_id = _make_tenant()
        mid = f"wamid.WEBHOOK1-{uuid.uuid4().hex}"
        with SessionLocal() as db:
            event = whatsapp_service.create_pending_event(
                db, tenant_id=tenant_id, event_type="grade_alert", channel="whatsapp", recipient_phone="+224600000000",
            )
            whatsapp_service.mark_event_sent(db, event, mid)

        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "statuses": [{
                            "id": mid,
                            "status": "delivered",
                            "timestamp": str(int(datetime.now(timezone.utc).timestamp())),
                        }]
                    }
                }]
            }]
        }
        with SessionLocal() as db:
            summary = whatsapp_service.process_webhook_event(db, payload)
        assert summary["statuses_processed"] == 1
        assert summary["errors"] == 0

    def test_unmatched_status_is_counted_not_raised(self):
        payload = {
            "entry": [{"changes": [{"value": {"statuses": [{
                "id": "wamid.NEVER_SENT_BY_US", "status": "delivered", "timestamp": "1700000000",
            }]}}]}]
        }
        with SessionLocal() as db:
            summary = whatsapp_service.process_webhook_event(db, payload)
        assert summary["unmatched"] == 1
        assert summary["errors"] == 0

    def test_inbound_message_is_counted_not_persisted_yet(self):
        payload = {
            "entry": [{"changes": [{"value": {"messages": [{
                "from": "224600000000", "id": "wamid.INBOUND1", "text": {"body": "Bonjour"},
            }]}}]}]
        }
        with SessionLocal() as db:
            summary = whatsapp_service.process_webhook_event(db, payload)
        assert summary["messages_seen"] == 1

    def test_malformed_payload_never_raises(self):
        with SessionLocal() as db:
            summary = whatsapp_service.process_webhook_event(db, {})
            assert summary["statuses_processed"] == 0
            summary = whatsapp_service.process_webhook_event(db, {"entry": "not-a-list-of-dicts"})
        # AttributeError on iterating a string would surface as a crash if
        # not guarded — asserting we got here at all is the real assertion.

    def test_malformed_status_entry_is_skipped_not_raised(self):
        payload = {"entry": [{"changes": [{"value": {"statuses": [{"status": "delivered"}]}}]}]}  # no "id"
        with SessionLocal() as db:
            summary = whatsapp_service.process_webhook_event(db, payload)
        assert summary["statuses_processed"] == 0
        assert summary["errors"] == 0
