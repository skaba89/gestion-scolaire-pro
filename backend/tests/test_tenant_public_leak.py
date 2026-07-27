"""GET /tenants/public/{slug}/ — national audit P1 (fuite de donnée
personnelle). tenant.email/tenant.phone are copies of the registering
ADMIN's personal account email/phone (set verbatim from body.email/
body.phone in auth.py:register_school), not a school-official public
contact — this public, unauthenticated endpoint must never surface them.
Only the establishment's explicitly-published landing.contact_email/
landing.contact_phone may appear here.

Also covers GET /tenants/public/ (the bulk directory listing), which
shares the exact same leak pattern via a separate code path
(list_public_tenants), and the authenticated route to prove the fix
didn't collaterally break legitimate access to the real tenant.email.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

ADMIN_PERSONAL_EMAIL = "admin.personnel@example.com"
ADMIN_PERSONAL_PHONE = "+224600000001"


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    """A module-level teardown_function() only fires for bare test
    functions, NOT for methods inside a `class Test...:` block — the last
    class in this file (TestAuthenticatedTenantEndpointsStillWork) left
    get_current_user permanently overridden for every test file that ran
    afterward in the same pytest session, silently bypassing the real
    blacklist/token-version checks in get_current_user() for unrelated
    security tests elsewhere. An autouse fixture tears down reliably
    regardless of function vs. class-method context."""
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_tenant(*, name: str, contact_email: str | None = None, contact_phone: str | None = None) -> dict:
    """Mirrors what register_school() actually does: tenant.email/phone are
    a verbatim copy of the admin's personal account email/phone, entirely
    separate from whatever the establishment later opts to publish in
    landing.contact_email/contact_phone."""
    tenant_id = str(uuid.uuid4())
    settings = {"landing": {}}
    if contact_email is not None:
        settings["landing"]["contact_email"] = contact_email
    if contact_phone is not None:
        settings["landing"]["contact_phone"] = contact_phone

    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"leak-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True,
            email=ADMIN_PERSONAL_EMAIL, phone=ADMIN_PERSONAL_PHONE,
            address="Conakry, Guinée", website="https://ecole.example",
            settings=settings,
        ))
        db.commit()
    return {"tenant_id": tenant_id, "slug": f"leak-{tenant_id[:8]}"}


class TestPublicSlugEndpointNeverLeaksAdminEmail:
    def test_admin_personal_email_never_appears(self):
        ctx = _make_tenant(name="École Fuite Test")

        resp = client.get(f"/api/v1/tenants/public/{ctx['slug']}/")
        assert resp.status_code == 200, resp.text
        assert ADMIN_PERSONAL_EMAIL not in resp.text
        assert ADMIN_PERSONAL_PHONE not in resp.text
        assert resp.json()["email"] is None
        assert resp.json()["phone"] is None

    def test_slug_alias_endpoint_also_scrubbed(self):
        """/tenants/slug/{slug}/ shares _build_public_response — must be
        scrubbed identically, not just the /public/ route."""
        ctx = _make_tenant(name="École Fuite Alias")

        resp = client.get(f"/api/v1/tenants/slug/{ctx['slug']}/")
        assert resp.status_code == 200, resp.text
        assert ADMIN_PERSONAL_EMAIL not in resp.text

    def test_no_full_settings_or_sensitive_fields_leaked(self):
        ctx = _make_tenant(name="École Fuite Settings")
        resp = client.get(f"/api/v1/tenants/public/{ctx['slug']}/")
        assert resp.status_code == 200, resp.text
        body = resp.json()

        # response_model is an allowlist by construction (TenantPublicResponse),
        # but assert explicitly that no raw settings/security-shaped keys leak.
        forbidden_keys = {"settings", "password_hash", "audit_logs", "billing_email", "secret_key"}
        assert forbidden_keys.isdisjoint(body.keys())

    def test_positive_case_landing_contact_email_is_shown(self):
        """A deliberately published landing.contact_email/contact_phone
        MUST still be shown — this is not a blanket redaction."""
        ctx = _make_tenant(
            name="École Contact Public",
            contact_email="contact-public@ecole.com",
            contact_phone="+224611111111",
        )

        resp = client.get(f"/api/v1/tenants/public/{ctx['slug']}/")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["email"] == "contact-public@ecole.com"
        assert data["phone"] == "+224611111111"
        # The admin's real personal email must still never appear, even
        # though a public contact_email is also configured.
        assert ADMIN_PERSONAL_EMAIL not in resp.text


class TestPublicDirectoryListingNeverLeaksAdminEmail:
    def test_bulk_listing_scrubs_every_tenant(self):
        """list_public_tenants() has its own separate code path — the fix
        must cover it too, not just the single-slug endpoint."""
        _make_tenant(name="École Annuaire Fuite 1")
        _make_tenant(name="École Annuaire Fuite 2", contact_email="public2@ecole.com")

        resp = client.get("/api/v1/tenants/public/", params={"page_size": 100})
        assert resp.status_code == 200, resp.text
        assert ADMIN_PERSONAL_EMAIL not in resp.text
        assert "public2@ecole.com" in resp.text


class TestAuthenticatedTenantEndpointsStillWork:
    """Non-regression: the fix must only affect the PUBLIC/unauthenticated
    projection. An authenticated caller with the right permission must
    still see the tenant's real email (needed by settings/admin screens)."""

    def test_authenticated_infos_endpoint_still_returns_real_email(self):
        """GET /tenants/INFOS/ is the authenticated counterpart that
        legitimately needs the real tenant.email (used by
        QuickEnrollmentDialog and other admin-facing components) — the
        public-endpoint fix must not touch this authenticated path."""
        ctx = _make_tenant(name="École Authentifiée")
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})

        resp = client.get("/api/v1/tenants/INFOS/", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json().get("email") == ADMIN_PERSONAL_EMAIL
