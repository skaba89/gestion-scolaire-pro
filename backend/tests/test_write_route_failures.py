"""Routes d'écriture qui répondaient 500 (parcours CRAWL-W, 2026-11-11).

- PATCH /platform/branding/me/ : 500 à CHAQUE enregistrement (TypeError après
  la sauvegarde : `request` non transmis au relecteur).
- PATCH /users/profiles/{id}/ : `bio` visait une colonne inexistante (500) ;
  un corps avec seulement `email` (écarté) produisait un UPDATE vide (500) ;
  un identifiant non UUID atteignait PostgreSQL (500).
- POST /subject-preferred-rooms/ : un corps incomplet levait un KeyError (500).
"""
import os
import uuid

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _tenant() -> str:
    tid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École Écritures", slug=f"wr-{tid[:8]}", type="primary",
                      country="GN", is_active=True, settings={}))
        db.commit()
    return tid


def _user(tenant_id: str) -> str:
    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=uid, tenant_id=tenant_id, email=f"w.{uid[:8]}@ecole.gn", username=f"w.{uid[:8]}",
                    first_name="Awa", last_name="Diallo", password_hash="x", is_active=True))
        db.commit()
    return uid


def _as(user_id: str, tenant_id: str, roles: list) -> dict:
    user = {"id": user_id, "roles": roles, "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user_id, "tenant_id": tenant_id, "roles": roles})
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


def test_branding_update_returns_the_saved_branding():
    tid = _tenant()
    headers = _as(_user(tid), tid, ["TENANT_ADMIN"])
    resp = client.patch("/api/v1/platform/branding/me/", json={"public_name": "Lycée Donka"}, headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["public_name"] == "Lycée Donka"
    assert client.get("/api/v1/platform/branding/me/", headers=headers).json()["public_name"] == "Lycée Donka"


@pytest.mark.skipif(not os.environ.get("DATABASE_URL", "").startswith("postgresql"),
                    reason="UPDATE … NOW() : PostgreSQL")
def test_profile_update_of_own_avatar_still_works():
    tid = _tenant()
    uid = _user(tid)
    resp = client.patch(f"/api/v1/users/profiles/{uid}/", json={"avatar_url": "https://cdn.example/a.png"},
                        headers=_as(uid, tid, ["TEACHER"]))
    assert resp.status_code == 200, resp.text


@pytest.mark.parametrize("body", [{"bio": "Professeur de maths"}, {"email": "autre@ecole.gn"}])
def test_profile_update_refuses_fields_it_cannot_store(body):
    tid = _tenant()
    uid = _user(tid)
    resp = client.patch(f"/api/v1/users/profiles/{uid}/", json=body, headers=_as(uid, tid, ["TEACHER"]))
    assert resp.status_code == 422, resp.text
    assert "non modifiable" in resp.text


def test_profile_update_with_malformed_id_is_422():
    tid = _tenant()
    uid = _user(tid)
    resp = client.patch("/api/v1/users/profiles/pas-un-uuid/", json={"first_name": "A"},
                        headers=_as(uid, tid, ["TENANT_ADMIN"]))
    assert resp.status_code == 422, resp.text


@pytest.mark.parametrize("body", [{}, {"subject_id": str(uuid.uuid4())}])
def test_preferred_room_incomplete_body_is_422(body):
    tid = _tenant()
    resp = client.post("/api/v1/subject-preferred-rooms/", json=body,
                       headers=_as(_user(tid), tid, ["TENANT_ADMIN"]))
    assert resp.status_code == 422, resp.text
