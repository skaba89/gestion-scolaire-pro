"""Idempotence of POST /communication/conversations/{id}/messages/ (fine
points brief, Phase 5 required backend test: "POST communication messages
idempotent").

conversations/conversation_participants/messages have no Alembic migration
— they exist only because ensure_operational_tables(engine) creates them at
real app startup (see app/core/operational_tables.py). get_test_client()'s
no-op lifespan skips that call, so this file triggers it explicitly (same
pattern as test_teachers.py / test_operational_pagination.py). Also
Postgres-only: the endpoint's raw INSERT relies on gen_random_uuid().
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_password_hash, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from sqlalchemy import text  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="send_message() relies on gen_random_uuid() (Postgres-only) via ensure_operational_tables().",
)

if engine.dialect.name == "postgresql":
    try:
        from app.core.operational_tables import ensure_operational_tables
        ensure_operational_tables(engine)
    except Exception:
        pass

HEADERS = {"Authorization": "Bearer mock-token"}


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


def _make_tenant_conversation_and_participant() -> tuple[str, str, str]:
    """Returns (tenant_id, user_id, conversation_id) with the user already
    a participant, so send_message()'s access check passes."""
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    email = f"msg-idem-{uuid.uuid4().hex[:8]}@example.gn"
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Messages Idem", slug=f"msg-idem-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Aissatou", last_name="Diallo",
            password_hash=get_password_hash("x"), is_active=True, is_verified=True,
        ))
        db.commit()

        conversation_id = db.execute(text(
            "INSERT INTO conversations (id, tenant_id, type) "
            "VALUES (gen_random_uuid(), :tenant_id, 'DIRECT') RETURNING id"
        ), {"tenant_id": tenant_id}).scalar()
        db.execute(text(
            "INSERT INTO conversation_participants (id, conversation_id, user_id) "
            "VALUES (gen_random_uuid(), :conv_id, :user_id)"
        ), {"conv_id": str(conversation_id), "user_id": user_id})
        db.commit()

    return tenant_id, user_id, str(conversation_id)


class TestCommunicationMessagesIdempotency:
    def test_same_key_same_body_creates_message_once(self):
        tenant_id, user_id, conversation_id = _make_tenant_conversation_and_participant()
        idem_key = f"msg-{uuid.uuid4().hex}"
        url = f"/api/v1/communication/conversations/{conversation_id}/messages/"
        user = {"id": user_id, "roles": ["TEACHER"], "tenant_id": tenant_id}

        try:
            resp1 = _as(user).post(
                url, json={"content": "Bonjour, comment allez-vous ?"},
                headers={**HEADERS, "X-Idempotency-Key": idem_key},
            )
            resp2 = _as(user).post(
                url, json={"content": "Bonjour, comment allez-vous ?"},
                headers={**HEADERS, "X-Idempotency-Key": idem_key},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert resp1.status_code == 201, resp1.text
        assert resp2.status_code == 201, resp2.text
        assert resp1.json() == resp2.json()

        with SessionLocal() as db:
            count = db.execute(text(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = :conv_id"
            ), {"conv_id": conversation_id}).scalar()
            assert count == 1

    def test_same_key_different_body_returns_409(self):
        tenant_id, user_id, conversation_id = _make_tenant_conversation_and_participant()
        idem_key = f"msg-{uuid.uuid4().hex}"
        url = f"/api/v1/communication/conversations/{conversation_id}/messages/"
        user = {"id": user_id, "roles": ["TEACHER"], "tenant_id": tenant_id}

        try:
            resp1 = _as(user).post(
                url, json={"content": "Premier contenu"},
                headers={**HEADERS, "X-Idempotency-Key": idem_key},
            )
            resp2 = _as(user).post(
                url, json={"content": "Contenu différent"},
                headers={**HEADERS, "X-Idempotency-Key": idem_key},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert resp1.status_code == 201, resp1.text
        assert resp2.status_code == 409, resp2.text

        with SessionLocal() as db:
            count = db.execute(text(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = :conv_id"
            ), {"conv_id": conversation_id}).scalar()
            assert count == 1

    def test_without_key_two_calls_create_two_messages(self):
        """No X-Idempotency-Key header → behaves exactly as before this
        feature existed (regression guard)."""
        tenant_id, user_id, conversation_id = _make_tenant_conversation_and_participant()
        url = f"/api/v1/communication/conversations/{conversation_id}/messages/"
        user = {"id": user_id, "roles": ["TEACHER"], "tenant_id": tenant_id}

        try:
            resp1 = _as(user).post(url, json={"content": "Message A"}, headers=HEADERS)
            resp2 = _as(user).post(url, json={"content": "Message B"}, headers=HEADERS)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert resp1.status_code == 201, resp1.text
        assert resp2.status_code == 201, resp2.text

        with SessionLocal() as db:
            count = db.execute(text(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = :conv_id"
            ), {"conv_id": conversation_id}).scalar()
            assert count == 2
