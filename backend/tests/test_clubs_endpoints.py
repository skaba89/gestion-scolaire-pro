"""Tests pour les endpoints clubs — auth guards + le vrai bug corrigé en
migrant vers l'ORM (Horizon 2, module pilote) : le frontend
(src/pages/admin/Clubs.tsx) appelle POST /clubs/memberships/ (club_id +
student_id dans le corps) et DELETE /clubs/memberships/{id}/ (id
d'adhésion dans l'URL) depuis toujours, mais les routes qui existaient
ici étaient POST /clubs/{club_id}/members/ et
DELETE /clubs/{club_id}/members/{user_id}/ — un 404 systématique côté
UI, jamais couvert par un test avant cette suite (aucun test n'existait
pour ce module)."""
import uuid
from datetime import date

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

BASE = "/api/v1/clubs"


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Clubs Test", slug=f"clubs-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Ibrahima", last_name="Diallo",
            date_of_birth=date(2011, 5, 10), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


class TestClubsAuthGuards:
    def test_list_clubs_requires_auth(self):
        resp = client.get(f"{BASE}/")
        assert resp.status_code in (401, 403)

    def test_create_club_requires_auth(self):
        resp = client.post(f"{BASE}/", json={"name": "x"})
        assert resp.status_code in (401, 403)

    def test_list_memberships_requires_auth(self):
        resp = client.get(f"{BASE}/memberships/")
        assert resp.status_code in (401, 403)

    def test_add_member_requires_auth(self):
        resp = client.post(f"{BASE}/memberships/", json={
            "club_id": str(uuid.uuid4()), "student_id": str(uuid.uuid4()),
        })
        assert resp.status_code in (401, 403)


class TestClubsCrudEndToEnd:
    def test_create_list_update_delete_club(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        created = client.post(f"{BASE}/", json={"name": "Club Théâtre", "max_members": 20}, headers=headers)
        assert created.status_code == 201, created.text
        club = created.json()
        assert club["name"] == "Club Théâtre"
        assert club["is_active"] is True

        listed = client.get(f"{BASE}/", headers=headers)
        assert listed.status_code == 200
        assert any(c["id"] == club["id"] for c in listed.json())

        updated = client.put(f"{BASE}/{club['id']}/", json={"description": "Nouvelle description"}, headers=headers)
        assert updated.status_code == 200
        assert updated.json()["description"] == "Nouvelle description"
        assert updated.json()["name"] == "Club Théâtre"  # inchangé

        deleted = client.delete(f"{BASE}/{club['id']}/", headers=headers)
        assert deleted.status_code == 200

        after = client.get(f"{BASE}/", headers=headers)
        assert not any(c["id"] == club["id"] for c in after.json())

    def test_clubs_scoped_to_tenant(self):
        # _as() overrides get_current_user via a single global dependency
        # override (not per-request) — it must be called immediately before
        # the request that should use its identity, not batched upfront,
        # or every request ends up using whichever _as() ran last.
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()

        headers_a = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})
        client.post(f"{BASE}/", json={"name": "Club A"}, headers=headers_a)

        headers_b = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_b})
        resp_b = client.get(f"{BASE}/", headers=headers_b)
        assert resp_b.json() == []


class TestClubMembershipsRouteShape:
    """Le vrai bug : la route doit accepter club_id dans le CORPS (POST) et
    l'id d'adhésion dans l'URL (DELETE) — pas club_id dans l'URL."""

    def test_add_member_via_body_club_id(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        club_resp = client.post(f"{BASE}/", json={"name": "Club Robotique"}, headers=headers)
        club_id = club_resp.json()["id"]

        added = client.post(f"{BASE}/memberships/", json={
            "club_id": club_id, "student_id": student_id,
        }, headers=headers)
        assert added.status_code == 201, added.text
        membership = added.json()
        assert membership["club_id"] == club_id
        assert membership["student_id"] == student_id
        assert membership["role"] == "MEMBER"

    def test_add_member_to_nonexistent_club_404s(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/memberships/", json={
            "club_id": str(uuid.uuid4()), "student_id": student_id,
        }, headers=headers)
        assert resp.status_code == 404

    def test_remove_member_via_membership_id_in_url(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        club_id = client.post(f"{BASE}/", json={"name": "Club Musique"}, headers=headers).json()["id"]
        membership_id = client.post(f"{BASE}/memberships/", json={
            "club_id": club_id, "student_id": student_id,
        }, headers=headers).json()["id"]

        removed = client.delete(f"{BASE}/memberships/{membership_id}/", headers=headers)
        assert removed.status_code == 200

        remaining = client.get(f"{BASE}/memberships/", headers=headers)
        assert not any(m["id"] == membership_id for m in remaining.json())

    def test_remove_nonexistent_membership_404s(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.delete(f"{BASE}/memberships/{uuid.uuid4()}/", headers=headers)
        assert resp.status_code == 404
