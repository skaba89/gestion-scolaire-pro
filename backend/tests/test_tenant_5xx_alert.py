"""5xx-rate-per-tenant alert (docs/TENANT_MONITORING.md).

That doc's "Alertes" table listed "Taux d'erreur 5xx" as the last-but-one
alert still "à construire" — this closes it. Two independent pieces:

1. `_check_tenant_5xx_rate()` (app/middlewares/metrics.py) — a pure,
   process-local sliding-window function, no I/O, tested directly here
   without spinning up ASGI middleware.
2. `send_tenant_5xx_alert` (app/workers/tasks.py) — the Arq task that
   actually sends the email, tested the same way as
   test_import_failure_alert.py::TestImportFailureAlert (mocking
   EmailSender at the unit level).
"""
import time
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.middlewares.metrics import (  # noqa: E402
    _TENANT_5XX_MIN_SAMPLES,
    _TENANT_5XX_THRESHOLD,
    _check_tenant_5xx_rate,
    _tenant_request_windows,
)
from app.models.tenant import Tenant  # noqa: E402
from app.workers.tasks import send_tenant_5xx_alert  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402


def _make_tenant(**overrides) -> str:
    tenant_id = str(uuid.uuid4())
    fields = {
        "id": tenant_id, "name": "École 5xx Test", "slug": f"tenant-5xx-{tenant_id[:8]}",
        "type": "primary", "country": "GN", "is_active": True, "settings": {},
    }
    fields.update(overrides)
    with SessionLocal() as db:
        db.add(Tenant(**fields))
        db.commit()
    return tenant_id


@pytest.fixture(autouse=True)
def _clear_windows():
    _tenant_request_windows.clear()
    yield
    _tenant_request_windows.clear()


class TestCheckTenant5xxRate:
    def test_no_alert_below_min_samples(self):
        tenant_id = str(uuid.uuid4())
        for _ in range(_TENANT_5XX_MIN_SAMPLES - 1):
            result = _check_tenant_5xx_rate(tenant_id, True)
        assert result is None

    def test_no_alert_when_rate_at_or_below_threshold(self):
        tenant_id = str(uuid.uuid4())
        # Exactly at the 5% threshold with 20 samples: 1 error.
        result = None
        for i in range(_TENANT_5XX_MIN_SAMPLES):
            result = _check_tenant_5xx_rate(tenant_id, is_error=(i == 0))
        assert result is None

    def test_alerts_once_rate_exceeds_threshold(self):
        tenant_id = str(uuid.uuid4())
        result = None
        # 20 samples, 2 errors = 10% > 5% threshold.
        for i in range(_TENANT_5XX_MIN_SAMPLES):
            result = _check_tenant_5xx_rate(tenant_id, is_error=(i < 2))
        assert result is not None
        rate, sample_size = result
        assert rate == pytest.approx(2 / _TENANT_5XX_MIN_SAMPLES)
        assert sample_size == _TENANT_5XX_MIN_SAMPLES
        assert rate > _TENANT_5XX_THRESHOLD

    def test_old_entries_are_pruned_from_the_window(self):
        tenant_id = str(uuid.uuid4())
        window = _tenant_request_windows[tenant_id]
        # Simulate stale entries far outside the 15-minute window.
        stale_time = time.time() - 3600
        for _ in range(_TENANT_5XX_MIN_SAMPLES):
            window.append((stale_time, True))

        # A single fresh, non-error request should prune all stale entries
        # and NOT alert (only 1 sample now, below the minimum).
        result = _check_tenant_5xx_rate(tenant_id, is_error=False)
        assert result is None
        assert len(window) == 1

    def test_tenants_are_tracked_independently(self):
        tenant_a = str(uuid.uuid4())
        tenant_b = str(uuid.uuid4())
        for _ in range(_TENANT_5XX_MIN_SAMPLES):
            _check_tenant_5xx_rate(tenant_a, is_error=True)
        result_b = None
        for _ in range(_TENANT_5XX_MIN_SAMPLES):
            result_b = _check_tenant_5xx_rate(tenant_b, is_error=False)
        assert result_b is None


class TestSendTenant5xxAlertTask:
    @pytest.mark.asyncio
    async def test_noop_when_alert_email_not_configured(self, monkeypatch):
        monkeypatch.setattr(settings, "ALERT_EMAIL", "")
        tenant_id = _make_tenant()
        with patch("app.services.notifications.EmailSender") as mock_sender_cls:
            result = await send_tenant_5xx_alert(
                {}, tenant_id=tenant_id, error_rate=0.1, sample_size=20, window_seconds=900,
            )
        assert result["skipped"] == "no_alert_email_configured"
        mock_sender_cls.assert_not_called()

    @pytest.mark.asyncio
    async def test_sends_email_with_rate_and_tenant_name(self, monkeypatch):
        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        tenant_id = _make_tenant(name="Lycée Alerte 5xx")
        mock_instance = MagicMock()
        mock_instance.send.return_value = True
        with patch("app.services.notifications.EmailSender", return_value=mock_instance):
            result = await send_tenant_5xx_alert(
                {}, tenant_id=tenant_id, error_rate=0.12, sample_size=25, window_seconds=900,
            )

        assert result["sent"] is True
        call = mock_instance.send.call_args
        assert call.kwargs["to"] == "support@schoolflow.pro"
        assert "Lycée Alerte 5xx" in call.kwargs["subject"]
        assert "12%" in call.kwargs["subject"]

    @pytest.mark.asyncio
    async def test_send_failure_never_raises(self, monkeypatch):
        monkeypatch.setattr(settings, "ALERT_EMAIL", "support@schoolflow.pro")
        tenant_id = _make_tenant()
        mock_instance = MagicMock()
        mock_instance.send.side_effect = RuntimeError("SMTP down")
        with patch("app.services.notifications.EmailSender", return_value=mock_instance):
            result = await send_tenant_5xx_alert(
                {}, tenant_id=tenant_id, error_rate=0.2, sample_size=30, window_seconds=900,
            )
        assert result["sent"] is False
