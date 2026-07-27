"""GET /platform/tenants/{id}/health/ — dashboard support tenant (Priorité 3).

SUPER_ADMIN only. Aggregates tenant active status, quota usage, recent
failed jobs, last import, last failed payment webhook and last activity
into one screen, reusing existing data where possible (tenant_quota_usage
via SaaSQuotaService, jobs, audit_logs) plus one minimal new table
(payment_webhook_events — see test_import_parents.py-style history: this
is the follow-up that replaced the earlier honest "not tracked" note with
real data). Must never expose a student/parent/teacher's name or email.
"""
import uuid
from datetime import datetime, timezone

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.models.payment_webhook_event import PaymentWebhookEvent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="RLS-backed tables (jobs, audit_logs, students) are exercised against Postgres in this suite.",
)

HEADERS = {"Authorization": "Bearer mock-token"}
SUPER_ADMIN = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}


def _make_tenant(name: str = "École Health Test", is_active: bool = True) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"health-{tenant_id[:8]}",
            type="primary", country="GN", is_active=is_active, settings={},
            subscription_plan="starter", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _url(tenant_id: str) -> str:
    return f"/api/v1/platform/tenants/{tenant_id}/health/"


class TestAccessControl:
    def test_requires_auth(self):
        tenant_id = _make_tenant()
        resp = client.get(_url(tenant_id))
        assert resp.status_code == 401

    def test_tenant_admin_forbidden(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get(_url(tenant_id), headers=headers)
        assert resp.status_code == 403, resp.text

    def test_super_admin_allowed(self):
        tenant_id = _make_tenant()
        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_id), headers=headers)
        assert resp.status_code == 200, resp.text

    def test_unknown_tenant_returns_404(self):
        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(str(uuid.uuid4())), headers=headers)
        assert resp.status_code == 404, resp.text


class TestHealthShape:
    def test_active_tenant_with_no_issues_is_healthy(self):
        tenant_id = _make_tenant()
        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_id), headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["is_active"] is True
        assert body["overall_status"] == "healthy"
        assert body["quota"] is not None
        assert body["quota"]["usage"]["students_count"] == 0
        assert body["failed_jobs_recent"] == []
        assert body["last_import"] is None

    def test_inactive_tenant_is_inactive_status(self):
        tenant_id = _make_tenant(is_active=False)
        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_id), headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["overall_status"] == "inactive"

    def test_no_personal_data_leaked(self):
        """The response must never include a student/parent/teacher name or
        email — only counts, statuses, and timestamps."""
        tenant_id = _make_tenant()
        secret_name = f"Eleve-Secret-{uuid.uuid4().hex[:8]}"
        with SessionLocal() as db:
            db.add(Student(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                registration_number=f"REG-{uuid.uuid4().hex[:8]}",
                first_name=secret_name, last_name="Test",
                date_of_birth="2012-01-01", gender=Gender.MALE,
                status=StudentStatus.ACTIVE,
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_id), headers=headers)
        assert resp.status_code == 200, resp.text
        assert secret_name not in resp.text


class TestFailedJobs:
    def test_failed_jobs_are_reported(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            db.add(Job(
                id=str(uuid.uuid4()), tenant_id=tenant_id, job_type="send_welcome_email",
                status="FAILED", error="SMTP timeout",
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            ))
            db.add(Job(
                id=str(uuid.uuid4()), tenant_id=tenant_id, job_type="export_csv",
                status="SUCCESS",
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_id), headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["failed_jobs_recent"]) == 1
        assert body["failed_jobs_recent"][0]["job_type"] == "send_welcome_email"
        assert body["overall_status"] == "degraded"

    def test_failed_jobs_from_other_tenant_not_included(self):
        tenant_a = _make_tenant("École A")
        tenant_b = _make_tenant("École B")
        with SessionLocal() as db:
            db.add(Job(
                id=str(uuid.uuid4()), tenant_id=tenant_b, job_type="import_students",
                status="FAILED", error="boom",
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_a), headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["failed_jobs_recent"] == []


class TestLastImport:
    def test_last_import_reflects_most_recent_audit_log(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            db.add(AuditLog(
                id=str(uuid.uuid4()), tenant_id=tenant_id, user_id=str(uuid.uuid4()),
                action="IMPORT_STUDENTS", resource_type="STUDENT",
                details={"created": 12, "skipped": 1, "total": 13, "filename": "eleves.csv"},
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_id), headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["last_import"] is not None
        assert body["last_import"]["action"] == "IMPORT_STUDENTS"
        assert body["last_import"]["summary"]["created"] == 12

    def test_no_import_yet_is_null_not_error(self):
        tenant_id = _make_tenant()
        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_id), headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["last_import"] is None


class TestPaymentWebhookFailures:
    def test_no_failures_yet_returns_null_with_explicit_note(self):
        tenant_id = _make_tenant()
        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_id), headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["last_failed_payment_webhook"] is None
        assert body["last_failed_payment_webhook_note"]

    def test_rejected_webhook_is_reflected(self):
        """Régression : les échecs de vérification webhook n'étaient
        auparavant loggés que côté serveur (logger.warning), jamais
        persistés -- payment_webhook_events comble ce manque."""
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            db.add(PaymentWebhookEvent(
                id=str(uuid.uuid4()), tenant_id=tenant_id, gateway="cinetpay",
                transaction_id="TXN-FAIL-1", outcome="rejected",
                reason="verification failed",
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_id), headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["last_failed_payment_webhook"] is not None
        assert body["last_failed_payment_webhook"]["gateway"] == "cinetpay"
        assert body["last_failed_payment_webhook"]["reason"] == "verification failed"
        assert body["last_failed_payment_webhook_note"] is None

    def test_confirmed_webhook_is_not_reported_as_failure(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            db.add(PaymentWebhookEvent(
                id=str(uuid.uuid4()), tenant_id=tenant_id, gateway="paytech",
                transaction_id="TXN-OK-1", outcome="confirmed",
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_id), headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["last_failed_payment_webhook"] is None

    def test_other_tenant_failures_not_included(self):
        tenant_a = _make_tenant("École Webhook A")
        tenant_b = _make_tenant("École Webhook B")
        with SessionLocal() as db:
            db.add(PaymentWebhookEvent(
                id=str(uuid.uuid4()), tenant_id=tenant_b, gateway="cinetpay",
                transaction_id="TXN-B", outcome="rejected", reason="verification failed",
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            ))
            db.commit()

        headers = _as(SUPER_ADMIN)
        resp = client.get(_url(tenant_a), headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["last_failed_payment_webhook"] is None
