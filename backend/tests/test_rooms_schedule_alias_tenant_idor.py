"""GET /rooms/ and GET /schedule-slots/ (aliases.py) — institutional-
readiness audit, 2026-09.

Both endpoints let the client-supplied `tenant_id` query param WIN over
the caller's resolved tenant (`tenant_id or resolve_current_tenant_id(...)`).
Any authenticated user of one tenant could read another tenant's rooms or
classroom schedule (teacher names, room names, times) by passing
?tenant_id=<other-tenant-uuid> — the only two places in the codebase that
accepted a raw client tenant_id like this. The param is now ignored;
resolve_current_tenant_id() alone decides the tenant."""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.room import Room  # noqa: E402
from app.models.schedule import ScheduleSlot  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

_needs_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="list_schedule_slots_alias uses raw SQL WHERE tenant_id=:param, "
           "which can't match SQLite's hex-no-dash GUID storage.",
)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_tenant(name: str) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"idor-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_room(tenant_id: str, name: str) -> str:
    room_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Room(id=room_id, tenant_id=tenant_id, name=name))
        db.commit()
    return room_id


def _make_schedule_slot(tenant_id: str) -> str:
    class_id = str(uuid.uuid4())
    subject_id = str(uuid.uuid4())
    slot_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Classroom(id=class_id, tenant_id=tenant_id, name="6eme A"))
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name="Mathématiques"))
        db.commit()
        db.add(ScheduleSlot(
            id=slot_id, tenant_id=tenant_id, class_id=class_id, subject_id=subject_id,
            day_of_week=1, start_time="08:00", end_time="09:00",
        ))
        db.commit()
    return slot_id


class TestRoomsAliasIgnoresClientSuppliedTenantId:
    def test_cannot_read_another_tenants_rooms_via_query_param(self):
        tenant_a = _make_tenant("École A")
        tenant_b = _make_tenant("École B — Confidentielle")
        _make_room(tenant_b, "Salle secrète B")
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_a})

        resp = client.get("/api/v1/rooms/", params={"tenant_id": tenant_b}, headers=headers)
        assert resp.status_code == 200, resp.text
        names = [r["name"] for r in resp.json()]
        assert "Salle secrète B" not in names

    def test_still_returns_own_tenants_rooms(self):
        tenant_id = _make_tenant("École C")
        _make_room(tenant_id, "Salle 101")
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.get("/api/v1/rooms/", headers=headers)
        assert resp.status_code == 200, resp.text
        assert any(r["name"] == "Salle 101" for r in resp.json())


class TestScheduleSlotsAliasIgnoresClientSuppliedTenantId:
    @_needs_postgres
    def test_cannot_read_another_tenants_schedule_via_query_param(self):
        tenant_a = _make_tenant("École D")
        tenant_b = _make_tenant("École E — Confidentielle")
        _make_schedule_slot(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_a})

        resp = client.get("/api/v1/schedule-slots/", params={"tenant_id": tenant_b}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json() == [], "must not leak tenant B's schedule via a spoofed tenant_id param"

    @_needs_postgres
    def test_still_returns_own_tenants_schedule_even_with_spoofed_param(self):
        tenant_a = _make_tenant("École F")
        tenant_b = _make_tenant("École G")
        _make_schedule_slot(tenant_a)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_a})

        resp = client.get("/api/v1/schedule-slots/", params={"tenant_id": tenant_b}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1
