"""GET/POST /api/v1/whatsapp/webhook/ — Meta Cloud API webhook endpoint.

No JWT (Meta can't obtain one) — these calls go through the real
TestClient with no Authorization header, exercising the actual
TenantMiddleware exemption (backend/app/middlewares/tenant.py) rather than
overriding get_current_user like the authenticated endpoint tests do.
"""
import hashlib
import hmac
import json
import uuid

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.services import whatsapp_service  # noqa: E402

WEBHOOK_URL = "/api/v1/whatsapp/webhook/"


def _make_tenant(**settings) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Webhook Test", slug=f"waweb-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings=settings,
        ))
        db.commit()
    return tenant_id


class TestWebhookIsPublic:
    def test_get_verification_works_without_any_auth_header(self):
        """The core requirement: no Authorization header, no X-Tenant-ID,
        and it still isn't rejected by TenantMiddleware before reaching
        the handler."""
        _make_tenant(whatsappVerifyToken="my-verify-token")
        resp = client.get(WEBHOOK_URL, params={
            "hub.mode": "subscribe", "hub.verify_token": "my-verify-token", "hub.challenge": "12345",
        })
        assert resp.status_code == 200

    def test_post_delivery_works_without_any_auth_header(self):
        resp = client.post(WEBHOOK_URL, json={"entry": []})
        assert resp.status_code == 200


class TestVerifyHandshake:
    def test_correct_token_returns_challenge_as_plain_text(self):
        _make_tenant(whatsappVerifyToken="correct-token-abc")
        resp = client.get(WEBHOOK_URL, params={
            "hub.mode": "subscribe", "hub.verify_token": "correct-token-abc", "hub.challenge": "challenge-xyz",
        })
        assert resp.status_code == 200
        assert resp.text == "challenge-xyz"

    def test_wrong_token_returns_403(self):
        _make_tenant(whatsappVerifyToken="correct-token-def")
        resp = client.get(WEBHOOK_URL, params={
            "hub.mode": "subscribe", "hub.verify_token": "totally-wrong", "hub.challenge": "challenge-xyz",
        })
        assert resp.status_code == 403

    def test_missing_params_returns_403_not_500(self):
        resp = client.get(WEBHOOK_URL)
        assert resp.status_code == 403


class TestPostDelivery:
    def test_valid_status_update_is_processed(self):
        tenant_id = _make_tenant(whatsappAccessToken="x", whatsappPhoneId="9998887770")
        mid = f"wamid.{uuid.uuid4().hex}"
        with SessionLocal() as db:
            event = whatsapp_service.create_pending_event(
                db, tenant_id=tenant_id, event_type="absence_alert", channel="whatsapp",
            )
            whatsapp_service.mark_event_sent(db, event, mid)

        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "9998887770"},
                        "statuses": [{"id": mid, "status": "delivered", "timestamp": "1700000000"}],
                    }
                }]
            }]
        }
        resp = client.post(WEBHOOK_URL, json=payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["processed"] is True
        assert body["statuses_processed"] == 1

    def test_unknown_phone_number_id_still_returns_200(self):
        """A message for a phone number this platform doesn't manage (or a
        tenant that was deleted) must not crash the webhook — Meta will
        keep retrying a non-200 response."""
        payload = {
            "entry": [{"changes": [{"value": {
                "metadata": {"phone_number_id": "0000000000-not-ours"},
                "statuses": [{"id": "wamid.orphan", "status": "sent", "timestamp": "1700000000"}],
            }}]}]
        }
        resp = client.post(WEBHOOK_URL, json=payload)
        assert resp.status_code == 200
        assert resp.json()["processed"] is True

    def test_malformed_json_body_returns_200_not_500(self):
        resp = client.post(
            WEBHOOK_URL,
            content=b"this is not json {{{",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        assert resp.json()["processed"] is False

    def test_empty_entry_list_is_processed_without_error(self):
        resp = client.post(WEBHOOK_URL, json={"entry": []})
        assert resp.status_code == 200
        assert resp.json()["processed"] is True


class TestSignatureVerification:
    def _sign(self, body_bytes: bytes, secret: str) -> str:
        return "sha256=" + hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()

    def test_valid_signature_is_accepted(self):
        secret = "app-secret-123"
        tenant_id = _make_tenant(whatsappAccessToken="x", whatsappPhoneId="5551234567", whatsappAppSecret=secret)
        payload = {"entry": [{"changes": [{"value": {"metadata": {"phone_number_id": "5551234567"}, "statuses": []}}]}]}
        body_bytes = json.dumps(payload).encode()
        signature = self._sign(body_bytes, secret)

        resp = client.post(
            WEBHOOK_URL, content=body_bytes,
            headers={"Content-Type": "application/json", "X-Hub-Signature-256": signature},
        )
        assert resp.status_code == 200
        assert resp.json()["processed"] is True

    def test_invalid_signature_is_rejected(self):
        secret = "app-secret-456"
        _make_tenant(whatsappAccessToken="x", whatsappPhoneId="5551234568", whatsappAppSecret=secret)
        payload = {"entry": [{"changes": [{"value": {"metadata": {"phone_number_id": "5551234568"}, "statuses": []}}]}]}
        body_bytes = json.dumps(payload).encode()

        resp = client.post(
            WEBHOOK_URL, content=body_bytes,
            headers={"Content-Type": "application/json", "X-Hub-Signature-256": "sha256=wrong-signature-entirely"},
        )
        assert resp.status_code == 403

    def test_no_app_secret_configured_skips_verification(self):
        """No whatsappAppSecret configured for this tenant — the event
        must still be processed (documented limitation, not a crash)."""
        tenant_id = _make_tenant(whatsappAccessToken="x", whatsappPhoneId="5551234569")
        payload = {"entry": [{"changes": [{"value": {"metadata": {"phone_number_id": "5551234569"}, "statuses": []}}]}]}
        resp = client.post(WEBHOOK_URL, json=payload)
        assert resp.status_code == 200
        assert resp.json()["processed"] is True
