"""Phase 1 (hardening pass 2): send_public_form_submission_alert must
html.escape() every visitor-controlled field before building the admin
notification email.

PublicFormSubmissionCreate validates length/shape but never strips HTML —
unlike custom_html sections (sanitized client-side via DOMPurium on
render), a submitted <script>/<img onerror=...> used to ride straight into
the raw f-string HTML this job sends to the tenant admin's inbox.

See app/workers/tasks.py::send_public_form_submission_alert.
"""
import asyncio
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.models.public_form_submission import PublicFormSubmission  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402
from app.workers.tasks import send_public_form_submission_alert  # noqa: E402


def _make_tenant(slug_prefix: str = "escape") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Escaping", slug=f"{slug_prefix}-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_admin(tenant_id: str) -> User:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        user = User(
            id=user_id, tenant_id=tenant_id, email=f"admin-{user_id[:8]}@example.com",
            username=f"admin-{user_id[:8]}", password_hash="x", is_active=True,
        )
        db.add(user)
        db.add(UserRole(tenant_id=tenant_id, user_id=user_id, role="TENANT_ADMIN"))
        db.commit()
        db.refresh(user)
    return user


def _run_job_and_capture_html(monkeypatch, tenant_id: str, submission_id: str) -> list[str]:
    """Patches EmailSender.send to force the "configured" path (real Resend/
    SMTP calls would otherwise be skipped when nothing is configured in
    this test env) and records the exact `html` argument sent."""
    captured: list[str] = []

    def _fake_send(self, to, subject, html, text=None):
        captured.append(html)
        return True

    monkeypatch.setattr("app.services.notifications.EmailSender.send", _fake_send)
    asyncio.run(send_public_form_submission_alert({}, tenant_id=tenant_id, submission_id=submission_id))
    return captured


class TestEmailFieldsEscaped:
    def test_script_in_message_is_escaped_not_executed_verbatim(self, monkeypatch):
        tenant_id = _make_tenant("scriptmsg")
        _make_admin(tenant_id)
        sub_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(PublicFormSubmission(
                id=sub_id, tenant_id=tenant_id, name="Visiteur",
                email="visiteur@example.com",
                message="Bonjour <script>alert(document.cookie)</script> fin du message.",
            ))
            db.commit()

        emails = _run_job_and_capture_html(monkeypatch, tenant_id, sub_id)
        assert len(emails) == 1
        assert "<script>" not in emails[0]
        assert "&lt;script&gt;" in emails[0]

    def test_subject_html_is_escaped(self, monkeypatch):
        tenant_id = _make_tenant("subjhtml")
        _make_admin(tenant_id)
        sub_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(PublicFormSubmission(
                id=sub_id, tenant_id=tenant_id, name="Visiteur",
                email="visiteur@example.com", subject='<img src=x onerror="alert(1)">',
                message="Un message assez long pour passer la validation initiale.",
            ))
            db.commit()

        emails = _run_job_and_capture_html(monkeypatch, tenant_id, sub_id)
        # The literal word "onerror" surviving as inert escaped text is
        # fine and expected (html.escape() only neutralizes markup
        # delimiters, not English words) — what matters is that it can no
        # longer form a real attribute: no live "<img" tag, and the "=""
        # syntax that would make onerror executable is gone too.
        assert "<img" not in emails[0]
        assert 'onerror="' not in emails[0]
        assert "&lt;img" in emails[0]

    def test_name_html_is_escaped(self, monkeypatch):
        tenant_id = _make_tenant("namehtml")
        _make_admin(tenant_id)
        sub_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(PublicFormSubmission(
                id=sub_id, tenant_id=tenant_id, name='<b onmouseover="alert(1)">Nom</b>',
                email="visiteur@example.com",
                message="Un message assez long pour passer la validation initiale.",
            ))
            db.commit()

        emails = _run_job_and_capture_html(monkeypatch, tenant_id, sub_id)
        assert "<b onmouseover" not in emails[0]
        assert "&lt;b" in emails[0]

    def test_normal_content_stays_readable(self, monkeypatch):
        tenant_id = _make_tenant("normal")
        _make_admin(tenant_id)
        sub_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(PublicFormSubmission(
                id=sub_id, tenant_id=tenant_id, name="Aïcha Bah",
                email="aicha.bah@example.com", subject="Question sur les inscriptions",
                message="Bonjour, j'aimerais avoir des informations sur les inscriptions 2026.",
            ))
            db.commit()

        emails = _run_job_and_capture_html(monkeypatch, tenant_id, sub_id)
        body = emails[0]
        assert "Aïcha Bah" in body
        assert "aicha.bah@example.com" in body
        assert "Question sur les inscriptions" in body
        assert "j&#x27;aimerais avoir des informations sur les inscriptions 2026" in body \
            or "j'aimerais avoir des informations sur les inscriptions 2026" in body
