"""GET/PATCH /notifications/settings/ and POST /notifications/whatsapp/test/
— WhatsApp/notification channel configuration per tenant (Phase 3).

TENANT_ADMIN/DIRECTOR/SUPER_ADMIN only (settings:read/settings:write).
Secrets must never be echoed back — only *Configured booleans.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.notifications import WhatsAppSender  # noqa: E402

SETTINGS_URL = "/api/v1/notifications/settings/"
TEST_SEND_URL = "/api/v1/notifications/whatsapp/test/"
HEADERS = {"Authorization": "Bearer mock-token"}


def _make_tenant(**settings) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Notif Settings Test", slug=f"notifset-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings=settings,
        ))
        db.commit()
    return tenant_id


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_user_identity(tenant_id: str, role: str) -> dict:
    """Real User row (not just a fake JWT-shaped dict) — notification_events
    has a real FK on user_id, matching the fact that a real JWT's `id`
    always belongs to a real user."""
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", password_hash="x", first_name="Test", last_name=role,
            is_active=True,
        ))
        db.commit()
    return {"id": user_id, "roles": [role], "tenant_id": tenant_id}


def _tenant_admin(tenant_id: str) -> dict:
    return _make_user_identity(tenant_id, "TENANT_ADMIN")


def _director(tenant_id: str) -> dict:
    return _make_user_identity(tenant_id, "DIRECTOR")


def _teacher(tenant_id: str) -> dict:
    return _make_user_identity(tenant_id, "TEACHER")


class TestAccessControl:
    def test_requires_auth(self):
        resp = client.get(SETTINGS_URL)
        assert resp.status_code == 401

    def test_teacher_forbidden_from_reading(self):
        tenant_id = _make_tenant()
        headers = _as(_teacher(tenant_id))
        resp = client.get(SETTINGS_URL, headers=headers)
        assert resp.status_code == 403

    def test_teacher_forbidden_from_writing(self):
        tenant_id = _make_tenant()
        headers = _as(_teacher(tenant_id))
        resp = client.patch(SETTINGS_URL, json={"whatsappEnabled": True}, headers=headers)
        assert resp.status_code == 403

    def test_tenant_admin_can_read(self):
        tenant_id = _make_tenant()
        headers = _as(_tenant_admin(tenant_id))
        resp = client.get(SETTINGS_URL, headers=headers)
        assert resp.status_code == 200

    def test_director_can_write(self):
        tenant_id = _make_tenant()
        headers = _as(_director(tenant_id))
        resp = client.patch(SETTINGS_URL, json={"whatsappDefaultLanguage": "fr"}, headers=headers)
        assert resp.status_code == 200


class TestNeverLeaksSecrets:
    def test_get_never_returns_access_token(self):
        tenant_id = _make_tenant(whatsappAccessToken="EAAsupersecret123", whatsappPhoneId="1234567890")
        headers = _as(_tenant_admin(tenant_id))
        resp = client.get(SETTINGS_URL, headers=headers)
        assert resp.status_code == 200
        assert "EAAsupersecret123" not in resp.text
        assert "whatsappAccessToken" not in resp.json()
        assert resp.json()["whatsappConfigured"] is True

    def test_get_never_returns_verify_token_or_app_secret(self):
        tenant_id = _make_tenant(whatsappVerifyToken="my-verify-secret", whatsappAppSecret="my-app-secret")
        headers = _as(_tenant_admin(tenant_id))
        resp = client.get(SETTINGS_URL, headers=headers)
        assert "my-verify-secret" not in resp.text
        assert "my-app-secret" not in resp.text
        body = resp.json()
        assert body["whatsappVerifyTokenConfigured"] is True
        assert body["whatsappAppSecretConfigured"] is True

    def test_patch_response_never_echoes_back_secrets(self):
        tenant_id = _make_tenant()
        headers = _as(_tenant_admin(tenant_id))
        resp = client.patch(SETTINGS_URL, json={"whatsappAccessToken": "brand-new-secret-999"}, headers=headers)
        assert resp.status_code == 200
        assert "brand-new-secret-999" not in resp.text

    def test_not_configured_reports_false(self):
        tenant_id = _make_tenant()
        headers = _as(_tenant_admin(tenant_id))
        resp = client.get(SETTINGS_URL, headers=headers)
        body = resp.json()
        assert body["whatsappConfigured"] is False
        assert body["whatsappVerifyTokenConfigured"] is False


class TestUpdateSettings:
    def test_patch_persists_and_merges_with_existing_settings(self):
        tenant_id = _make_tenant(someUnrelatedKey="keep-me")
        headers = _as(_tenant_admin(tenant_id))
        resp = client.patch(SETTINGS_URL, json={
            "whatsappEnabled": True, "whatsappAccessToken": "tok", "whatsappPhoneId": "555",
        }, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["whatsappEnabled"] is True
        assert resp.json()["whatsappConfigured"] is True

        with SessionLocal() as db:
            tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            assert tenant.settings["whatsappAccessToken"] == "tok"
            assert tenant.settings["someUnrelatedKey"] == "keep-me"  # not clobbered

    def test_rejects_unknown_fields(self):
        tenant_id = _make_tenant()
        headers = _as(_tenant_admin(tenant_id))
        resp = client.patch(SETTINGS_URL, json={"notAnAllowedField": "x"}, headers=headers)
        assert resp.status_code == 422

    def test_patch_is_audited(self):
        from app.models.audit_log import AuditLog

        tenant_id = _make_tenant()
        headers = _as(_tenant_admin(tenant_id))
        client.patch(SETTINGS_URL, json={"whatsappAccessToken": "secret-audit-test"}, headers=headers)

        with SessionLocal() as db:
            entry = (
                db.query(AuditLog)
                .filter(AuditLog.tenant_id == tenant_id, AuditLog.action == "UPDATE_NOTIFICATION_SETTINGS")
                .first()
            )
            assert entry is not None
            # The audited details must never contain the raw secret value.
            assert "secret-audit-test" not in str(entry.details)


class TestWhatsAppTestSend:
    def test_success_returns_sent_true(self, monkeypatch):
        monkeypatch.setattr(
            WhatsAppSender, "send_text_full",
            lambda self, to_phone, body: (True, f"wamid.{uuid.uuid4().hex}", None),
        )
        tenant_id = _make_tenant(whatsappAccessToken="tok", whatsappPhoneId="555")
        headers = _as(_tenant_admin(tenant_id))
        resp = client.post(TEST_SEND_URL, json={"to_phone": "+224623456789"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["sent"] is True

    def test_provider_failure_returns_502(self, monkeypatch):
        monkeypatch.setattr(
            WhatsAppSender, "send_text_full",
            lambda self, to_phone, body: (False, None, "invalid phone number"),
        )
        tenant_id = _make_tenant(whatsappAccessToken="tok", whatsappPhoneId="555")
        headers = _as(_tenant_admin(tenant_id))
        resp = client.post(TEST_SEND_URL, json={"to_phone": "+224600000000"}, headers=headers)
        assert resp.status_code == 502

    def test_not_configured_returns_502_without_calling_provider(self, monkeypatch):
        def _fail_if_called(*a, **kw):
            raise AssertionError("Must not call Meta API when WhatsApp isn't configured")

        monkeypatch.setattr(WhatsAppSender, "send_text_full", _fail_if_called)
        tenant_id = _make_tenant()  # no whatsappAccessToken/whatsappPhoneId
        headers = _as(_tenant_admin(tenant_id))
        resp = client.post(TEST_SEND_URL, json={"to_phone": "+224600000000"}, headers=headers)
        assert resp.status_code == 502

    def test_teacher_forbidden(self):
        tenant_id = _make_tenant(whatsappAccessToken="tok", whatsappPhoneId="555")
        headers = _as(_teacher(tenant_id))
        resp = client.post(TEST_SEND_URL, json={"to_phone": "+224600000000"}, headers=headers)
        assert resp.status_code == 403

    def test_creates_a_notification_event(self, monkeypatch):
        monkeypatch.setattr(
            WhatsAppSender, "send_text_full",
            lambda self, to_phone, body: (True, f"wamid.{uuid.uuid4().hex}", None),
        )
        tenant_id = _make_tenant(whatsappAccessToken="tok", whatsappPhoneId="555")
        headers = _as(_tenant_admin(tenant_id))
        resp = client.post(TEST_SEND_URL, json={"to_phone": "+224600000000"}, headers=headers)
        assert resp.status_code == 200

        from app.models.notification_event import NotificationEvent
        with SessionLocal() as db:
            event = db.query(NotificationEvent).filter(
                NotificationEvent.id == resp.json()["notification_event_id"]
            ).first()
            assert event is not None
            assert event.event_type == "config_test"
            assert event.status == "SENT"
