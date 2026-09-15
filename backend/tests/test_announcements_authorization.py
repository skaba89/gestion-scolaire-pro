"""Authorization on POST/DELETE /api/v1/communication/announcements/
(institutional-readiness audit, 2026-09).

Before this fix, create_announcement and delete_announcement depended on
get_current_user() ONLY — no require_permission() call, and delete had no
ownership check either. Any authenticated user of any role (STUDENT,
PARENT, ALUMNI included) could broadcast a school-wide announcement or
delete any existing one.

GET /announcements/ is deliberately left ungated in the fix (and untested
here for 403): reading announcements is meant to be broad — that's the
point of the feature. Only the write actions (create/delete) needed a gate.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}


def _make_tenant(name: str) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"announce-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
            subscription_plan="starter", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _make_user_identity(tenant_id: str, role: str) -> dict:
    """Real User row — announcements.author_id has a real FK on users(id)
    (enforced by Postgres, not by SQLite, which is why a fake id worked in
    the SQLite-only negative tests above but not here)."""
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", password_hash="x",
            first_name="Test", last_name=role, is_active=True,
        ))
        db.commit()
    return {"id": user_id, "roles": [role], "tenant_id": tenant_id}


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _announcement_payload() -> dict:
    return {
        "title": "Réunion parents-professeurs",
        "content": "La réunion aura lieu vendredi à 17h.",
        "target_roles": ["PARENT"],
        "pinned": False,
    }


class TestNoBusinessBroadcastingAnnouncements:
    def test_student_cannot_create_announcement(self):
        tenant_id = _make_tenant("École Announce Student")
        student = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student).post(
            "/api/v1/communication/announcements/",
            json=_announcement_payload(),
            headers=HEADERS,
        )
        assert resp.status_code == 403

    def test_parent_cannot_delete_announcement(self):
        tenant_id = _make_tenant("École Announce Parent")
        parent = {"id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id}
        resp = _as(parent).delete(
            f"/api/v1/communication/announcements/{uuid.uuid4()}/", headers=HEADERS,
        )
        assert resp.status_code == 403

    def test_teacher_cannot_create_announcement(self):
        tenant_id = _make_tenant("École Announce Teacher")
        teacher = {"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}
        resp = _as(teacher).post(
            "/api/v1/communication/announcements/",
            json=_announcement_payload(),
            headers=HEADERS,
        )
        assert resp.status_code == 403


@pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="'announcements' is a raw-SQL operational table whose DDL "
           "(DEFAULT now(), TIMESTAMPTZ) is Postgres-specific — see "
           "app/core/operational_tables.py. Exercised by the CI Postgres job.",
)
class TestRolesAlreadyExposedToAnnouncementsPageKeepWorking:
    def test_director_can_create_and_delete_announcement(self):
        tenant_id = _make_tenant("École Announce Director")
        director = _make_user_identity(tenant_id, "DIRECTOR")

        resp = _as(director).post(
            "/api/v1/communication/announcements/",
            json=_announcement_payload(),
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        announcement_id = resp.json()["id"]

        resp = _as(director).delete(
            f"/api/v1/communication/announcements/{announcement_id}/", headers=HEADERS,
        )
        assert resp.status_code == 204, resp.text

    def test_secretary_can_create_announcement(self):
        tenant_id = _make_tenant("École Announce Secretary")
        secretary = _make_user_identity(tenant_id, "SECRETARY")
        resp = _as(secretary).post(
            "/api/v1/communication/announcements/",
            json=_announcement_payload(),
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text

    def test_anyone_can_still_read_announcements(self):
        """Reading stays broad on purpose — a STUDENT must see announcements
        targeted at them even though they can't create or delete one."""
        tenant_id = _make_tenant("École Announce Read")
        student = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student).get("/api/v1/communication/announcements/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
