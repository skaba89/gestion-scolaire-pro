"""GET /tenants/settings/ leaked third-party credentials to any
authenticated tenant user (institutional-readiness audit, 2026-09).

tenant.settings is a single flat JSON blob shared by every settings
screen — it also holds real secrets (CinetPay/PayTech payment-gateway API
keys, SMTP password, WhatsApp Cloud API tokens, Resend API key), read
directly from it by app/services/payment_gateways.py,
app/services/notifications.py, and operational/parents.py. This endpoint
had no permission check at all (only get_current_user), so a STUDENT or
PARENT could call it and read those secrets back verbatim — the exact
class of leak every OTHER settings-secret endpoint in this codebase
(GET /notifications/settings/, GET /platform/email/health/) was already
built to avoid, by never returning a secret value at all. Fixed by
redacting the known secret keys for anyone who isn't a settings:write
holder (TENANT_ADMIN/DIRECTOR/SUPER_ADMIN), who still need the real
values to prefill FinanceSettings.tsx/NotificationSettings.tsx's edit
forms.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

SETTINGS_URL = "/api/v1/tenants/settings/"

_SECRETS = {
    "cinetPayApiKey": "cp-live-secret-123",
    "paytechApiKey": "pt-live-key-456",
    "paytechSecretKey": "pt-live-secret-789",
    "smtpPass": "super-secret-smtp-password",
    "resendApiKey": "re_live_abcdef",
    "whatsappAccessToken": "wa-token-xyz",
    "whatsappVerifyToken": "wa-verify-xyz",
    "whatsappAppSecret": "wa-app-secret-xyz",
}
_NON_SECRETS = {
    "logoUrl": "https://cdn.example.com/logo.png",
    "cinetPaySiteId": "12345",  # not secret — id, not a credential
    "quotas": {"max_students": 500},
}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant_with_secrets() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Secrets Test", slug=f"secrets-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True,
            settings={**_SECRETS, **_NON_SECRETS},
        ))
        db.commit()
    return tenant_id


class TestTenantSettingsSecretRedaction:
    @pytest.mark.parametrize("role", ["STUDENT", "PARENT", "TEACHER", "SECRETARY"])
    def test_non_privileged_roles_never_see_secrets(self, role):
        tenant_id = _make_tenant_with_secrets()
        headers = _as({"id": str(uuid.uuid4()), "roles": [role], "tenant_id": tenant_id})

        resp = client.get(SETTINGS_URL, headers=headers)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        for key in _SECRETS:
            assert key not in body, f"{key} leaked to role {role}"

    @pytest.mark.parametrize("role", ["STUDENT", "PARENT", "TEACHER", "SECRETARY"])
    def test_non_privileged_roles_still_see_non_secret_settings(self, role):
        """The redaction must be surgical — ordinary branding/quota
        settings that every role legitimately needs (school logo, theme)
        must not disappear along with the secrets."""
        tenant_id = _make_tenant_with_secrets()
        headers = _as({"id": str(uuid.uuid4()), "roles": [role], "tenant_id": tenant_id})

        resp = client.get(SETTINGS_URL, headers=headers)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["logoUrl"] == _NON_SECRETS["logoUrl"]
        assert body["cinetPaySiteId"] == _NON_SECRETS["cinetPaySiteId"]

    @pytest.mark.parametrize("role", ["TENANT_ADMIN", "DIRECTOR", "SUPER_ADMIN"])
    def test_settings_write_holders_still_see_real_secret_values(self, role):
        """FinanceSettings.tsx/NotificationSettings.tsx (both gated on
        settings:write) prefill their edit forms with the existing key —
        redacting for these roles would break editing an already-configured
        payment gateway or SMTP credential."""
        tenant_id = _make_tenant_with_secrets()
        headers = _as({"id": str(uuid.uuid4()), "roles": [role], "tenant_id": tenant_id})

        resp = client.get(SETTINGS_URL, headers=headers)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        for key, value in _SECRETS.items():
            assert body.get(key) == value

    def test_settings_without_any_secrets_configured_is_unaffected(self):
        """A tenant that never configured any payment/notification
        credential must get back exactly what it stored, redaction or
        not — nothing to strip means nothing changes."""
        tenant_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="École Sans Secrets", slug=f"no-secrets-{tenant_id[:8]}",
                type="primary", country="GN", is_active=True,
                settings={"logoUrl": "https://cdn.example.com/x.png"},
            ))
            db.commit()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id})

        resp = client.get(SETTINGS_URL, headers=headers)

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"logoUrl": "https://cdn.example.com/x.png"}
