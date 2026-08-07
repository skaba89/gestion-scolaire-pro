"""Regression coverage for POST /public-pages/reorder/.

Found while wiring up drag-and-drop reordering in PublicPagesManager.tsx:
the frontend's ▲▼ move-up/move-down buttons sent {"items": [...]} but
PageReorderRequest (app/schemas/public_pages.py) requires a `pages` key —
every click 422'd silently (caught by a generic try/except showing a
toast), so page reordering has never actually worked from the admin UI.
Both the frontend payload and this endpoint's only test coverage
(previously: none) are fixed together.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
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


def _make_tenant(slug_prefix: str = "reorder") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Reorder Test", slug=f"{slug_prefix}-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_page(tenant_id: str, slug: str, sort_order: int) -> str:
    page_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(PublicPage(
            id=page_id, tenant_id=tenant_id, title=slug, slug=slug,
            content=[], sort_order=sort_order,
        ))
        db.commit()
    return page_id


class TestReorderPages:
    def test_correct_pages_payload_reorders_successfully(self):
        """The real request shape the frontend must send — {"pages": [...]},
        not {"items": [...]}. Regression test for the payload-key bug."""
        tenant_id = _make_tenant()
        page_a = _make_page(tenant_id, "page-a", 0)
        page_b = _make_page(tenant_id, "page-b", 1)

        resp = client.post(
            "/api/v1/public-pages/reorder/",
            json={"pages": [
                {"page_id": page_a, "sort_order": 1},
                {"page_id": page_b, "sort_order": 0},
            ]},
            headers=_as(tenant_id),
        )
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            a = db.query(PublicPage).filter(PublicPage.id == page_a).first()
            b = db.query(PublicPage).filter(PublicPage.id == page_b).first()
            assert a.sort_order == 1
            assert b.sort_order == 0

    def test_legacy_items_payload_is_rejected_with_422(self):
        """Pins the exact bug found: the OLD frontend payload shape must
        422 (not silently succeed with the wrong field) — this is what
        made the bug easy to miss, since the caller only ever saw a
        generic error toast, never this validation detail."""
        tenant_id = _make_tenant()
        page_a = _make_page(tenant_id, "page-a", 0)

        resp = client.post(
            "/api/v1/public-pages/reorder/",
            json={"items": [{"page_id": page_a, "sort_order": 1}]},
            headers=_as(tenant_id),
        )
        assert resp.status_code == 422

    def test_drag_reorder_reassigns_full_sequence(self):
        """Simulates a drag-and-drop move: one page jumps from last to
        first, every page's sort_order is resent in the same call (not
        just a pairwise swap like the ▲▼ buttons)."""
        tenant_id = _make_tenant()
        page_a = _make_page(tenant_id, "page-a", 0)
        page_b = _make_page(tenant_id, "page-b", 1)
        page_c = _make_page(tenant_id, "page-c", 2)

        resp = client.post(
            "/api/v1/public-pages/reorder/",
            json={"pages": [
                {"page_id": page_c, "sort_order": 0},
                {"page_id": page_a, "sort_order": 1},
                {"page_id": page_b, "sort_order": 2},
            ]},
            headers=_as(tenant_id),
        )
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            pages = {
                str(p.id): p.sort_order
                for p in db.query(PublicPage).filter(PublicPage.tenant_id == tenant_id).all()
            }
            assert pages[page_c] == 0
            assert pages[page_a] == 1
            assert pages[page_b] == 2

    def test_reorder_does_not_affect_another_tenant(self):
        tenant_a = _make_tenant("reorderA")
        tenant_b = _make_tenant("reorderB")
        page_b = _make_page(tenant_b, "page-b", 0)

        resp = client.post(
            "/api/v1/public-pages/reorder/",
            json={"pages": [{"page_id": page_b, "sort_order": 99}]},
            headers=_as(tenant_a),
        )
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            b = db.query(PublicPage).filter(PublicPage.id == page_b).first()
            # Not found under tenant_a's scope in the endpoint, so untouched.
            assert b.sort_order == 0

    def test_staff_role_cannot_reorder(self):
        tenant_id = _make_tenant("reorderstaff")
        page_a = _make_page(tenant_id, "page-a", 0)

        resp = client.post(
            "/api/v1/public-pages/reorder/",
            json={"pages": [{"page_id": page_a, "sort_order": 5}]},
            headers=_as(tenant_id, roles=["STAFF"]),
        )
        assert resp.status_code == 403
