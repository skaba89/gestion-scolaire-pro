"""POST/PATCH /webhooks/ and webhook delivery — 10th systematic audit
sweep, SSRF via tenant-admin-configurable webhook URL.

WebhookCreate.url/WebhookUpdate.url were typed ``HttpUrl``, which only
checks the string is a well-formed http(s) URL — it never restricted the
resolved host. Combined with POST /webhooks/{id}/test/ (an immediately
triggerable delivery, reachable by any TENANT_ADMIN via the
"auth:manage" permission — not just SUPER_ADMIN) and automatic delivery
on every subscribed domain event, this was a standing, repeatable blind
SSRF primitive: a tenant admin could point a webhook at
http://169.254.169.254/... (cloud metadata) or an internal service and
read the delivery "success" boolean as an oracle.

Fixed by validating the URL's resolved host at both write time
(WebhookCreate/WebhookUpdate field_validator) and delivery time
(_deliver_webhook, defense-in-depth against a hostname resolving
differently by the time a webhook actually fires) — see
app/core/ssrf_protection.py.
"""
import asyncio
import uuid
from unittest.mock import patch

import pytest
from conftest import get_test_client

client = get_test_client()

from app.api.v1.endpoints.core.webhooks import _deliver_webhook  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="webhooks is a raw-DDL table using Postgres TEXT[]/JSONB casts.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

BASE = "/api/v1/webhooks"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant_admin() -> tuple:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Webhook SSRF Test", slug=f"webhook-ssrf-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
    return tenant_id, headers


SSRF_URLS = [
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://127.0.0.1:6379/",
    "http://localhost:5432/",
    "http://10.0.0.5/internal-api",
    "http://192.168.1.1/",
]


class TestCreateWebhookRejectsInternalUrls:
    @pytest.mark.parametrize("bad_url", SSRF_URLS)
    def test_tenant_admin_cannot_register_webhook_pointing_at_internal_host(self, bad_url):
        _tenant_id, headers = _make_tenant_admin()

        resp = client.post(BASE + "/", json={
            "url": bad_url,
            "events": ["student.created"],
        }, headers=headers)
        assert resp.status_code == 422, resp.text

    def test_legitimate_public_url_is_still_accepted(self):
        _tenant_id, headers = _make_tenant_admin()

        resp = client.post(BASE + "/", json={
            "url": "https://example.com/webhook-endpoint",
            "events": ["student.created"],
        }, headers=headers)
        assert resp.status_code == 201, resp.text


class TestUpdateWebhookRejectsInternalUrls:
    def test_cannot_repoint_an_existing_webhook_at_an_internal_host(self):
        _tenant_id, headers = _make_tenant_admin()
        create_resp = client.post(BASE + "/", json={
            "url": "https://example.com/webhook-endpoint",
            "events": ["student.created"],
        }, headers=headers)
        assert create_resp.status_code == 201, create_resp.text
        webhook_id = create_resp.json()["id"]

        resp = client.patch(f"{BASE}/{webhook_id}/", json={
            "url": "http://169.254.169.254/latest/meta-data/",
        }, headers=headers)
        assert resp.status_code == 422, resp.text


class TestDeliverWebhookRefusesInternalUrlsAtDeliveryTime:
    """Defense-in-depth check on _deliver_webhook itself (used both by the
    /test/ endpoint and the automatic event-dispatch path) — proves the
    guard fires even if a row somehow already held an unsafe URL (e.g.
    written before this fix shipped), and that it never reaches the
    network for one."""

    def test_returns_false_without_making_any_http_call(self):
        with patch("httpx.AsyncClient.post") as mock_post:
            result = asyncio.run(
                _deliver_webhook("http://127.0.0.1:9999/x", {"event": "webhook.test"})
            )
        assert result is False
        mock_post.assert_not_called()

    def test_still_delivers_to_a_public_url(self):
        with patch("httpx.AsyncClient.post") as mock_post:
            mock_post.return_value.status_code = 200
            result = asyncio.run(
                _deliver_webhook("https://example.com/hook", {"event": "webhook.test"})
            )
        assert result is True
        mock_post.assert_called_once()
