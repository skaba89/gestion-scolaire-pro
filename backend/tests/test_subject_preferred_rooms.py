"""GET/POST/DELETE /subject-preferred-rooms/ (aliases.py) — regression test.

SubjectPreferredRoomsManager.tsx has always been mounted on the Subjects
admin page (src/pages/admin/Subjects.tsx) but the backend had zero support
for it — every call 404'd. This adds the model/schema/CRUD/endpoints and
verifies the full round trip.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.room import Room  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.subject_preferred_room import SubjectPreferredRoom  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
URL = "/api/v1/subject-preferred-rooms/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(tenant_id: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _make_tenant_subject_room() -> tuple[str, str, str]:
    tenant_id = str(uuid.uuid4())
    subject_id = str(uuid.uuid4())
    room_id = str(uuid.uuid4())
    with SessionLocal() as db:
        # Tenant must be committed before Room/Subject: neither model declares
        # an ORM `relationship("Tenant")` (only a raw tenant_id FK column), so
        # SQLAlchemy's flush ordering can't infer the dependency and may try
        # to insert the child row first, tripping the FK constraint.
        db.add(Tenant(
            id=tenant_id, name="École Salles Test", slug=f"rooms-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name="Mathématiques", code="MATH"))
        db.add(Room(id=room_id, tenant_id=tenant_id, name="Salle 101", capacity=30))
        db.commit()
    return tenant_id, subject_id, room_id


class TestSubjectPreferredRooms:
    def test_list_empty_by_default(self):
        tenant_id, subject_id, _ = _make_tenant_subject_room()
        resp = client.get(URL, params={"subject_id": subject_id}, headers=_as(tenant_id))
        assert resp.status_code == 200, resp.text
        assert resp.json() == []

    def test_create_and_list_round_trip(self):
        tenant_id, subject_id, room_id = _make_tenant_subject_room()
        headers = _as(tenant_id)

        resp = client.post(URL, json={"subject_id": subject_id, "room_id": room_id}, headers=headers)
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["subject_id"] == subject_id
        assert body["room_id"] == room_id
        assert body["room"]["name"] == "Salle 101"
        link_id = body["id"]

        resp = client.get(URL, params={"subject_id": subject_id}, headers=headers)
        assert resp.status_code == 200, resp.text
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["id"] == link_id

        with SessionLocal() as db:
            row = db.query(SubjectPreferredRoom).filter(SubjectPreferredRoom.id == link_id).first()
            assert row is not None
            assert str(row.tenant_id) == tenant_id

    def test_create_is_idempotent_for_same_pair(self):
        tenant_id, subject_id, room_id = _make_tenant_subject_room()
        headers = _as(tenant_id)

        first = client.post(URL, json={"subject_id": subject_id, "room_id": room_id}, headers=headers)
        second = client.post(URL, json={"subject_id": subject_id, "room_id": room_id}, headers=headers)
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
        assert first.json()["id"] == second.json()["id"]

        with SessionLocal() as db:
            count = db.query(SubjectPreferredRoom).filter(
                SubjectPreferredRoom.subject_id == subject_id,
                SubjectPreferredRoom.room_id == room_id,
            ).count()
            assert count == 1

    def test_delete_removes_link(self):
        tenant_id, subject_id, room_id = _make_tenant_subject_room()
        headers = _as(tenant_id)

        created = client.post(URL, json={"subject_id": subject_id, "room_id": room_id}, headers=headers)
        link_id = created.json()["id"]

        resp = client.delete(f"{URL}{link_id}/", headers=headers)
        assert resp.status_code == 204, resp.text

        with SessionLocal() as db:
            assert db.query(SubjectPreferredRoom).filter(SubjectPreferredRoom.id == link_id).first() is None

    def test_delete_unknown_link_returns_404(self):
        tenant_id, _, _ = _make_tenant_subject_room()
        resp = client.delete(f"{URL}{uuid.uuid4()}/", headers=_as(tenant_id))
        assert resp.status_code == 404

    def test_delete_is_tenant_scoped(self):
        tenant_id, subject_id, room_id = _make_tenant_subject_room()
        created = client.post(
            URL, json={"subject_id": subject_id, "room_id": room_id}, headers=_as(tenant_id)
        )
        link_id = created.json()["id"]

        other_tenant_id, _, _ = _make_tenant_subject_room()
        resp = client.delete(f"{URL}{link_id}/", headers=_as(other_tenant_id))
        assert resp.status_code == 404

        with SessionLocal() as db:
            assert db.query(SubjectPreferredRoom).filter(SubjectPreferredRoom.id == link_id).first() is not None
