"""Phase 2: admin notification on public form submission.

Covers: submission enqueues the notification job, Redis-unavailable never
fails the submission itself, an unconfigured email provider doesn't break
the job, and the submission stays visible in "Messages reçus" regardless
of notification outcome.

See app.workers.tasks.send_public_form_submission_alert and the
enqueue_job call in submit_public_form (public_pages.py).
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.public_form_submission import PublicFormSubmission  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402
from app.workers.tasks import send_public_form_submission_alert  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}

VALID_PAYLOAD = {
    "name": "Mamadou Diallo",
    "email": "mamadou.diallo@example.com",
    "message": "Bonjour, je souhaite des informations sur les inscriptions.",
}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(tenant_id: str, roles=None) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": roles or ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _make_tenant(slug_prefix: str = "notif") -> tuple[str, str]:
    tenant_id = str(uuid.uuid4())
    slug = f"{slug_prefix}-{tenant_id[:8]}"
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Notification", slug=slug,
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id, slug


def _make_admin(tenant_id: str, role: str = "TENANT_ADMIN") -> User:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        user = User(
            id=user_id, tenant_id=tenant_id, email=f"admin-{user_id[:8]}@example.com",
            username=f"admin-{user_id[:8]}", password_hash="x", is_active=True,
        )
        db.add(user)
        db.add(UserRole(tenant_id=tenant_id, user_id=user_id, role=role))
        db.commit()
        db.refresh(user)
    return user


class TestSubmissionEnqueuesJob:
    def test_submission_calls_enqueue_job_with_expected_args(self, monkeypatch):
        _, slug = _make_tenant("enqueue")
        calls = []

        async def _capture(function_name, *args, **kwargs):
            calls.append((function_name, kwargs))
            return "fake-job-id"

        monkeypatch.setattr("app.core.jobs.enqueue_job", _capture)

        resp = client.post(f"/api/v1/tenants/public/{slug}/submit-form/", json=VALID_PAYLOAD)
        assert resp.status_code == 201, resp.text

        assert len(calls) == 1
        function_name, kwargs = calls[0]
        assert function_name == "send_public_form_submission_alert"
        assert kwargs["tenant_id"]
        assert kwargs["submission_id"]


class TestRedisUnavailableFallback:
    def test_submission_still_succeeds_when_redis_is_down(self):
        """No monkeypatch here — exercises the real enqueue_job() against
        the (unreachable in this test env) Redis. The submission must still
        be stored and the endpoint must still return 201; the job failing
        to enqueue is logged, not raised."""
        _, slug = _make_tenant("noredis")
        resp = client.post(f"/api/v1/tenants/public/{slug}/submit-form/", json=VALID_PAYLOAD)
        assert resp.status_code == 201, resp.text

        with SessionLocal() as db:
            row = db.query(PublicFormSubmission).filter(
                PublicFormSubmission.email == VALID_PAYLOAD["email"]
            ).first()
            assert row is not None


class TestNotificationJob:
    def test_job_creates_in_app_notifications_for_admins_and_skips_others(self):
        tenant_id, slug = _make_tenant("jobtest")
        admin = _make_admin(tenant_id, role="TENANT_ADMIN")
        director = _make_admin(tenant_id, role="DIRECTOR")
        teacher = _make_admin(tenant_id, role="TEACHER")

        with SessionLocal() as db:
            submission = PublicFormSubmission(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                name="Fatou", email="fatou@example.com", subject="Inscription",
                message="Bonjour, question sur les inscriptions.",
            )
            db.add(submission)
            db.commit()
            submission_id = str(submission.id)

        import asyncio
        result = asyncio.run(send_public_form_submission_alert(
            {}, tenant_id=tenant_id, submission_id=submission_id
        ))

        assert result["notified_in_app"] == 2  # admin + director, not teacher

        with SessionLocal() as db:
            notif_user_ids = {
                str(n.user_id) for n in db.query(Notification).filter(
                    Notification.tenant_id == tenant_id
                ).all()
            }
            assert str(admin.id) in notif_user_ids
            assert str(director.id) in notif_user_ids
            assert str(teacher.id) not in notif_user_ids

    def test_job_does_not_crash_when_email_not_configured(self):
        """Default test settings have no RESEND_API_KEY/SMTP configured —
        the job must still report success (in-app notification is the
        channel that matters; email is best-effort)."""
        tenant_id, slug = _make_tenant("noemail")
        _make_admin(tenant_id)

        with SessionLocal() as db:
            submission = PublicFormSubmission(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                name="X", email="x@example.com", message="Un message de test suffisamment long.",
            )
            db.add(submission)
            db.commit()
            submission_id = str(submission.id)

        import asyncio
        result = asyncio.run(send_public_form_submission_alert(
            {}, tenant_id=tenant_id, submission_id=submission_id
        ))
        assert "error" not in result
        assert result["email_sent"] is False

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job is not None
            assert job.status == "SUCCESS"

    def test_job_does_not_crash_when_email_send_raises(self, monkeypatch):
        """Distinct from test_job_does_not_crash_when_email_not_configured:
        here the provider IS configured and EmailSender.send() is actually
        called, but raises (e.g. Resend API error, network timeout). The
        broad try/except around the email step in
        send_public_form_submission_alert must swallow it — the in-app
        notification already succeeded before this step runs, and that
        alone satisfies "the admin gets notified"."""
        tenant_id, slug = _make_tenant("emailraises")
        _make_admin(tenant_id)

        def _raising_send(self, to, subject, html, text=None):
            raise RuntimeError("Resend API error: 503")

        monkeypatch.setattr("app.services.notifications.EmailSender.send", _raising_send)

        with SessionLocal() as db:
            submission = PublicFormSubmission(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                name="Z", email="z@example.com", message="Un message de test suffisamment long.",
            )
            db.add(submission)
            db.commit()
            submission_id = str(submission.id)

        import asyncio
        result = asyncio.run(send_public_form_submission_alert(
            {}, tenant_id=tenant_id, submission_id=submission_id
        ))
        assert "error" not in result
        assert result["notified_in_app"] == 1
        assert result["email_sent"] is False

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == result["job_id"]).first()
            assert job is not None
            assert job.status == "SUCCESS"

    def test_message_still_visible_in_admin_list_after_job_runs(self):
        tenant_id, slug = _make_tenant("stillvisible")
        with SessionLocal() as db:
            submission = PublicFormSubmission(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                name="Y", email="y@example.com", message="Un autre message assez long pour valider.",
            )
            db.add(submission)
            db.commit()
            submission_id = str(submission.id)

        import asyncio
        asyncio.run(send_public_form_submission_alert(
            {}, tenant_id=tenant_id, submission_id=submission_id
        ))

        resp = client.get("/api/v1/public-pages/submissions/", headers=_as(tenant_id))
        assert resp.status_code == 200, resp.text
        ids = [row["id"] for row in resp.json()]
        assert submission_id in ids
