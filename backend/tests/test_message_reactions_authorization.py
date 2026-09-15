"""Authorization on GET/POST /api/v1/communication/messages/{message_id}/reactions/
(institutional-readiness audit, 2026-09).

Before this fix, both endpoints took an arbitrary message_id with no check
that the caller is even a participant of the conversation it belongs to —
get_messages()/send_message() on the same router already enforce this via a
conversation_participants lookup, but the reactions endpoints didn't. Any
authenticated tenant user could see who reacted to, or react to, a message
inside a private 1-on-1 conversation they have no part in.

conversations/conversation_participants/messages/message_reactions are
raw-SQL operational tables (see app/core/operational_tables.py,
Postgres-specific DDL) never created in the SQLite test lifespan — same
constraint as test_announcements_authorization.py.
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
pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="conversations/messages/message_reactions are raw-SQL "
           "operational tables whose DDL is Postgres-specific — see "
           "app/core/operational_tables.py. Exercised by the CI Postgres job.",
)

if engine.dialect.name == "postgresql":
    # message_reactions is created by app.core.operational_tables at real
    # app startup (lifespan) — self-healing in actual production/staging —
    # but the test client installs a no-op lifespan (conftest.get_test_client)
    # and `alembic upgrade head` alone never created this table (added to
    # operational_tables.py after that migration was frozen). Run the same
    # startup step explicitly so this test exercises the real schema.
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Reactions Test", slug=f"reactions-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
            subscription_plan="starter", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", password_hash="x",
            first_name="Test", last_name="User", is_active=True,
        ))
        db.commit()
    return user_id


def _make_private_conversation_with_message(tenant_id: str, participant_ids: list) -> str:
    from sqlalchemy import text
    conv_id = str(uuid.uuid4())
    msg_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text(
            "INSERT INTO conversations (id, tenant_id, type) VALUES (:id, :tid, 'DIRECT')"
        ), {"id": conv_id, "tid": tenant_id})
        for uid in participant_ids:
            db.execute(text("""
                INSERT INTO conversation_participants (id, conversation_id, user_id)
                VALUES (:id, :cid, :uid)
            """), {"id": str(uuid.uuid4()), "cid": conv_id, "uid": uid})
        db.execute(text("""
            INSERT INTO messages (id, conversation_id, sender_id, content, tenant_id)
            VALUES (:id, :cid, :sid, 'Message privé confidentiel', :tid)
        """), {"id": msg_id, "cid": conv_id, "sid": participant_ids[0], "tid": tenant_id})
        db.commit()
    return msg_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestNonParticipantCannotAccessReactions:
    def test_outsider_cannot_list_reactions(self):
        tenant_id = _make_tenant()
        alice = _make_user(tenant_id)
        bob = _make_user(tenant_id)
        outsider = _make_user(tenant_id)
        message_id = _make_private_conversation_with_message(tenant_id, [alice, bob])

        resp = _as({"id": outsider, "roles": ["TEACHER"], "tenant_id": tenant_id}).get(
            f"/api/v1/communication/messages/{message_id}/reactions/", headers=HEADERS,
        )
        assert resp.status_code == 403

    def test_outsider_cannot_add_reaction(self):
        tenant_id = _make_tenant()
        alice = _make_user(tenant_id)
        bob = _make_user(tenant_id)
        outsider = _make_user(tenant_id)
        message_id = _make_private_conversation_with_message(tenant_id, [alice, bob])

        resp = _as({"id": outsider, "roles": ["STUDENT"], "tenant_id": tenant_id}).post(
            f"/api/v1/communication/messages/{message_id}/reactions/",
            json={"emoji": "👍"}, headers=HEADERS,
        )
        assert resp.status_code == 403


class TestParticipantAccessKeepsWorking:
    def test_participant_can_list_and_add_reaction(self):
        tenant_id = _make_tenant()
        alice = _make_user(tenant_id)
        bob = _make_user(tenant_id)
        message_id = _make_private_conversation_with_message(tenant_id, [alice, bob])

        resp = _as({"id": bob, "roles": ["TEACHER"], "tenant_id": tenant_id}).get(
            f"/api/v1/communication/messages/{message_id}/reactions/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text

        resp = _as({"id": bob, "roles": ["TEACHER"], "tenant_id": tenant_id}).post(
            f"/api/v1/communication/messages/{message_id}/reactions/",
            json={"emoji": "👍"}, headers=HEADERS,
        )
        assert resp.status_code == 201, resp.text
