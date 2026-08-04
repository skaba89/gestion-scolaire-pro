"""POST /payments/send-reminders/ — WhatsApp business-event wiring.

Verifies the endpoint enqueues a tracked send_whatsapp_notification job per
overdue invoice with a phone number, with a stable per-invoice idempotency
key (so calling this endpoint twice for the same invoice never double-sends
via the Arq queue's own de-duplication — see app/core/jobs.py:enqueue_job).

Postgres-only: invoices/students are RLS-scoped tables, exercised against
Postgres elsewhere in this suite (see test_payment_sequential_reference.py).
"""
import uuid
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="invoices/students are RLS-scoped tables, exercised against Postgres in this suite.",
)

URL = "/api/v1/payments/send-reminders/"
HEADERS = {"Authorization": "Bearer mock-token"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Rappel WhatsApp", slug=f"wa-remind-{uuid.uuid4().hex[:8]}",
            type="primary", country="GN", is_active=True,
            settings={"whatsappAccessToken": "tok", "whatsappPhoneId": "555"},
        ))
        db.commit()
    return tenant_id


def _make_overdue_invoice_with_parent(tenant_id: str) -> tuple[str, str]:
    student_id = str(uuid.uuid4())
    parent_id = str(uuid.uuid4())
    invoice_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"REG-{uuid.uuid4().hex[:8]}",
            first_name="Ibrahima", last_name="Test", date_of_birth=date(2012, 1, 1),
            gender=Gender.MALE, status=StudentStatus.ACTIVE,
        ))
        db.add(User(
            id=parent_id, tenant_id=tenant_id, email=f"{parent_id[:8]}@example.com",
            username=f"parent-{parent_id[:8]}", password_hash="x", first_name="Mariama", last_name="Parent",
            phone="+224623456789", is_active=True,
        ))
        db.commit()
        from sqlalchemy import text
        db.execute(text(
            "INSERT INTO parent_students (id, tenant_id, student_id, parent_id, relation_type, created_at, updated_at) "
            "VALUES (:id, :tid, :sid, :pid, 'parent', NOW(), NOW())"
        ), {"id": str(uuid.uuid4()), "tid": tenant_id, "sid": student_id, "pid": parent_id})
        db.add(Invoice(
            id=invoice_id, tenant_id=tenant_id, student_id=student_id,
            invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
            issue_date=date.today() - timedelta(days=40),
            due_date=date.today() - timedelta(days=10),
            subtotal=100000.0, total_amount=100000.0, paid_amount=0.0,
            status=InvoiceStatus.OVERDUE,
        ))
        db.commit()
    return invoice_id, student_id


def _as_tenant_admin(tenant_id: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestWhatsAppReminderEnqueue:
    def test_enqueues_one_whatsapp_job_per_invoice_with_phone(self):
        tenant_id = _make_tenant()
        invoice_id, student_id = _make_overdue_invoice_with_parent(tenant_id)
        headers = _as_tenant_admin(tenant_id)

        mock_enqueue = AsyncMock(return_value="arq-job-id-123")
        with patch("app.core.jobs.enqueue_job", new=mock_enqueue):
            resp = client.post(URL, json={"invoice_ids": [invoice_id]}, headers=headers)

        assert resp.status_code == 200, resp.text
        mock_enqueue.assert_awaited_once()
        call = mock_enqueue.await_args
        assert call.args[0] == "send_whatsapp_notification"
        assert call.kwargs["event_type"] == "payment_reminder"
        assert call.kwargs["to_phone"] == "+224623456789"
        assert call.kwargs["student_id"] == student_id
        assert call.kwargs["_job_id"] == f"wa:payment_reminder:{invoice_id}"

    def test_enqueue_failure_falls_back_to_untracked_delivery(self):
        """If Redis is unreachable, enqueue_job fails open (returns None,
        see app/core/jobs.py) — the invoice must still be queued for the
        older untracked delivery path (push/email/WhatsApp via
        NotificationService), not silently dropped."""
        tenant_id = _make_tenant()
        invoice_id, _ = _make_overdue_invoice_with_parent(tenant_id)
        headers = _as_tenant_admin(tenant_id)

        with patch("app.core.jobs.enqueue_job", new=AsyncMock(return_value=None)):
            with patch(
                "app.api.v1.endpoints.finance.payments._deliver_reminders_background"
            ) as mock_deliver:
                resp = client.post(URL, json={"invoice_ids": [invoice_id]}, headers=headers)

        assert resp.status_code == 200, resp.text
        mock_deliver.assert_called_once()
        _svc, deliveries = mock_deliver.call_args.args
        assert len(deliveries) == 1
        assert deliveries[0]["_skip_whatsapp"] is False
