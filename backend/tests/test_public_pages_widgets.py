"""Public pages content-as-array fix + contact form submissions.

Regression coverage for two bugs found while building the visual widget
builder:

1. PublicPage.content was typed Dict[str, Any] in the Pydantic schemas,
   but every real consumer (PublicPageView.tsx's section renderers) does
   `page.content.map(...)` — i.e. treats it as a list. Saving a page with
   real section content used to 422 outright, and reading a pre-existing
   page (content={} from the old default) would now 500 without the
   backward-compat coercion — both covered here.
2. ContactFormSection (the actual public-facing form) never sent
   submissions anywhere; POST /tenants/public/{slug}/submit-form/ is what
   makes it real.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.public_form_submission import PublicFormSubmission  # noqa: E402
from app.models.public_page import PublicPage  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(tenant_id: str, roles=None) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": roles or ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _make_tenant(slug_prefix: str = "widgets") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Widgets Test", slug=f"{slug_prefix}-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


class TestPublicPageContentIsAList:
    def test_create_page_with_real_section_list_succeeds(self):
        """Previously 422'd: content typed as Dict[str, Any] rejected any
        JSON array payload outright."""
        tenant_id = _make_tenant()
        sections = [
            {"type": "hero", "title": "Bienvenue", "subtitle": "Sous-titre", "settings": {}},
            {"type": "text", "title": "À propos", "content": "<p>Texte</p>", "settings": {}},
        ]
        resp = client.post(
            "/api/v1/public-pages/",
            json={"title": "Recherche", "slug": "recherche", "content": sections},
            headers=_as(tenant_id),
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["content"] == sections

        with SessionLocal() as db:
            row = db.query(PublicPage).filter(PublicPage.id == body["id"]).first()
            assert row.content == sections

    def test_reading_a_legacy_dict_content_page_does_not_500(self):
        """A page saved before this fix has content={} (the old Dict
        default) in the DB — GET must not crash on it."""
        tenant_id = _make_tenant()
        page_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(PublicPage(
                id=page_id, tenant_id=tenant_id, title="Legacy", slug="legacy",
                content={}, is_published=True,
            ))
            db.commit()

        resp = client.get("/api/v1/public-pages/", headers=_as(tenant_id))
        assert resp.status_code == 200, resp.text

        resp = client.get(f"/api/v1/public-pages/{page_id}/", headers=_as(tenant_id))
        assert resp.status_code == 200, resp.text
        assert resp.json()["content"] == []

    def test_public_endpoint_also_coerces_legacy_dict_content(self):
        tenant_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="École Legacy", slug=f"legacy-{tenant_id[:8]}",
                type="primary", country="GN", is_active=True, settings={},
            ))
            db.commit()
            db.add(PublicPage(
                id=str(uuid.uuid4()), tenant_id=tenant_id, title="Legacy", slug="legacy-pub",
                content={}, is_published=True,
            ))
            db.commit()

        tenant = None
        with SessionLocal() as db:
            tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            slug = tenant.slug

        resp = client.get(f"/api/v1/tenants/public/{slug}/pages/legacy-pub/")
        assert resp.status_code == 200, resp.text
        assert resp.json()["content"] == []


class TestPublicFormSubmission:
    def test_submit_creates_a_real_row(self):
        tenant_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="École Formulaire", slug=f"form-{tenant_id[:8]}",
                type="primary", country="GN", is_active=True, settings={},
            ))
            db.commit()
            slug = db.query(Tenant).filter(Tenant.id == tenant_id).first().slug

        resp = client.post(
            f"/api/v1/tenants/public/{slug}/submit-form/",
            json={"name": "Aïcha Bah", "email": "aicha@example.com", "message": "Bonjour, une question."},
        )
        assert resp.status_code == 201, resp.text

        with SessionLocal() as db:
            row = db.query(PublicFormSubmission).filter(PublicFormSubmission.tenant_id == tenant_id).first()
            assert row is not None
            assert row.name == "Aïcha Bah"
            assert row.email == "aicha@example.com"
            assert row.is_read is False

    def test_submit_404_for_unknown_tenant(self):
        resp = client.post(
            "/api/v1/tenants/public/does-not-exist/submit-form/",
            json={"name": "Xavier", "email": "x@example.com", "message": "Bonjour, ceci est un test."},
        )
        assert resp.status_code == 404

    def test_submit_rejects_blank_message(self):
        tenant_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="École Blank", slug=f"blank-{tenant_id[:8]}",
                type="primary", country="GN", is_active=True, settings={},
            ))
            db.commit()
            slug = db.query(Tenant).filter(Tenant.id == tenant_id).first().slug

        resp = client.post(
            f"/api/v1/tenants/public/{slug}/submit-form/",
            json={"name": "X", "email": "x@example.com", "message": "   "},
        )
        assert resp.status_code == 422

    def test_admin_can_list_and_mark_read(self):
        tenant_id = _make_tenant("adminlist")
        with SessionLocal() as db:
            db.add(PublicFormSubmission(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                name="Fatou", email="fatou@example.com", message="Question admissions",
            ))
            db.commit()

        headers = _as(tenant_id)
        resp = client.get("/api/v1/public-pages/submissions/", headers=headers)
        assert resp.status_code == 200, resp.text
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["is_read"] is False
        submission_id = rows[0]["id"]

        resp = client.patch(f"/api/v1/public-pages/submissions/{submission_id}/mark-read/", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_read"] is True

        resp = client.get("/api/v1/public-pages/submissions/", params={"is_read": False}, headers=headers)
        assert resp.json() == []

    def test_admin_cannot_see_another_tenants_submissions(self):
        tenant_a = _make_tenant("tenanta")
        tenant_b = _make_tenant("tenantb")
        with SessionLocal() as db:
            db.add(PublicFormSubmission(
                id=str(uuid.uuid4()), tenant_id=tenant_a,
                name="A", email="a@example.com", message="msg",
            ))
            db.commit()

        resp = client.get("/api/v1/public-pages/submissions/", headers=_as(tenant_b))
        assert resp.status_code == 200, resp.text
        assert resp.json() == []

    def test_student_role_cannot_list_submissions(self):
        tenant_id = _make_tenant("nostudent")
        resp = client.get(
            "/api/v1/public-pages/submissions/",
            headers=_as(tenant_id, roles=["STUDENT"]),
        )
        assert resp.status_code == 403
