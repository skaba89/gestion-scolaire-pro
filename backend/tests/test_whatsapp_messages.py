"""Inbound WhatsApp message persistence (Phase 3, WhatsApp/offline
hardening brief) — process_webhook_event() creates/reuses a MessageThread
per (tenant, parent) and a MessageItem per inbound message, instead of
just counting them.

phone_number_id values are randomized per test (not literal digit
strings) — the test DB is a persistent SQLite file across runs (see
conftest.py), and resolve_tenant_settings_by_phone_id() resolves a tenant
by iterating ALL tenants for a whatsappPhoneId match; a hardcoded literal
reused across test runs would silently resolve to a stale tenant left
over from a previous run instead of the one this test just created.
"""
import datetime
import uuid

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.models.message_item import MessageItem  # noqa: E402
from app.models.message_thread import MessageThread  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Student  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

WEBHOOK_URL = "/api/v1/whatsapp/webhook/"


def _phone_number_id() -> str:
    """A fake Meta phone_number_id, unique per call."""
    return f"pnid{uuid.uuid4().hex[:12]}"


def _make_tenant(**settings) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Messages Test", slug=f"wamsg-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings=settings,
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


def _inbound_payload(*, phone_number_id: str, from_phone: str, text: str, message_id: str) -> dict:
    return {
        "entry": [{
            "changes": [{
                "value": {
                    "metadata": {"phone_number_id": phone_number_id},
                    "messages": [{
                        "id": message_id,
                        "from": from_phone,
                        "type": "text",
                        "text": {"body": text},
                    }],
                }
            }]
        }]
    }


