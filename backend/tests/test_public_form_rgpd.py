"""Phase 5: RGPD / data retention for public contact-form messages.

Covers: source_ip_hash is recorded (never the raw IP), a tenant admin can
delete a single message, CSV export is tenant-scoped, the purge job
deletes only messages past the retention window, and none of these ever
cross tenant boundaries.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.public_form_submission import PublicFormSubmission  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.workers.tasks import purge_old_public_form_submissions  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}

VALID_PAYLOAD = {
    "name": "Mamadou Diallo",
    "email": "mamadou.diallo@example.com",
    "message": "Bonjour, je souhaite des informations sur les inscriptions.",
}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def _fast_fake_enqueue(monkeypatch):
    async def _instant_none(*_args, **_kwargs):
        return None
    monkeypatch.setattr("app.core.jobs.enqueue_job", _instant_none)


def _as(tenant_id: str, roles=None) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": roles or ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _make_tenant(slug_prefix: str = "rgpd") -> tuple[str, str]:
    tenant_id = str(uuid.uuid4())
    slug = f"{slug_prefix}-{tenant_id[:8]}"
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École RGPD", slug=slug,
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id, slug


def _add_submission(tenant_id: str, *, created_at=None, **overrides) -> str:
    sub_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(PublicFormSubmission(
            id=sub_id, tenant_id=tenant_id,
            name=overrides.get("name", "X"), email=overrides.get("email", "x@example.com"),
            message=overrides.get("message", "Un message assez long pour passer la validation."),
        ))
        db.commit()
        if created_at is not None:
            db.execute(
                PublicFormSubmission.__table__.update()
                .where(PublicFormSubmission.id == sub_id)
                .values(created_at=created_at)
            )
            db.commit()
    return sub_id


class TestSourceIpHashRecorded:
    def test_submission_stores_a_hash_not_the_raw_ip(self):
        _, slug = _make_tenant("iphash")
        resp = client.post(f"/api/v1/tenants/public/{slug}/submit-form/", json=VALID_PAYLOAD)
        assert resp.status_code == 201, resp.text

        with SessionLocal() as db:
            row = db.query(PublicFormSubmission).filter(
                PublicFormSubmission.email == VALID_PAYLOAD["email"]
            ).first()
            assert row.source_ip_hash is not None
            assert len(row.source_ip_hash) == 16
            # The TestClient's remote address is a loopback-ish value; the
            # stored hash must not literally contain it in cleartext.
            assert "127.0.0.1" not in row.source_ip_hash
            assert "testclient" not in row.source_ip_hash


class TestManualDeletion:
    def test_admin_can_delete_own_tenant_message(self):
        tenant_id, slug = _make_tenant("delete")
        sub_id = _add_submission(tenant_id)

        resp = client.delete(f"/api/v1/public-pages/submissions/{sub_id}/", headers=_as(tenant_id))
        assert resp.status_code == 204, resp.text

        with SessionLocal() as db:
            assert db.query(PublicFormSubmission).filter(PublicFormSubmission.id == sub_id).first() is None

    def test_cannot_delete_another_tenants_message(self):
        tenant_a, _ = _make_tenant("delA")
        tenant_b, _ = _make_tenant("delB")
        sub_id = _add_submission(tenant_a)

        resp = client.delete(f"/api/v1/public-pages/submissions/{sub_id}/", headers=_as(tenant_b))
        assert resp.status_code == 404

        with SessionLocal() as db:
            assert db.query(PublicFormSubmission).filter(PublicFormSubmission.id == sub_id).first() is not None

    def test_staff_role_cannot_delete(self):
        tenant_id, _ = _make_tenant("delstaff")
        sub_id = _add_submission(tenant_id)

        resp = client.delete(
            f"/api/v1/public-pages/submissions/{sub_id}/", headers=_as(tenant_id, roles=["STAFF"])
        )
        assert resp.status_code == 403


class TestCsvExport:
    def test_export_is_tenant_scoped_csv(self):
        tenant_a, _ = _make_tenant("expA")
        tenant_b, _ = _make_tenant("expB")
        _add_submission(tenant_a, name="Alpha", email="alpha@example.com")
        _add_submission(tenant_b, name="Beta", email="beta@example.com")

        resp = client.get("/api/v1/public-pages/submissions/export/", headers=_as(tenant_a))
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"].startswith("text/csv")
        body = resp.text
        assert "Alpha" in body
        assert "alpha@example.com" in body
        assert "Beta" not in body
        assert "beta@example.com" not in body

    def test_export_never_includes_source_ip_hash_column(self):
        tenant_id, slug = _make_tenant("exphash")
        client.post(f"/api/v1/tenants/public/{slug}/submit-form/", json=VALID_PAYLOAD)

        resp = client.get("/api/v1/public-pages/submissions/export/", headers=_as(tenant_id))
        assert resp.status_code == 200, resp.text
        header_row = resp.text.splitlines()[0]
        assert "ip" not in header_row.lower()


class TestPurgeJob:
    def test_purge_deletes_only_old_messages(self):
        tenant_id, _ = _make_tenant("purge")
        old_id = _add_submission(
            tenant_id, created_at=datetime.now(timezone.utc) - timedelta(days=400)
        )
        recent_id = _add_submission(
            tenant_id, created_at=datetime.now(timezone.utc) - timedelta(days=5)
        )

        import asyncio
        result = asyncio.run(purge_old_public_form_submissions({}, retention_days=365))
        assert result["deleted"] >= 1

        with SessionLocal() as db:
            assert db.query(PublicFormSubmission).filter(PublicFormSubmission.id == old_id).first() is None
            assert db.query(PublicFormSubmission).filter(PublicFormSubmission.id == recent_id).first() is not None

    def test_purge_never_crosses_tenants_it_didnt_target(self):
        """The purge is age-based across all tenants by design (like
        purge_expired_idempotency_keys), but a tenant's recent messages
        must never be deleted just because another tenant also has old
        ones — this pins that each row's own age is what's evaluated."""
        tenant_a, _ = _make_tenant("purgeA")
        tenant_b, _ = _make_tenant("purgeB")
        old_a = _add_submission(tenant_a, created_at=datetime.now(timezone.utc) - timedelta(days=400))
        recent_b = _add_submission(tenant_b, created_at=datetime.now(timezone.utc) - timedelta(days=1))

        import asyncio
        asyncio.run(purge_old_public_form_submissions({}, retention_days=365))

        with SessionLocal() as db:
            assert db.query(PublicFormSubmission).filter(PublicFormSubmission.id == old_a).first() is None
            assert db.query(PublicFormSubmission).filter(PublicFormSubmission.id == recent_b).first() is not None
