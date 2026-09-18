"""shared-note-likes / shared-note-comments (aliases.py) — institutional-
readiness audit, 2026-09.

Neither shared_note_likes nor shared_note_comments has a tenant_id column
of its own — scoping must come from joining to shared_notes. Unlike
shared_notes_router (its sibling just above these in aliases.py, which
does scope by tenant), none of list_note_likes/like_note/unlike_note/
list_note_comments/create_note_comment validated or filtered by tenant at
all. Any authenticated user in any tenant could read/like/comment on a
note belonging to a different school.

shared_notes/shared_note_likes/shared_note_comments are raw-SQL
operational tables — Postgres-only, same pattern as
test_message_reactions_authorization.py."""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="shared_notes/shared_note_likes/shared_note_comments are raw-SQL "
           "operational tables whose DDL is Postgres-specific and never "
           "created on SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Notes Partagées Test", slug=f"notes-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", is_active=True,
        ))
        db.commit()
    return user_id


def _make_note(tenant_id: str, author_id: str) -> str:
    from sqlalchemy import text
    note_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO shared_notes (id, tenant_id, author_id, title, content)
            VALUES (:id, :tid, :aid, 'Note confidentielle', 'Contenu confidentiel')
        """), {"id": note_id, "tid": tenant_id, "aid": author_id})
        db.commit()
    return note_id


class TestNoteLikesTenantScoping:
    def test_cannot_like_note_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        author_id = _make_user(tenant_b)
        foreign_note_id = _make_note(tenant_b, author_id)
        attacker_id = _make_user(tenant_a)
        headers = _as({"id": attacker_id, "roles": ["TEACHER"], "tenant_id": tenant_a})

        resp = client.post("/api/v1/shared-note-likes/", json={"note_id": foreign_note_id}, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_cannot_list_likes_for_note_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        author_id = _make_user(tenant_b)
        foreign_note_id = _make_note(tenant_b, author_id)
        attacker_id = _make_user(tenant_a)
        headers = _as({"id": attacker_id, "roles": ["TEACHER"], "tenant_id": tenant_a})

        resp = client.get("/api/v1/shared-note-likes/", params={"note_id__in": foreign_note_id}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json() == []

    def test_can_like_own_tenant_note(self):
        tenant_id = _make_tenant()
        author_id = _make_user(tenant_id)
        note_id = _make_note(tenant_id, author_id)
        user_id = _make_user(tenant_id)
        headers = _as({"id": user_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.post("/api/v1/shared-note-likes/", json={"note_id": note_id}, headers=headers)
        assert resp.status_code == 201, resp.text


class TestNoteCommentsTenantScoping:
    def test_cannot_comment_on_note_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        author_id = _make_user(tenant_b)
        foreign_note_id = _make_note(tenant_b, author_id)
        attacker_id = _make_user(tenant_a)
        headers = _as({"id": attacker_id, "roles": ["TEACHER"], "tenant_id": tenant_a})

        resp = client.post("/api/v1/shared-note-comments/", json={
            "note_id": foreign_note_id, "content": "Espionnage",
        }, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_cannot_list_comments_for_note_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        author_id = _make_user(tenant_b)
        foreign_note_id = _make_note(tenant_b, author_id)
        attacker_id = _make_user(tenant_a)
        headers = _as({"id": attacker_id, "roles": ["TEACHER"], "tenant_id": tenant_a})

        resp = client.get("/api/v1/shared-note-comments/", params={"note_id": foreign_note_id}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json() == []

    def test_can_comment_on_own_tenant_note(self):
        tenant_id = _make_tenant()
        author_id = _make_user(tenant_id)
        note_id = _make_note(tenant_id, author_id)
        user_id = _make_user(tenant_id)
        headers = _as({"id": user_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.post("/api/v1/shared-note-comments/", json={
            "note_id": note_id, "content": "Bien joué",
        }, headers=headers)
        assert resp.status_code == 201, resp.text