class TestInboundMessagePersistence:
    def test_message_from_known_parent_creates_thread_and_item(self):
        pnid = _phone_number_id()
        tenant_id = _make_tenant(whatsappPhoneId=pnid)
        parent_id = _make_parent(tenant_id, "+224623456789")
        mid = f"wamid.{uuid.uuid4().hex}"

        resp = client.post(WEBHOOK_URL, json=_inbound_payload(
            phone_number_id=pnid, from_phone="224623456789",
            text="Bonjour, mon enfant est malade aujourd'hui.", message_id=mid,
        ))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["messages_persisted"] == 1
        assert body["errors"] == 0

        with SessionLocal() as db:
            item = db.query(MessageItem).filter(MessageItem.provider_message_id == mid).first()
            assert item is not None
            assert item.direction == "INBOUND"
            assert item.channel == "whatsapp"
            assert item.sender_type == "parent"
            assert str(item.sender_user_id) == parent_id
            assert "malade" in item.body

            thread = db.query(MessageThread).filter(MessageThread.id == item.thread_id).first()
            assert thread is not None
            assert str(thread.tenant_id) == tenant_id
            assert str(thread.parent_id) == parent_id
            assert thread.status == "OPEN"
            assert thread.source_channel == "whatsapp"

    def test_message_links_student_via_parent_student(self):
        pnid = _phone_number_id()
        tenant_id = _make_tenant(whatsappPhoneId=pnid)
        parent_id = _make_parent(tenant_id, "+224611112222")
        student_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Student(
                id=student_id, tenant_id=tenant_id, first_name="Ibrahima", last_name="Bah",
                registration_number=f"REG-{uuid.uuid4().hex[:6]}", status="ACTIVE",
                date_of_birth=datetime.date(2015, 1, 1), gender="MALE",
            ))
            db.add(ParentStudent(tenant_id=tenant_id, parent_id=parent_id, student_id=student_id))
            db.commit()

        mid = f"wamid.{uuid.uuid4().hex}"
        resp = client.post(WEBHOOK_URL, json=_inbound_payload(
            phone_number_id=pnid, from_phone="224611112222",
            text="Merci pour le bulletin.", message_id=mid,
        ))
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            item = db.query(MessageItem).filter(MessageItem.provider_message_id == mid).first()
            thread = db.query(MessageThread).filter(MessageThread.id == item.thread_id).first()
            assert str(thread.student_id) == student_id

    def test_second_message_from_same_parent_reuses_open_thread(self):
        pnid = _phone_number_id()
        tenant_id = _make_tenant(whatsappPhoneId=pnid)
        _make_parent(tenant_id, "+224699998888")

        mid1 = f"wamid.{uuid.uuid4().hex}"
        mid2 = f"wamid.{uuid.uuid4().hex}"
        client.post(WEBHOOK_URL, json=_inbound_payload(
            phone_number_id=pnid, from_phone="224699998888",
            text="Premier message", message_id=mid1,
        ))
        client.post(WEBHOOK_URL, json=_inbound_payload(
            phone_number_id=pnid, from_phone="224699998888",
            text="Deuxième message", message_id=mid2,
        ))

        with SessionLocal() as db:
            item1 = db.query(MessageItem).filter(MessageItem.provider_message_id == mid1).first()
            item2 = db.query(MessageItem).filter(MessageItem.provider_message_id == mid2).first()
            assert item1 is not None and item2 is not None
            assert item1.thread_id == item2.thread_id
            thread_count = (
                db.query(MessageThread)
                .filter(MessageThread.tenant_id == tenant_id)
                .count()
            )
            assert thread_count == 1

    def test_message_from_unknown_number_still_persisted_as_unmatched_sender(self):
        """A number that doesn't match any User must not be dropped —
        it's recorded with sender_type='unknown' and no crash."""
        pnid = _phone_number_id()
        _make_tenant(whatsappPhoneId=pnid)
        mid = f"wamid.{uuid.uuid4().hex}"

        resp = client.post(WEBHOOK_URL, json=_inbound_payload(
            phone_number_id=pnid, from_phone="224600000000",
            text="Qui êtes-vous ?", message_id=mid,
        ))
        assert resp.status_code == 200, resp.text
        assert resp.json()["messages_persisted"] == 1

        with SessionLocal() as db:
            item = db.query(MessageItem).filter(MessageItem.provider_message_id == mid).first()
            assert item is not None
            assert item.sender_type == "unknown"
            assert item.sender_user_id is None

    def test_duplicate_provider_message_id_is_not_persisted_twice(self):
        """Webhook replay guard — a redelivered event must never create a
        second MessageItem row for the same provider_message_id."""
        pnid = _phone_number_id()
        tenant_id = _make_tenant(whatsappPhoneId=pnid)
        _make_parent(tenant_id, "+224655554444")
        mid = f"wamid.{uuid.uuid4().hex}"
        payload = _inbound_payload(
            phone_number_id=pnid, from_phone="224655554444",
            text="Bonjour", message_id=mid,
        )

        resp1 = client.post(WEBHOOK_URL, json=payload)
        resp2 = client.post(WEBHOOK_URL, json=payload)
        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert resp1.json()["messages_persisted"] == 1
        assert resp2.json()["messages_persisted"] == 0

        with SessionLocal() as db:
            count = db.query(MessageItem).filter(MessageItem.provider_message_id == mid).count()
            assert count == 1

    def test_unresolved_tenant_counts_as_unmatched_not_error(self):
        mid = f"wamid.{uuid.uuid4().hex}"
        resp = client.post(WEBHOOK_URL, json=_inbound_payload(
            phone_number_id="not-any-tenants-phone-id", from_phone="224600000000",
            text="Test", message_id=mid,
        ))
        assert resp.status_code == 200
        body = resp.json()
        assert body["unmatched"] >= 1
        assert body["errors"] == 0
        assert body["messages_persisted"] == 0

    def test_non_text_message_type_is_persisted_with_placeholder_body(self):
        pnid = _phone_number_id()
        tenant_id = _make_tenant(whatsappPhoneId=pnid)
        _make_parent(tenant_id, "+224688887777")
        mid = f"wamid.{uuid.uuid4().hex}"
        payload = {
            "entry": [{"changes": [{"value": {
                "metadata": {"phone_number_id": pnid},
                "messages": [{"id": mid, "from": "224688887777", "type": "image"}],
            }}]}]
        }
        resp = client.post(WEBHOOK_URL, json=payload)
        assert resp.status_code == 200, resp.text
        assert resp.json()["messages_persisted"] == 1

        with SessionLocal() as db:
            item = db.query(MessageItem).filter(MessageItem.provider_message_id == mid).first()
            assert item is not None
            assert "image" in item.body
