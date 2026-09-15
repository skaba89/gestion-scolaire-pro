"""Import failure-rate alert (docs/TENANT_MONITORING.md).

That doc's "Alertes" table listed "Import échoué" (>50% de lignes en
erreur) as the last of the four automatic alerts still "à construire" —
this closes it, using the same best-effort email pattern already shipped
for payment webhook rejections (_send_webhook_rejection_alert in
operational/parents.py). Tested at the unit level (mocking EmailSender),
same approach as tests/test_payment_webhook_events.py::
TestWebhookRejectionAlert, since the import endpoints themselves need a
real Postgres connection (gen_random_uuid()/NOW() in their raw SQL).
"""
import uuid
from unittest.mock import MagicMock, patch

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402


def _make_tenant(**overrides) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Import Alert Test", slug=f"import-alert-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
            **overrides,
        ))
        db.commit()
    return tenant_id


class TestImportFailureAlert:
    def test_noop_when_alert_email_not_configured_and_no_tenant_email(self, monkeypatch):
        from app.api.v1.endpoints.core.imports import _maybe_alert_import_failure_rate

        monkeypatch.setattr(settings, "ALERT_EMAIL", "")
        tenant_id = _make_tenant()
        with SessionLocal() as db, patch(
            "app.api.v1.endpoints.core.imports.EmailSender"
        ) as mock_sender_cls:
            _maybe_alert_import_failure_rate(
                db, tenant_id=tenant_id, import_type="élèves", skipped=8, total=10, filename="x.csv",
            )
            mock_sender_cls.assert_not_called()

    def test_noop_when_failure_rate_at_or_below_threshold(self, monkeypatch):
        from app.api.v1.endpoints.core.imports import _maybe_alert_import_failure_rate

        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        tenant_id = _make_tenant()
        with SessionLocal() as db, patch(
            "app.api.v1.endpoints.core.imports.EmailSender"
        ) as mock_sender_cls:
            _maybe_alert_import_failure_rate(
                db, tenant_id=tenant_id, import_type="élèves", skipped=5, total=10, filename="x.csv",
            )
            mock_sender_cls.assert_not_called()

    def test_noop_when_total_is_zero(self, monkeypatch):
        from app.api.v1.endpoints.core.imports import _maybe_alert_import_failure_rate

        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        tenant_id = _make_tenant()
        with SessionLocal() as db, patch(
            "app.api.v1.endpoints.core.imports.EmailSender"
        ) as mock_sender_cls:
            _maybe_alert_import_failure_rate(
                db, tenant_id=tenant_id, import_type="élèves", skipped=0, total=0, filename="x.csv",
            )
            mock_sender_cls.assert_not_called()

    def test_sends_to_support_and_establishment_above_threshold(self, monkeypatch):
        from app.api.v1.endpoints.core.imports import _maybe_alert_import_failure_rate

        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        tenant_id = _make_tenant(email="ecole@example.com", billing_email="facturation@example.com")
        mock_instance = MagicMock()
        with SessionLocal() as db, patch(
            "app.api.v1.endpoints.core.imports.EmailSender", return_value=mock_instance,
        ):
            _maybe_alert_import_failure_rate(
                db, tenant_id=tenant_id, import_type="élèves", skipped=7, total=10, filename="eleves.csv",
            )

        recipients = {call.args[0] for call in mock_instance.send.call_args_list}
        assert recipients == {"support@schoolflow.pro", "ecole@example.com", "facturation@example.com"}
        subject = mock_instance.send.call_args_list[0].args[1]
        assert "élèves" in subject
        assert "70%" in subject

    def test_send_failure_never_raises(self, monkeypatch):
        from app.api.v1.endpoints.core.imports import _maybe_alert_import_failure_rate

        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        tenant_id = _make_tenant()
        mock_instance = MagicMock()
        mock_instance.send.side_effect = RuntimeError("SMTP down")
        with SessionLocal() as db, patch(
            "app.api.v1.endpoints.core.imports.EmailSender", return_value=mock_instance,
        ):
            _maybe_alert_import_failure_rate(
                db, tenant_id=tenant_id, import_type="élèves", skipped=9, total=10, filename="x.csv",
            )
