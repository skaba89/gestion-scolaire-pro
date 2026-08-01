"""GET /platform/email/health/ and POST /platform/email/test-send/
(Render + Resend production-readiness audit, Phase 5).

SUPER_ADMIN only. /email/health/ must never leak a secret value — only
booleans and derived facts (domain, https presence). /email/test-send/
performs a real send through EmailSender, which is monkeypatched here so
no network call happens in tests.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
SUPER_ADMIN = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}
TENANT_ADMIN = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": str(uuid.uuid4())}


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestEmailHealthAccessControl:
    def test_requires_auth(self):
        resp = client.get("/api/v1/platform/email/health/")
        assert resp.status_code == 401

    def test_tenant_admin_forbidden(self):
        headers = _as(TENANT_ADMIN)
        resp = client.get("/api/v1/platform/email/health/", headers=headers)
        assert resp.status_code == 403


class TestEmailHealthNeverLeaksSecrets:
    def test_response_never_contains_the_resend_key_value(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.RESEND_API_KEY", "re_super_secret_value_123")
        monkeypatch.setattr("app.core.config.settings.SMTP_PASS", "smtp-super-secret-password")

        headers = _as(SUPER_ADMIN)
        resp = client.get("/api/v1/platform/email/health/", headers=headers)

        assert resp.status_code == 200
        body_text = resp.text
        assert "re_super_secret_value_123" not in body_text
        assert "smtp-super-secret-password" not in body_text
        assert "RESEND_API_KEY" not in resp.json()
        assert "SMTP_PASS" not in resp.json()

    def test_reports_resend_configured_true_when_key_present(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.RESEND_API_KEY", "re_test")
        headers = _as(SUPER_ADMIN)
        resp = client.get("/api/v1/platform/email/health/", headers=headers)
        assert resp.json()["resend_configured"] is True

    def test_reports_resend_configured_false_when_key_absent(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.RESEND_API_KEY", "")
        headers = _as(SUPER_ADMIN)
        resp = client.get("/api/v1/platform/email/health/", headers=headers)
        assert resp.json()["resend_configured"] is False

    def test_extracts_from_email_domain(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.FROM_EMAIL", "noreply@kfm-academy.example")
        headers = _as(SUPER_ADMIN)
        resp = client.get("/api/v1/platform/email/health/", headers=headers)
        assert resp.json()["from_email_domain"] == "kfm-academy.example"

    def test_flags_frontend_url_missing_https(self, monkeypatch):
        """This is exactly the localhost:3000-in-production bug found live
        on this project — the health check must be able to catch it."""
        monkeypatch.setattr("app.core.config.settings.FRONTEND_URL", "http://localhost:3000")
        headers = _as(SUPER_ADMIN)
        resp = client.get("/api/v1/platform/email/health/", headers=headers)
        body = resp.json()
        assert body["frontend_url_configured"] is True
        assert body["frontend_url_has_https"] is False

    def test_flags_frontend_url_with_https_as_ok(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.FRONTEND_URL", "https://app.schoolflow.pro")
        headers = _as(SUPER_ADMIN)
        resp = client.get("/api/v1/platform/email/health/", headers=headers)
        assert resp.json()["frontend_url_has_https"] is True


class TestEmailTestSend:
    def test_requires_super_admin(self):
        headers = _as(TENANT_ADMIN)
        resp = client.post(
            "/api/v1/platform/email/test-send/",
            json={"to_email": "someone@example.com"},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_success_returns_sent_true(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.notifications.EmailSender.send",
            lambda self, to, subject, html, text=None: True,
        )
        headers = _as(SUPER_ADMIN)
        resp = client.post(
            "/api/v1/platform/email/test-send/",
            json={"to_email": "someone@example.com"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["sent"] is True

    def test_provider_failure_returns_502_not_a_fake_success(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.notifications.EmailSender.send",
            lambda self, to, subject, html, text=None: False,
        )
        headers = _as(SUPER_ADMIN)
        resp = client.post(
            "/api/v1/platform/email/test-send/",
            json={"to_email": "someone@example.com"},
            headers=headers,
        )
        assert resp.status_code == 502

    def test_rejects_invalid_email_format(self):
        headers = _as(SUPER_ADMIN)
        resp = client.post(
            "/api/v1/platform/email/test-send/",
            json={"to_email": "not-an-email"},
            headers=headers,
        )
        assert resp.status_code == 422
