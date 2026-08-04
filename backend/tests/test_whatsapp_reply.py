"""POST /communication/conversations/{thread_id}/reply-whatsapp/ (Phase 4,
WhatsApp/offline hardening brief) — school -> parent replies on an existing
WhatsApp thread. The actual Graph API send is queued via Arq
(send_whatsapp_reply_job), never performed inside the request — this test
suite only exercises the synchronous part: authorization, MessageItem
creation, and the audit log, mocking enqueue_job so no real Redis/network
call happens.
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user, get_password_hash  # noqa: E402
from app.main import app  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.message_item import MessageItem  # noqa: E402
from app.models.message_thread import MessageThread  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

REPLY_URL = "/api/v1/communication/conversations/{thread_id}/reply-whatsapp/"
HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user_id: str, tenant_id: str, roles: list) -> dict:
    user = {"id": user_id, "roles": roles, "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _make_staff(tenant_id: str) -> str:
    """A real User row — MessageItem.sender_user_id has a FK to users.id,
    so the caller's id must exist in the DB, unlike a purely mocked
    current_user dict used elsewhere for lighter-weight tests."""
    user_id = str(uuid.uuid4())
    email = f"staff.{uuid.uuid4().hex[:6]}@example.gn"
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Ousmane", last_name="Camara",
            password_hash=get_password_hash("x"), is_active=True, is_verified=True,
        ))
        db.commit()
    return user_id


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Reply Test", slug=f"reply-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_parent(tenant_id: str, phone: str) -> str:
    user_id = str(uuid.uuid4())
    email = f"parent.{uuid.uuid4().hex[:6]}@example.gn"
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Mariama", last_name="Bah", phone=phone,
            password_hash=get_password_hash("x"), is_active=True, is_verified=True,
        ))
        db.commit()
    return user_id


def _make_thread(tenant_id: str, parent_id: str) -> str:
    with SessionLocal() as db:
        thread = MessageThread(tenant_id=tenant_id, parent_id=parent_id, status="OPEN", source_channel="whatsapp")
        db.add(thread)
        db.commit()
        db.refresh(thread)
        return str(thread.id)


class TestReplyWhatsApp:
    def test_teacher_can_reply_and_message_item_is_queued(self):
        tenant_id = _make_tenant()
        parent_id = _make_parent(tenant_id, "+224677889900")
        thread_id = _make_thread(tenant_id, parent_id)
        headers = _as(_make_staff(tenant_id), tenant_id, ["TEACHER"])

        with patch("app.core.jobs.enqueue_job", new=AsyncMock(return_value="job-1")) as mock_enqueue:
            resp = client.post(
                REPLY_URL.format(thread_id=thread_id),
                json={"body": "Merci, nous avons bien reçu votre message."},
                headers=headers,
            )
        assert resp.status_code == 202, resp.text
        body = resp.json()
        assert body["thread_id"] == thread_id
        assert body["status"] == "QUEUED"
        mock_enqueue.assert_awaited_once()

        with SessionLocal() as db:
            item = db.query(MessageItem).filter(MessageItem.id == body["id"]).first()
            assert item is not None
            assert item.direction == "OUTBOUND"
            assert item.sender_type == "school"
            assert item.status == "QUEUED"

            log = (
                db.query(AuditLog)
                .filter(AuditLog.action == "whatsapp_reply_queued", AuditLog.resource_id == body["id"])
                .first()
            )
            assert log is not None

    def test_parent_role_without_admin_privileges_is_forbidden(self):
        tenant_id = _make_tenant()
        parent_id = _make_parent(tenant_id, "+224677889901")
        thread_id = _make_thread(tenant_id, parent_id)
        headers = _as(str(uuid.uuid4()), tenant_id, ["PARENT"])

        resp = client.post(
            REPLY_URL.format(thread_id=thread_id),
            json={"body": "Réponse non autorisée"},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_empty_body_is_rejected(self):
        tenant_id = _make_tenant()
        parent_id = _make_parent(tenant_id, "+224677889902")
        thread_id = _make_thread(tenant_id, parent_id)
        headers = _as(_make_staff(tenant_id), tenant_id, ["DIRECTOR"])

        resp = client.post(
            REPLY_URL.format(thread_id=thread_id),
            json={"body": "   "},
            headers=headers,
        )
        assert resp.status_code == 400

    def test_thread_from_another_tenant_returns_404(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        parent_id = _make_parent(tenant_a, "+224677889903")
        thread_id = _make_thread(tenant_a, parent_id)
        headers = _as(_make_staff(tenant_b), tenant_b, ["DIRECTOR"])

        resp = client.post(
            REPLY_URL.format(thread_id=thread_id),
            json={"body": "Ne devrait pas passer"},
            headers=headers,
        )
        assert resp.status_code == 404
