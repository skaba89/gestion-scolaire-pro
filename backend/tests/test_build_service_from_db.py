"""build_service_from_db() (app/services/notifications.py) — regression
test for a P1 found while working on Phase 6 of the finalization plan
(2026-08-16): the function used a raw SQL `text()` SELECT with tenant_id
bound as a dashed UUID string. On SQLite (this app's dev/test DB), ids
are stored dash-less via the GUID TypeDecorator (app/models/base.py), so
the raw-SQL WHERE clause silently matched zero rows — build_service_from_db
always returned None on SQLite, regardless of whether the tenant existed,
with no error raised anywhere. Same bug class already fixed once in
app/workers/tasks.py::_fetch_tenant_settings; fixed here the same way
(query through the ORM instead of raw SQL).

Every other test exercising this codepath (test_communication_whatsapp_
tracking.py, test_whatsapp_absence_grade_bulletin_jobs.py) monkeypatches
build_service_from_db entirely and would never have caught this — this
file is the first to call the real function.
"""
import uuid

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.services.notifications import build_service_from_db  # noqa: E402


def _make_tenant(settings: dict | None = None, name: str = "École Test") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"buildsvc-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings=settings or {},
        ))
        db.commit()
    return tenant_id


class TestBuildServiceFromDb:
    def test_returns_a_service_for_an_existing_tenant(self):
        """The regression itself: this used to return None here even
        though the tenant genuinely exists (SQLite UUID mismatch)."""
        tenant_id = _make_tenant(name="École Existante")
        with SessionLocal() as db:
            svc = build_service_from_db(db, tenant_id)
        assert svc is not None
        assert svc.school_name == "École Existante"

    def test_returns_none_for_a_nonexistent_tenant(self):
        with SessionLocal() as db:
            svc = build_service_from_db(db, str(uuid.uuid4()))
        assert svc is None

    def test_wires_up_whatsapp_sender_from_settings(self):
        tenant_id = _make_tenant(settings={
            "whatsappAccessToken": "EAAtest", "whatsappPhoneId": "1234567890",
        })
        with SessionLocal() as db:
            svc = build_service_from_db(db, tenant_id)
        assert svc is not None
        assert svc.whatsapp is not None

    def test_whatsapp_sender_absent_when_not_configured(self):
        tenant_id = _make_tenant(settings={})
        with SessionLocal() as db:
            svc = build_service_from_db(db, tenant_id)
        assert svc is not None
        assert svc.whatsapp is None

    def test_falls_back_to_default_school_name_when_tenant_name_is_empty(self):
        """Tenant.name is NOT NULL in the schema, but guard the fallback
        anyway in case a future migration ever allows blank names."""
        tenant_id = _make_tenant(name="")
        with SessionLocal() as db:
            svc = build_service_from_db(db, tenant_id)
        assert svc is not None
        assert svc.school_name == "Academy Guinéenne"

