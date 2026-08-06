"""Phase 1 security hardening of POST /tenants/public/{slug}/submit-form/.

Covers the 8 cases from the security pass spec: valid submission (201),
unknown tenant (404), page_id belonging to another tenant (404), message
too long (422), invalid email (422), honeypot filled (204, silent), rate
limit exceeded (429), and cross-tenant message isolation.

See app/schemas/public_pages.py::PublicFormSubmissionCreate and
app/api/v1/endpoints/core/public_pages.py::submit_public_form for the
implementation these tests pin down.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.models.public_form_submission import PublicFormSubmission  # noqa: E402
from app.models.public_page import PublicPage  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402


@pytest.fixture(autouse=True)
def _fast_fake_enqueue(monkeypatch):
    """The real enqueue_job() retries against Redis for ~10s before giving
    up when Redis is unreachable (as it is in this test environment) — fine
    in production (fails open, doesn't fail the request), but it would make
    every submission in this file take ~10s and would make the rate-limit
    test's 15 requests span minutes, outliving the 1-minute window before
    they could ever trip it. Stub it to fail open instantly instead, which
    is exactly the documented "Redis unavailable" behavior, just without
    the real network retry cost."""
    async def _instant_none(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.core.jobs.enqueue_job", _instant_none)


def _make_tenant(slug_prefix: str = "formsec") -> tuple[str, str]:
    tenant_id = str(uuid.uuid4())
    slug = f"{slug_prefix}-{tenant_id[:8]}"
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Sécurité Formulaire", slug=slug,
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id, slug


VALID_PAYLOAD = {
    "name": "Mamadou Diallo",
    "email": "mamadou.diallo@example.com",
    "message": "Bonjour, je souhaite des informations sur les inscriptions.",
}


class TestValidSubmission:
    def test_valid_submission_returns_201(self):
        _, slug = _make_tenant("valid")
        resp = client.post(f"/api/v1/tenants/public/{slug}/submit-form/", json=VALID_PAYLOAD)
        assert resp.status_code == 201, resp.text
        assert resp.json() == {"success": True}


class TestUnknownTenant:
    def test_unknown_tenant_returns_404(self):
        resp = client.post(
            "/api/v1/tenants/public/does-not-exist-xyz/submit-form/",
            json=VALID_PAYLOAD,
        )
        assert resp.status_code == 404


class TestCrossTenantPage:
    def test_page_id_from_another_tenant_returns_404(self):
        _, slug_a = _make_tenant("crossa")
        tenant_b, _ = _make_tenant("crossb")
        with SessionLocal() as db:
            page_b = PublicPage(
                id=str(uuid.uuid4()), tenant_id=tenant_b, title="Contact", slug="contact",
                content=[], is_published=True,
            )
            db.add(page_b)
            db.commit()
            page_b_id = str(page_b.id)

        resp = client.post(
            f"/api/v1/tenants/public/{slug_a}/submit-form/",
            json={**VALID_PAYLOAD, "page_id": page_b_id},
        )
        assert resp.status_code == 404


class TestFieldLengthValidation:
    def test_message_too_long_returns_422(self):
        _, slug = _make_tenant("toolong")
        resp = client.post(
            f"/api/v1/tenants/public/{slug}/submit-form/",
            json={**VALID_PAYLOAD, "message": "a" * 5001},
        )
        assert resp.status_code == 422

    def test_message_too_short_returns_422(self):
        _, slug = _make_tenant("tooshort")
        resp = client.post(
            f"/api/v1/tenants/public/{slug}/submit-form/",
            json={**VALID_PAYLOAD, "message": "short"},
        )
        assert resp.status_code == 422

    def test_name_too_short_returns_422(self):
        _, slug = _make_tenant("nameshort")
        resp = client.post(
            f"/api/v1/tenants/public/{slug}/submit-form/",
            json={**VALID_PAYLOAD, "name": "A"},
        )
        assert resp.status_code == 422


class TestEmailValidation:
    def test_invalid_email_returns_422(self):
        _, slug = _make_tenant("bademail")
        resp = client.post(
            f"/api/v1/tenants/public/{slug}/submit-form/",
            json={**VALID_PAYLOAD, "email": "not-an-email"},
        )
        assert resp.status_code == 422

    def test_email_is_normalized_lowercase(self):
        _, slug = _make_tenant("normalize")
        resp = client.post(
            f"/api/v1/tenants/public/{slug}/submit-form/",
            json={**VALID_PAYLOAD, "email": "  Mamadou.Diallo@EXAMPLE.com  "},
        )
        assert resp.status_code == 201, resp.text
        with SessionLocal() as db:
            row = db.query(PublicFormSubmission).filter(PublicFormSubmission.email.like("%diallo%")).first()
            assert row.email == "mamadou.diallo@example.com"


class TestSpamShapeRejection:
    def test_too_many_links_returns_422(self):
        _, slug = _make_tenant("spamlinks")
        spammy = "Check https://a.com and https://b.com and https://c.com now!!"
        resp = client.post(
            f"/api/v1/tenants/public/{slug}/submit-form/",
            json={**VALID_PAYLOAD, "message": spammy},
        )
        assert resp.status_code == 422

    def test_repetitive_message_returns_422(self):
        _, slug = _make_tenant("spamrepeat")
        resp = client.post(
            f"/api/v1/tenants/public/{slug}/submit-form/",
            json={**VALID_PAYLOAD, "message": "a" * 50},
        )
        assert resp.status_code == 422


class TestHoneypot:
    def test_honeypot_filled_returns_204_and_no_row_created(self):
        tenant_id, slug = _make_tenant("honeypot")
        resp = client.post(
            f"/api/v1/tenants/public/{slug}/submit-form/",
            json={**VALID_PAYLOAD, "website": "https://spambot.example"},
        )
        assert resp.status_code == 204
        assert resp.content == b""

        with SessionLocal() as db:
            # Scoped to this freshly-created tenant, not by email: other
            # tests in this module reuse VALID_PAYLOAD's email against
            # their own tenants, so a bare email lookup would false-positive
            # on rows those tests legitimately created.
            row = db.query(PublicFormSubmission).filter(
                PublicFormSubmission.tenant_id == tenant_id
            ).first()
            assert row is None

    def test_honeypot_bypasses_tenant_lookup_too(self):
        """A honeypot hit on a nonexistent tenant still returns 204, not
        404 — a bot must not be able to use the honeypot response to
        distinguish "blocked" from "unknown tenant"."""
        resp = client.post(
            "/api/v1/tenants/public/nonexistent-honeypot-tenant/submit-form/",
            json={**VALID_PAYLOAD, "website": "spam"},
        )
        assert resp.status_code == 204


class TestRateLimit:
    def test_rate_limit_exceeded_returns_429(self):
        _, slug = _make_tenant("ratelimit")
        last_status = None
        for _ in range(15):
            resp = client.post(f"/api/v1/tenants/public/{slug}/submit-form/", json=VALID_PAYLOAD)
            last_status = resp.status_code
            if last_status == 429:
                break
        assert last_status == 429


class TestTenantIsolation:
    def test_messages_are_not_visible_across_tenants(self):
        tenant_a, slug_a = _make_tenant("isoa")
        tenant_b, slug_b = _make_tenant("isob")

        resp = client.post(f"/api/v1/tenants/public/{slug_a}/submit-form/", json=VALID_PAYLOAD)
        assert resp.status_code == 201, resp.text

        with SessionLocal() as db:
            rows_a = db.query(PublicFormSubmission).filter(PublicFormSubmission.tenant_id == tenant_a).all()
            rows_b = db.query(PublicFormSubmission).filter(PublicFormSubmission.tenant_id == tenant_b).all()
            assert len(rows_a) == 1
            assert len(rows_b) == 0
