"""Platform-wide operational monitoring endpoints (Phase 5, national
commercialisation brief):
  - GET /platform/tenants/{id}/integrations-health/ (alias of .../health/,
    enriched with WhatsApp signals)
  - GET /platform/jobs/health/  (stale RUNNING + recent FAILED jobs, cross-tenant)
  - GET /platform/webhooks/recent-failures/  (rejected payment webhooks +
    failed WhatsApp sends, cross-tenant)

SUPER_ADMIN only, no personal data (student/parent names) in any payload.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.models.notification_event import NotificationEvent  # noqa: E402
from app.models.payment_webhook_event import PaymentWebhookEvent  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="RLS-backed tables (jobs, notification_events, payment_webhook_events) are exercised against Postgres in this suite.",
)

HEADERS = {"Authorization": "Bearer mock-token"}
SUPER_ADMIN = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_tenant(name: str = "École Monitoring Test") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"monitor-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
            subscription_plan="starter", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


class TestIntegrationsHealthAlias:
    def test_matches_health_endpoint_payload_shape(self):
        tenant_id = _make_tenant()
        headers = _as(SUPER_ADMIN)
        resp = client.get(f"/api/v1/platform/tenants/{tenant_id}/integrations-health/", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["tenant_id"] == tenant_id
        assert "whatsapp_failed_count_7d" in body
        assert "whatsapp_stuck_count" in body
        assert body["overall_status"] == "healthy"

    def test_forbidden_for_non_super_admin(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get(f"/api/v1/platform/tenants/{tenant_id}/integrations-health/", headers=headers)
        assert resp.status_code == 403

    def test_whatsapp_failures_bump_counters_and_overall_status(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            for _ in range(5):
                db.add(NotificationEvent(
                    tenant_id=tenant_id, event_type="payment_reminder", channel="whatsapp",
                    status="FAILED", error_reason="Provider timeout",
                ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(f"/api/v1/platform/tenants/{tenant_id}/integrations-health/", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["whatsapp_failed_count_7d"] == 5
        assert body["overall_status"] == "critical"

    def test_stale_queued_whatsapp_marks_degraded(self):
        tenant_id = _make_tenant()
        stale_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=12)
        with SessionLocal() as db:
            event = NotificationEvent(
                tenant_id=tenant_id, event_type="payment_reminder", channel="whatsapp", status="QUEUED",
            )
            db.add(event)
            db.flush()
            event.created_at = stale_at
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(f"/api/v1/platform/tenants/{tenant_id}/integrations-health/", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["whatsapp_stuck_count"] == 1
        assert body["overall_status"] == "degraded"


class TestJobsHealth:
    URL = "/api/v1/platform/jobs/health/"

    def test_forbidden_for_non_super_admin(self):
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": str(uuid.uuid4())})
        resp = client.get(self.URL, headers=headers)
        assert resp.status_code == 403

    def test_stale_running_job_is_reported(self):
        tenant_id = _make_tenant()
        stale_started = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
        with SessionLocal() as db:
            db.add(Job(
                tenant_id=tenant_id, job_type="send_whatsapp_notification", status="RUNNING",
                started_at=stale_started,
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(self.URL, params={"stale_running_minutes": 30}, headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["stale_running_count"] >= 1
        assert any(j["tenant_id"] == tenant_id for j in body["stale_running_jobs"])
        assert body["overall_status"] == "critical"

    def test_recent_running_job_not_flagged_stale(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            db.add(Job(
                tenant_id=tenant_id, job_type="send_whatsapp_notification", status="RUNNING",
                started_at=datetime.now(timezone.utc).replace(tzinfo=None),
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(self.URL, params={"stale_running_minutes": 30}, headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert tenant_id not in [j["tenant_id"] for j in body["stale_running_jobs"]]

    def test_failed_job_is_reported(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            db.add(Job(
                tenant_id=tenant_id, job_type="send_welcome_email", status="FAILED",
                error="SMTP connection refused",
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(self.URL, headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert any(j["tenant_id"] == tenant_id and j["error"] == "SMTP connection refused" for j in body["recent_failed_jobs"])


class TestWebhookRecentFailures:
    URL = "/api/v1/platform/webhooks/recent-failures/"

    def test_forbidden_for_non_super_admin(self):
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": str(uuid.uuid4())})
        resp = client.get(self.URL, headers=headers)
        assert resp.status_code == 403

    def test_rejected_payment_webhook_is_reported(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            db.add(PaymentWebhookEvent(
                tenant_id=tenant_id, gateway="cinetpay", transaction_id="tx-123",
                outcome="rejected", reason="Signature invalide",
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(self.URL, headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["rejected_payment_webhooks_count"] >= 1
        assert any(w["tenant_id"] == tenant_id and w["reason"] == "Signature invalide" for w in body["rejected_payment_webhooks"])

    def test_failed_whatsapp_send_is_reported(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            db.add(NotificationEvent(
                tenant_id=tenant_id, event_type="absence_alert", channel="whatsapp",
                status="FAILED", error_reason="Numéro invalide",
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(self.URL, headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["failed_whatsapp_sends_count"] >= 1
        assert any(w["tenant_id"] == tenant_id and w["error_reason"] == "Numéro invalide" for w in body["failed_whatsapp_sends"])

    def test_old_failures_outside_window_excluded(self):
        tenant_id = _make_tenant()
        old_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=10)
        with SessionLocal() as db:
            event = NotificationEvent(
                tenant_id=tenant_id, event_type="absence_alert", channel="whatsapp",
                status="FAILED", error_reason="Ancien échec",
            )
            db.add(event)
            db.flush()
            event.created_at = old_at
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(self.URL, params={"hours": 24}, headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert tenant_id not in [w["tenant_id"] for w in body["failed_whatsapp_sends"]]
