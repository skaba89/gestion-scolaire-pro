"""CinetPay/PayTech webhook handlers now persist one row per call in
payment_webhook_events — previously only logger.warning() on failure,
never queryable (see GET /platform/tenants/{id}/health/).

These tests exercise the paths that don't require mocking the gateway's
HMAC/API verification (no transaction_id, unknown reference, gateway not
configured for the tenant) — the signature-verification-success path is
covered indirectly by test_payment_receipt.py / test_payments.py and
would require mocking the external CinetPay/PayTech API.
"""
import uuid
from datetime import date
from unittest.mock import MagicMock, patch

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.models.payment import Payment, PaymentMethod, PaymentStatus  # noqa: E402
from app.models.payment_webhook_event import PaymentWebhookEvent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="RLS-backed tables (payments, payment_webhook_events) are exercised against Postgres in this suite.",
)

CINETPAY_URL = "/api/v1/parents/payments/webhook/cinetpay/"
PAYTECH_URL = "/api/v1/parents/payments/webhook/paytech/"


def _make_tenant(name: str = "École Webhook Log", *, settings: dict | None = None) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"webhook-log-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings=settings or {},
        ))
        db.commit()
    return tenant_id


def _make_payment(tenant_id: str, *, reference: str) -> str:
    student_id = str(uuid.uuid4())
    payment_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"REG-{uuid.uuid4().hex[:8]}",
            first_name="Test", last_name="Student", date_of_birth=date(2012, 1, 1),
            gender=Gender.MALE, status=StudentStatus.ACTIVE,
        ))
        db.commit()
        db.add(Payment(
            id=payment_id, tenant_id=tenant_id, student_id=student_id,
            amount=10000.0, currency="GNF", payment_date=date.today(),
            payment_method=PaymentMethod.MOBILE_MONEY, status=PaymentStatus.PENDING,
            reference=reference,
        ))
        db.commit()
    return payment_id


class TestWebhookEndpointsReachableWithoutAuth:
    """Régression : TenantMiddleware n'exemptait pas ces deux chemins --
    CinetPay/PayTech n'ont jamais de JWT pour cette plateforme, donc tout
    appel webhook était rejeté en 401 avant même d'atteindre le handler
    (aucun paiement en ligne n'aurait jamais pu se confirmer). Trouvé en
    écrivant les tests de journalisation ci-dessous."""

    def test_cinetpay_webhook_not_rejected_with_401(self):
        resp = client.post(CINETPAY_URL, json={})
        assert resp.status_code != 401, resp.text

    def test_paytech_webhook_not_rejected_with_401(self):
        resp = client.post(PAYTECH_URL, json={})
        assert resp.status_code != 401, resp.text


class TestCinetPayWebhookLogging:
    def test_missing_transaction_id_is_logged_as_ignored(self):
        resp = client.post(CINETPAY_URL, json={})
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "ignored"

        with SessionLocal() as db:
            event = (
                db.query(PaymentWebhookEvent)
                .filter(PaymentWebhookEvent.gateway == "cinetpay", PaymentWebhookEvent.transaction_id.is_(None))
                .order_by(PaymentWebhookEvent.created_at.desc())
                .first()
            )
            assert event is not None
            assert event.outcome == "ignored"
            assert event.tenant_id is None

    def test_unknown_reference_is_logged_as_ignored(self):
        txn = f"UNKNOWN-{uuid.uuid4().hex[:8]}"
        resp = client.post(CINETPAY_URL, json={"cpm_trans_id": txn})
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            event = (
                db.query(PaymentWebhookEvent)
                .filter(PaymentWebhookEvent.transaction_id == txn)
                .first()
            )
            assert event is not None
            assert event.outcome == "ignored"
            assert event.reason == "no matching payment reference"

    def test_gateway_not_configured_is_logged_with_correct_reason(self):
        """Régression : ce cas tombait auparavant (par erreur, pendant
        l'implémentation du log) sur le message "no matching payment
        reference" alors qu'un paiement existait bel et bien -- corrigé
        pour refléter la vraie cause."""
        tenant_id = _make_tenant(settings={})  # no cinetPayApiKey/cinetPaySiteId
        txn = f"NOCFG-{uuid.uuid4().hex[:8]}"
        _make_payment(tenant_id, reference=txn)

        resp = client.post(CINETPAY_URL, json={"cpm_trans_id": txn})
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            event = (
                db.query(PaymentWebhookEvent)
                .filter(PaymentWebhookEvent.transaction_id == txn)
                .first()
            )
            assert event is not None
            assert event.tenant_id == uuid.UUID(tenant_id) or str(event.tenant_id) == tenant_id
            assert event.outcome == "ignored"
            assert event.reason == "gateway not configured for tenant"


