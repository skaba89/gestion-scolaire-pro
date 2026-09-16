"""Tenant-inactivity alert (docs/TENANT_MONITORING.md).

That doc's "Alertes" table listed "Tenant inactif anormal" (0 activité
depuis 14 jours sur un abonnement payant actif) as the last alert still
"à construire" — this closes it via the daily cron job
`check_inactive_tenants` (app/workers/tasks.py). "Activité" reuses the
same definition GET /platform/tenants/{id}/health/ already established:
the most recent audit_logs row for the tenant (see that endpoint's
`last_activity_at`), since no dedicated login-event table exists.

Tested at the unit level (mocking EmailSender), same approach as
tests/test_import_failure_alert.py.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.workers.tasks import check_inactive_tenants  # noqa: E402


def _make_tenant(*, created_at=None, **overrides) -> str:
    tenant_id = str(uuid.uuid4())
    fields = {
        "id": tenant_id, "name": "École Inactivité Test", "slug": f"inactive-{tenant_id[:8]}",
        "type": "primary", "country": "GN", "is_active": True, "settings": {},
        "subscription_status": "active", "subscription_plan": "pro",
    }
    fields.update(overrides)
    with SessionLocal() as db:
        db.add(Tenant(**fields))
        db.commit()
        if created_at is not None:
            db.query(Tenant).filter(Tenant.id == tenant_id).update({"created_at": created_at})
            db.commit()
    return tenant_id


def _add_activity(tenant_id: str, when) -> None:
    with SessionLocal() as db:
        db.add(AuditLog(
            tenant_id=tenant_id, user_id=str(uuid.uuid4()), action="UPDATE",
            resource_type="STUDENT", resource_id=str(uuid.uuid4()),
        ))
        db.commit()
        db.query(AuditLog).filter(AuditLog.tenant_id == tenant_id).update({"created_at": when})
        db.commit()


class TestCheckInactiveTenants:
    @pytest.mark.asyncio
    async def test_flags_active_paying_tenant_with_no_recent_activity(self, monkeypatch):
        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        tenant_id = _make_tenant()
        _add_activity(tenant_id, datetime.now(timezone.utc) - timedelta(days=20))

        mock_instance = MagicMock()
        with patch("app.services.notifications.EmailSender", return_value=mock_instance):
            result = await check_inactive_tenants({}, inactivity_days=14)

        assert result["flagged_count"] == 1
        assert result["flagged"][0]["tenant_id"] == tenant_id
        mock_instance.send.assert_called_once()

    @pytest.mark.asyncio
    async def test_does_not_flag_recently_active_tenant(self):
        tenant_id = _make_tenant()
        _add_activity(tenant_id, datetime.now(timezone.utc) - timedelta(days=1))

        result = await check_inactive_tenants({}, inactivity_days=14)

        assert tenant_id not in {t["tenant_id"] for t in result["flagged"]}

    @pytest.mark.asyncio
    async def test_ignores_inactive_free_trial_tenant(self):
        """subscription_status != 'active' (e.g. still 'trialing') must not
        trigger a churn-risk alert meant for paying customers."""
        tenant_id = _make_tenant(subscription_status="trialing")
        _add_activity(tenant_id, datetime.now(timezone.utc) - timedelta(days=30))

        result = await check_inactive_tenants({}, inactivity_days=14)

        assert tenant_id not in {t["tenant_id"] for t in result["flagged"]}

    @pytest.mark.asyncio
    async def test_ignores_deactivated_tenant(self):
        tenant_id = _make_tenant(is_active=False)
        _add_activity(tenant_id, datetime.now(timezone.utc) - timedelta(days=30))

        result = await check_inactive_tenants({}, inactivity_days=14)

        assert tenant_id not in {t["tenant_id"] for t in result["flagged"]}

    @pytest.mark.asyncio
    async def test_tenant_with_zero_audit_logs_falls_back_to_created_at(self):
        old_creation = datetime.now(timezone.utc) - timedelta(days=40)
        tenant_id = _make_tenant(created_at=old_creation)

        result = await check_inactive_tenants({}, inactivity_days=14)

        assert tenant_id in {t["tenant_id"] for t in result["flagged"]}

    @pytest.mark.asyncio
    async def test_second_run_does_not_realert_within_cooldown(self, monkeypatch):
        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        tenant_id = _make_tenant()
        _add_activity(tenant_id, datetime.now(timezone.utc) - timedelta(days=20))

        with patch("app.services.notifications.EmailSender", return_value=MagicMock()):
            first = await check_inactive_tenants({}, inactivity_days=14, realert_after_days=7)
            second = await check_inactive_tenants({}, inactivity_days=14, realert_after_days=7)

        assert tenant_id in {t["tenant_id"] for t in first["flagged"]}
        assert tenant_id not in {t["tenant_id"] for t in second["flagged"]}

    @pytest.mark.asyncio
    async def test_no_email_sent_when_nothing_flagged(self, monkeypatch):
        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        tenant_id = _make_tenant()
        _add_activity(tenant_id, datetime.now(timezone.utc) - timedelta(days=1))

        with patch("app.services.notifications.EmailSender") as mock_sender_cls:
            result = await check_inactive_tenants({}, inactivity_days=14)

        assert result["flagged_count"] == 0
        mock_sender_cls.assert_not_called()

    @pytest.mark.asyncio
    async def test_send_failure_never_raises(self, monkeypatch):
        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        tenant_id = _make_tenant()
        _add_activity(tenant_id, datetime.now(timezone.utc) - timedelta(days=20))
        mock_instance = MagicMock()
        mock_instance.send.side_effect = RuntimeError("SMTP down")

        with patch("app.services.notifications.EmailSender", return_value=mock_instance):
            result = await check_inactive_tenants({}, inactivity_days=14)

        assert result["flagged_count"] == 1
