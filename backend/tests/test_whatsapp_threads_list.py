"""GET /communication/whatsapp-threads/ and
GET /communication/whatsapp-threads/{id}/messages/ — the school-side inbox
for WhatsApp conversations (follows Phase 4's reply-whatsapp endpoint;
same _WHATSAPP_REPLY_ROLES gate as who's allowed to reply).
"""
import datetime
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user, get_password_hash  # noqa: E402
from app.main import app  # noqa: E402
from app.models.message_item import MessageItem  # noqa: E402
from app.models.message_thread import MessageThread  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Student  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

THREADS_URL = "/api/v1/communication/whatsapp-threads/"
MESSAGES_URL = "/api/v1/communication/whatsapp-threads/{thread_id}/messages/"
HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user_id: str, tenant_id: str, roles: list) -> dict:
    user = {"id": user_id, "roles": roles, "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Threads Test", slug=f"threads-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_parent(tenant_id: str, phone: str, first_name="Mariama", last_name="Bah") -> str:
    user_id = str(uuid.uuid4())
    email = f"parent.{uuid.uuid4().hex[:6]}@example.gn"
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name=first_name, last_name=last_name, phone=phone,
            password_hash=get_password_hash("x"), is_active=True, is_verified=True,
        ))
        db.commit()
    return user_id


def _make_student(tenant_id: str, parent_id: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, first_name="Ibrahima", last_name="Bah",
            registration_number=f"REG-{uuid.uuid4().hex[:6]}", status="ACTIVE",
            date_of_birth=datetime.date(2015, 1, 1), gender="MALE",
        ))
        db.add(ParentStudent(tenant_id=tenant_id, parent_id=parent_id, student_id=student_id))
        db.commit()
    return student_id


def _make_thread_with_message(tenant_id: str, parent_id: str, body: str, direction="INBOUND", student_id: str = None) -> str:
    with SessionLocal() as db:
        thread = MessageThread(
            tenant_id=tenant_id, parent_id=parent_id, student_id=student_id,
            status="OPEN", source_channel="whatsapp",
        )
        db.add(thread)
        db.flush()
        item = MessageItem(
            tenant_id=tenant_id, thread_id=thread.id, sender_type="parent" if direction == "INBOUND" else "school",
            direction=direction, channel="whatsapp", body=body, status="RECEIVED" if direction == "INBOUND" else "SENT",
        )
        db.add(item)
        db.commit()
        db.refresh(thread)
        return str(thread.id)


class TestListWhatsAppThreads:
    def test_lists_threads_with_last_message_preview(self):
        tenant_id = _make_tenant()
        parent_id = _make_parent(tenant_id, "+224677001122")
        student_id = _make_student(tenant_id, parent_id)
        thread_id = _make_thread_with_message(tenant_id, parent_id, "Bonjour, mon fils est malade.", student_id=student_id)

        headers = _as(str(uuid.uuid4()), tenant_id, ["TEACHER"])
        resp = client.get(THREADS_URL, headers=headers)
        assert resp.status_code == 200, resp.text
        threads = resp.json()
        assert len(threads) == 1
        assert threads[0]["id"] == thread_id
        assert threads[0]["parent_name"] == "Mariama Bah"
        assert threads[0]["student_name"] == "Ibrahima Bah"
        assert threads[0]["last_message"] == "Bonjour, mon fils est malade."
        assert threads[0]["last_message_direction"] == "INBOUND"

    def test_forbidden_for_non_admin_role(self):
        tenant_id = _make_tenant()
        headers = _as(str(uuid.uuid4()), tenant_id, ["PARENT"])
        resp = client.get(THREADS_URL, headers=headers)
        assert resp.status_code == 403

    def test_does_not_leak_other_tenants_threads(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        parent_a = _make_parent(tenant_a, "+224677001100")
        _make_thread_with_message(tenant_a, parent_a, "Message tenant A")

        headers = _as(str(uuid.uuid4()), tenant_b, ["DIRECTOR"])
        resp = client.get(THREADS_URL, headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []


class TestListWhatsAppThreadMessages:
    def test_returns_full_history_oldest_first(self):
        tenant_id = _make_tenant()
        parent_id = _make_parent(tenant_id, "+224677002233")
        thread_id = _make_thread_with_message(tenant_id, parent_id, "Premier message")
        with SessionLocal() as db:
            db.add(MessageItem(
                tenant_id=tenant_id, thread_id=thread_id, sender_type="school",
                direction="OUTBOUND", channel="whatsapp", body="Réponse de l'école", status="SENT",
            ))
            db.commit()

        headers = _as(str(uuid.uuid4()), tenant_id, ["SECRETARY"])
        resp = client.get(MESSAGES_URL.format(thread_id=thread_id), headers=headers)
        assert resp.status_code == 200, resp.text
        messages = resp.json()
        assert len(messages) == 2
        assert messages[0]["body"] == "Premier message"
        assert messages[0]["direction"] == "INBOUND"
        assert messages[1]["body"] == "Réponse de l'école"
        assert messages[1]["direction"] == "OUTBOUND"

    def test_thread_from_another_tenant_returns_404(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        parent_id = _make_parent(tenant_a, "+224677003344")
        thread_id = _make_thread_with_message(tenant_a, parent_id, "Message tenant A")

        headers = _as(str(uuid.uuid4()), tenant_b, ["DIRECTOR"])
        resp = client.get(MESSAGES_URL.format(thread_id=thread_id), headers=headers)
        assert resp.status_code == 404