class TestWebhookRejectionAlert:
    """A rejected webhook (bad signature/verification) schedules a
    best-effort support email — see docs/TENANT_MONITORING.md, the one
    "alerte automatique" item that was still fully missing. Tested at the
    unit level (like tests/test_async_email_delivery.py) rather than
    through the full HTTP path, which would require mocking the external
    CinetPay/PayTech gateway verification to reach the rejected branch."""

    def test_noop_when_alert_email_not_configured(self, monkeypatch):
        from app.api.v1.endpoints.operational.parents import _send_webhook_rejection_alert

        monkeypatch.setattr(settings, "ALERT_EMAIL", "")
        with patch("app.api.v1.endpoints.operational.parents.EmailSender") as mock_sender_cls:
            _send_webhook_rejection_alert("cinetpay", "TXN-1", "verification failed")
            mock_sender_cls.assert_not_called()

    def test_sends_email_when_configured(self, monkeypatch):
        from app.api.v1.endpoints.operational.parents import _send_webhook_rejection_alert

        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        mock_instance = MagicMock()
        with patch(
            "app.api.v1.endpoints.operational.parents.EmailSender", return_value=mock_instance,
        ):
            _send_webhook_rejection_alert("cinetpay", "TXN-42", "verification failed")

        mock_instance.send.assert_called_once()
        call_args = mock_instance.send.call_args
        assert call_args[0][0] == "support@schoolflow.pro"
        assert "cinetpay" in call_args[0][1].lower()
        assert "TXN-42" in call_args[0][2]

    def test_send_failure_never_raises(self, monkeypatch):
        """A broken/unreachable mail provider must never break the webhook
        response back to the gateway (this runs inside a BackgroundTask,
        but the function itself must stay exception-safe regardless)."""
        from app.api.v1.endpoints.operational.parents import _send_webhook_rejection_alert

        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        mock_instance = MagicMock()
        mock_instance.send.side_effect = RuntimeError("SMTP down")
        with patch(
            "app.api.v1.endpoints.operational.parents.EmailSender", return_value=mock_instance,
        ):
            _send_webhook_rejection_alert("paytech", "TXN-99", "verification failed")  # must not raise

    def test_log_webhook_event_schedules_alert_only_for_rejected(self):
        from app.api.v1.endpoints.operational.parents import _log_webhook_event

        tenant_id = _make_tenant("École Alerte Webhook")
        mock_bg = MagicMock()

        with SessionLocal() as db:
            _log_webhook_event(
                db, tenant_id=tenant_id, gateway="cinetpay", transaction_id="TXN-CONFIRMED",
                outcome="confirmed", background_tasks=mock_bg,
            )
        mock_bg.add_task.assert_not_called()

        with SessionLocal() as db:
            _log_webhook_event(
                db, tenant_id=tenant_id, gateway="cinetpay", transaction_id="TXN-REJECTED",
                outcome="rejected", reason="verification failed", background_tasks=mock_bg,
            )
        mock_bg.add_task.assert_called_once()
        args = mock_bg.add_task.call_args[0]
        assert args[1:] == ("cinetpay", "TXN-REJECTED", "verification failed")

    def test_log_webhook_event_without_background_tasks_does_not_crash(self):
        """Callers that don't pass background_tasks (none currently, but the
        parameter is optional) must not crash — silently skips scheduling."""
        from app.api.v1.endpoints.operational.parents import _log_webhook_event

        tenant_id = _make_tenant("École Alerte Sans BG")
        with SessionLocal() as db:
            _log_webhook_event(
                db, tenant_id=tenant_id, gateway="paytech", transaction_id="TXN-NOBG",
                outcome="rejected", reason="verification failed",
            )  # background_tasks defaults to None — must not raise


class TestPayTechWebhookLogging:
    def test_missing_transaction_id_is_logged_as_ignored(self):
        resp = client.post(PAYTECH_URL, json={})
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "ignored"

        with SessionLocal() as db:
            event = (
                db.query(PaymentWebhookEvent)
                .filter(PaymentWebhookEvent.gateway == "paytech", PaymentWebhookEvent.transaction_id.is_(None))
                .order_by(PaymentWebhookEvent.created_at.desc())
                .first()
            )
            assert event is not None
            assert event.outcome == "ignored"

    def test_gateway_not_configured_is_logged(self):
        tenant_id = _make_tenant("École Webhook PayTech", settings={})
        txn = f"PT-NOCFG-{uuid.uuid4().hex[:8]}"
        _make_payment(tenant_id, reference=txn)

        resp = client.post(PAYTECH_URL, json={"ref_command": txn})
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            event = (
                db.query(PaymentWebhookEvent)
                .filter(PaymentWebhookEvent.transaction_id == txn)
                .first()
            )
            assert event is not None
            assert event.outcome == "ignored"
            assert event.reason == "gateway not configured for tenant"
