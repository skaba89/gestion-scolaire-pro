"""Arq task functions — national audit Phase 5.

Each task is a plain async function taking Arq's `ctx` first, matching
Arq's calling convention. Status is recorded in the `jobs` table (see
app/models/job.py) via _job_started()/_job_finished() so a job's outcome
is visible without grepping worker logs — the minimum viable version of
"statut job" from the audit's Phase 5 checklist for this first task type.

To add a new task type: write the async function here, register it in
WorkerSettings.functions below, and call enqueue_job("function_name", ...)
from the endpoint. See docs/ASYNC_JOBS_GUIDE.md for the full walkthrough.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text

from arq.connections import RedisSettings
from arq.cron import cron

from app.core.database import (
    platform_db_session,
    reset_tenant_context,
    switch_tenant_context,
    worker_db_session,
)
from app.core.config import settings as _settings
from app.core.jobs import get_worker_redis_settings
from app.models.job import Job
from app.models.notification import Notification
from app.workers.heartbeat import (
    HEARTBEAT_INTERVAL_SECONDS,
    clear_heartbeat,
    write_heartbeat,
)

logger = logging.getLogger(__name__)

# SECURITY (worker RLS tenant-context propagation, docs/POSTGRES_APP_ROLE.md):
# every DB session opened in this file goes through worker_db_session()/
# platform_db_session() (app/core/database.py) instead of SessionLocal()
# directly. The HTTP request cycle gets its RLS tenant context "for free"
# from TenantMiddleware + get_db(); an ARQ job has neither, so it must
# always state explicitly which tenant it is acting for (worker_db_session)
# or that it is deliberately platform-wide (platform_db_session) - there is
# no third, implicit option, and never a default tenant.


def _job_started(job_type: str, tenant_id: Optional[str], payload: dict) -> str:
    """`jobs` grants platform-wide visibility with no tenant context (see
    migration 20260929_0001), so a platform-scoped job (tenant_id=None,
    e.g. send_password_reset_email, check_inactive_tenants) can insert its
    own row with tenant_id=NULL from platform_db_session() - but a
    tenant-scoped job must still prove its tenant is real before writing
    anything, hence worker_db_session() (fail-closed) for the tenant_id
    branch."""
    session_cm = worker_db_session(tenant_id) if tenant_id else platform_db_session()
    with session_cm as db:
        job = Job(
            tenant_id=tenant_id,
            job_type=job_type,
            status="RUNNING",
            payload=payload,
            started_at=datetime.now(timezone.utc),
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return str(job.id)


def _job_finished(job_id: str, *, success: bool, result: Optional[dict] = None, error: Optional[str] = None) -> None:
    """Deliberately always platform_db_session(), never worker_db_session():
    this looks a job up by its own id alone, with no tenant_id parameter to
    validate against - the `jobs` RLS policy's platform-wide bypass (fixed
    by migration 20260929_0001 to actually work on a reused connection) is
    what lets this find and update a row that belongs to a real tenant."""
    with platform_db_session() as db:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return
        job.status = "SUCCESS" if success else "FAILED"
        job.result = result
        job.error = error
        job.finished_at = datetime.now(timezone.utc)
        db.commit()


async def send_welcome_email(
    ctx: dict, *, tenant_id: str, to_email: str, first_name: str, school_name: str, slug: str
) -> dict:
    """First task migrated off FastAPI's in-process BackgroundTasks (see
    _send_welcome_email_background in auth.py, now the synchronous fallback
    used only if enqueueing here fails, e.g. Redis unreachable).

    Persisted in Redis via Arq: survives an API restart and doesn't compete
    with the request that triggered it for CPU/DB connections.
    """
    payload = {"to_email": to_email, "first_name": first_name, "school_name": school_name, "slug": slug}
    job_id = _job_started("send_welcome_email", tenant_id, payload)
    try:
        from app.core.config import settings
        from app.services.notifications import EmailSender

        sender = EmailSender(
            resend_api_key=settings.RESEND_API_KEY,
            smtp_host=settings.SMTP_HOST,
            smtp_port=settings.SMTP_PORT,
            smtp_user=settings.SMTP_USER,
            smtp_pass=settings.SMTP_PASS,
            from_email=settings.FROM_EMAIL,
            from_name=settings.FROM_NAME,
        )
        dashboard_url = f"{settings.FRONTEND_URL}/{slug}/admin/onboarding"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px">
          <h2 style="color:#1a56db">🎉 Bienvenue sur Academy Guinéenne !</h2>
          <p>Bonjour <strong>{first_name}</strong>,</p>
          <p>Votre établissement <strong>{school_name}</strong> a bien été créé.</p>
          <p>Vous bénéficiez de <strong>30 jours d'essai gratuit Pro</strong> pour découvrir toutes les fonctionnalités.</p>
          <div style="margin:24px 0">
            <a href="{dashboard_url}" style="background:#1a56db;color:#fff;padding:14px 28px;
               text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">
              Configurer mon établissement →
            </a>
          </div>
          <p style="color:#6b7280;font-size:13px">Votre URL de connexion : <strong>{settings.FRONTEND_URL}/{slug}/admin</strong></p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
          <p style="color:#9ca3af;font-size:12px">Academy Guinéenne — L'ERP scolaire pour l'Afrique francophone</p>
        </div>"""
        sent = sender.send(to=to_email, subject=f"🎉 Bienvenue sur Academy Guinéenne — {school_name}", html=html)
        if sent is not True:
            # Both Resend and SMTP fallback declined/failed without raising
            # (e.g. bad recipient, provider outage) — this is a real
            # delivery failure, not a job crash. Never log the API key or
            # SMTP credentials here, only the recipient (already stored in
            # payload) and a generic reason.
            logger.warning("send_welcome_email: provider returned no success for %s", to_email)
            _job_finished(job_id, success=False, error="Email provider did not confirm delivery")
            return {"job_id": job_id, "sent": False, "error": "Email provider did not confirm delivery"}
        _job_finished(job_id, success=True, result={"sent_to": to_email})
        return {"job_id": job_id, "sent": True}
    except Exception as exc:
        logger.warning("send_welcome_email failed for %s: %s", to_email, exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "sent": False, "error": str(exc)}


async def deliver_payment_reminders(ctx: dict, *, tenant_id: str, deliveries: list) -> dict:
    """Push/email payment-reminder delivery, migrated off FastAPI's
    in-process BackgroundTasks (see _deliver_reminders_background in
    payments.py, now the synchronous fallback used only if enqueueing here
    fails, e.g. Redis unreachable — same national audit Phase 5 pattern
    as send_welcome_email above).

    Up to 200 invoices x several external calls each previously ran on the
    API process itself, tying up a worker thread for minutes and getting
    silently dropped on a restart. `deliveries` is the same list of plain
    dicts send_payment_reminders() already built (JSON-serializable —
    only strings/bools, no ORM objects), so no extra DB round-trip is
    needed here beyond rebuilding the NotificationService.
    """
    from app.api.v1.endpoints.finance.payments import _deliver_reminders_background
    from app.services.notifications import build_service_from_db

    job_id = _job_started("deliver_payment_reminders", tenant_id, {"count": len(deliveries)})
    try:
        with worker_db_session(tenant_id) as db:
            svc = build_service_from_db(db, tenant_id)
        if svc is None:
            _job_finished(job_id, success=False, error="No notification service configured for tenant")
            return {"job_id": job_id, "delivered": 0, "error": "No notification service configured for tenant"}
        _deliver_reminders_background(svc, deliveries)
        _job_finished(job_id, success=True, result={"count": len(deliveries)})
        return {"job_id": job_id, "delivered": len(deliveries)}
    except Exception as exc:
        logger.warning("deliver_payment_reminders failed for tenant %s: %s", tenant_id, exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "delivered": 0, "error": str(exc)}


async def send_password_reset_email(ctx: dict, *, user_id: str, email: str, user_name: str) -> dict:
    """Password reset link delivery, migrated off FastAPI's in-process
    BackgroundTasks (see _deliver_reset_link_background in auth.py, now
    the synchronous fallback used only if enqueueing here fails — same
    national audit Phase 5 pattern as send_welcome_email above).

    Security-sensitive to lose silently: a user who requested a reset and
    never got the email, with no visible error (forgot-password always
    returns 200 to prevent enumeration), has no way to know it failed and
    no way to retry beyond guessing to ask again.
    """
    from app.services.account_provisioning import (
        PasswordSetupDeliveryError,
        deliver_password_setup_link,
    )

    job_id = _job_started("send_password_reset_email", None, {"user_id": user_id})
    try:
        await deliver_password_setup_link(
            user_id=user_id, email=email, user_name=user_name,
            purpose="reset", expires_in=900,
        )
        _job_finished(job_id, success=True, result={"sent_to": email})
        return {"job_id": job_id, "sent": True}
    except PasswordSetupDeliveryError as exc:
        logger.error("Password reset link delivery failed for user %s: %s", user_id, exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "sent": False, "error": str(exc)}


async def import_students_job(
    ctx: dict, *, job_id: str, tenant_id: str, headers: list, rows: list,
    skip_errors: bool, default_academic_year: str, user_id: str, filename: str,
) -> dict:
    """Bulk student CSV import (national-readiness audit, 2026-09,
    priority 5 — "finish migrating BackgroundTasks to Arq"). Moved off the
    synchronous request path: a CSV of "thousands of students" (the
    original audit's own words) used to block the HTTP request for as
    long as the whole file took to process, with no way to recover if the
    connection dropped partway through.

    Unlike this file's other tasks, the `jobs` row is created by the
    CALLER (confirm_student_import in imports.py) before enqueueing, not
    by this task with _job_started() — the endpoint needs a job_id to
    return immediately for polling, before Arq has even picked the job up.

    Does not re-raise on failure: retrying a partially-completed import
    would re-run the whole file, and rows without an explicit
    registration_number get a freshly generated one on every attempt —
    a retry after a partial failure would duplicate those. Safer to fail
    once, visibly (job.status == "FAILED"), than to let Arq's default
    retry silently create duplicate students.
    """
    from app.services.student_import import run_student_import
    from app.utils.audit import log_audit

    with worker_db_session(tenant_id) as db:
        try:
            outcome = run_student_import(
                db, tenant_id, headers, rows,
                skip_errors=skip_errors, default_academic_year=default_academic_year,
            )
            # SECURITY (Phase 2, commercialisation): same audit-trail
            # requirement as every other data-mutating endpoint — see the
            # matching log_audit() call in imports.py's synchronous
            # fallback path.
            log_audit(
                db, user_id=user_id, tenant_id=tenant_id,
                action="IMPORT_STUDENTS", resource_type="STUDENT",
                details={
                    "created": outcome["created"], "skipped": outcome["skipped"],
                    "total": len(rows), "filename": filename,
                },
            )
            db.commit()
            result = {
                "created": outcome["created"],
                "skipped": outcome["skipped"],
                "errors": outcome["error_rows"][:20],
                "total": len(rows),
                "message": f"{outcome['created']} élève(s) importé(s), {outcome['skipped']} ignoré(s)",
            }
            _job_finished(job_id, success=True, result=result)
            return result
        except Exception as exc:
            db.rollback()
            logger.error("import_students_job failed for tenant %s: %s", tenant_id, exc)
            _job_finished(job_id, success=False, error=str(exc))
            return {"job_id": job_id, "error": str(exc)}


async def import_parents_job(
    ctx: dict, *, job_id: str, tenant_id: str, headers: list, rows: list,
    skip_errors: bool, user_id: str, filename: str,
) -> dict:
    """Bulk parent CSV import — extends the polling pattern from
    import_students_job above (national-readiness audit, 2026-09) to
    parents. Same rules apply: the `jobs` row is created by the CALLER
    (confirm_parent_import in imports.py) before enqueueing, and this task
    does not re-raise on failure (a retry would re-run parent/link creation
    against whatever the first attempt already committed, double-counting
    "created" on a partial success)."""
    from app.services.parent_import import run_parent_import
    from app.utils.audit import log_audit

    with worker_db_session(tenant_id) as db:
        try:
            outcome = run_parent_import(db, tenant_id, headers, rows, skip_errors=skip_errors)
            log_audit(
                db, user_id=user_id, tenant_id=tenant_id,
                action="IMPORT_PARENTS", resource_type="PARENT",
                details={
                    "created_parents": outcome["created_parents"],
                    "reused_parents": outcome["reused_parents"],
                    "created_links": outcome["created_links"],
                    "skipped_links": outcome["skipped_links"],
                    "skipped_rows": outcome["skipped_rows"],
                    "total": len(rows),
                    "filename": filename,
                },
            )
            db.commit()
            result = {
                "created_parents": outcome["created_parents"],
                "reused_parents": outcome["reused_parents"],
                "created_links": outcome["created_links"],
                "skipped_links": outcome["skipped_links"],
                "skipped_rows": outcome["skipped_rows"],
                "errors": outcome["error_rows"][:20],
                "total": len(rows),
                "message": (
                    f"{outcome['created_parents']} parent(s) importé(s), {outcome['reused_parents']} réutilisé(s), "
                    f"{outcome['created_links']} lien(s) élève créé(s)"
                ),
            }
            _job_finished(job_id, success=True, result=result)
            return result
        except Exception as exc:
            db.rollback()
            logger.error("import_parents_job failed for tenant %s: %s", tenant_id, exc)
            _job_finished(job_id, success=False, error=str(exc))
            return {"job_id": job_id, "error": str(exc)}


async def import_teachers_job(
    ctx: dict, *, job_id: str, tenant_id: str, headers: list, rows: list,
    skip_errors: bool, user_id: str, filename: str,
) -> dict:
    """Bulk teacher CSV import — extends the polling pattern from
    import_students_job above (national-readiness audit, 2026-09) to
    teachers. Does not re-raise on failure, same reasoning as
    import_parents_job above (a retry would re-check email uniqueness
    against rows this same attempt already committed)."""
    from app.services.teacher_import import run_teacher_import
    from app.utils.audit import log_audit

    with worker_db_session(tenant_id) as db:
        try:
            outcome = run_teacher_import(db, tenant_id, headers, rows, skip_errors=skip_errors)
            log_audit(
                db, user_id=user_id, tenant_id=tenant_id,
                action="IMPORT_TEACHERS", resource_type="TEACHER",
                details={"created": outcome["created"], "skipped": outcome["skipped"], "total": len(rows), "filename": filename},
            )
            db.commit()
            result = {
                "created": outcome["created"],
                "skipped": outcome["skipped"],
                "errors": outcome["error_rows"][:20],
                "total": len(rows),
                "message": f"{outcome['created']} enseignant(s) importé(s), {outcome['skipped']} ignoré(s)",
            }
            _job_finished(job_id, success=True, result=result)
            return result
        except Exception as exc:
            db.rollback()
            logger.error("import_teachers_job failed for tenant %s: %s", tenant_id, exc)
            _job_finished(job_id, success=False, error=str(exc))
            return {"job_id": job_id, "error": str(exc)}


async def generate_report_cards_batch_job(
    ctx: dict, *, job_id: str, tenant_id: str, classroom_id: str, term_id: str,
    director_comment: str, decision: str, show_guinea_header: bool,
) -> dict:
    """Batch bulletin generation for a whole classroom — the last
    remaining synchronous endpoint from the national-readiness audit's
    P0-2 finding, moved off the request path the same way CSV imports
    were. Unlike those, this is read-only (no DB writes), so a retry
    can't duplicate anything — but Arq's default retry would still just
    redo the same expensive query/render work for no benefit if it fails
    once, so this still fails once, visibly, rather than retrying blindly.

    Same as import_students_job above: the `jobs` row is created by the
    CALLER (generate_batch_report_cards in school_life.py) before
    enqueueing, not by this task, so it can return a job_id immediately
    for polling."""
    from app.api.v1.endpoints.operational.school_life import _generate_batch_report_cards

    with worker_db_session(tenant_id) as db:
        try:
            result = _generate_batch_report_cards(
                db, tenant_id,
                classroom_id=classroom_id, term_id=term_id,
                director_comment=director_comment, decision=decision,
                show_guinea_header=show_guinea_header,
            )
            _job_finished(job_id, success=True, result=result)
            return result
        except Exception as exc:
            detail = exc.detail if hasattr(exc, "detail") else str(exc)
            logger.error("generate_report_cards_batch_job failed for tenant %s: %s", tenant_id, detail)
            _job_finished(job_id, success=False, error=str(detail))
            return {"job_id": job_id, "error": str(detail)}


# ─── WhatsApp Cloud API — async jobs ───────────────────────────────────────
# Never send WhatsApp inside the HTTP request path — a slow Graph API call
# (or one blocked by Meta rate limits) must never make a payment/attendance/
# grade endpoint hang. Enqueue with a stable `_job_id` (e.g.
# f"wa:{event_type}:{student_id}:{invoice_number}") to get Arq's built-in
# de-duplication (see app/core/jobs.py:enqueue_job) — the same logical
# notification is then never sent twice even if the caller enqueues it twice.

def _fetch_tenant_settings(db, tenant_id: str) -> dict:
    """ORM query (not raw SQL) so the tenant_id lookup goes through the
    GUID TypeDecorator (app/models/base.py) — a raw `text()` WHERE clause
    comparing a dashed UUID string against SQLite's dash-less hex storage
    silently matches zero rows there (Postgres's native UUID type doesn't
    have this issue, which is why it went unnoticed until tested)."""
    from app.models.tenant import Tenant

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant or not tenant.settings:
        return {}
    raw = tenant.settings
    if isinstance(raw, dict):
        return raw
    import json
    return json.loads(raw)


async def send_whatsapp_notification(
    ctx: dict,
    *,
    tenant_id: str,
    event_type: str,
    to_phone: str,
    template_key: str,
    body_vars: Optional[list] = None,
    fallback_text: str = "",
    user_id: Optional[str] = None,
    student_id: Optional[str] = None,
    parent_id: Optional[str] = None,
) -> dict:
    """One WhatsApp send, off the request path. Always creates a
    NotificationEvent (via whatsapp_service) regardless of outcome — a
    failure here is recorded, not lost."""
    job_id = _job_started("send_whatsapp_notification", tenant_id, {"event_type": event_type})
    try:
        from app.services.whatsapp_service import send_whatsapp_template

        with worker_db_session(tenant_id) as db:
            tenant_settings = _fetch_tenant_settings(db, tenant_id)
            event = send_whatsapp_template(
                db, tenant_id=tenant_id, tenant_settings=tenant_settings, to_phone=to_phone,
                template_key=template_key, event_type=event_type, body_vars=body_vars,
                fallback_text=fallback_text, user_id=user_id, student_id=student_id, parent_id=parent_id,
            )
            # Read every attribute while the session is still open — accessing
            # them after the `with` block exits raises DetachedInstanceError.
            success = event.status == "SENT"
            event_id = str(event.id)
            status = event.status
            error_reason = event.error_reason
        _job_finished(job_id, success=success, result={"notification_event_id": event_id, "status": status},
                       error=None if success else error_reason)
        return {"job_id": job_id, "sent": success, "notification_event_id": event_id}
    except Exception as exc:
        logger.warning("send_whatsapp_notification failed: %s", exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "sent": False, "error": str(exc)}


async def send_bulk_whatsapp_notifications(ctx: dict, *, tenant_id: str, notifications: list) -> dict:
    """Batch of independent WhatsApp sends (e.g. a payment-reminder run
    across many parents). One item failing never stops the batch — each is
    logged as its own NotificationEvent. `notifications` items: dicts with
    keys to_phone, template_key, event_type, body_vars, fallback_text,
    student_id (optional), parent_id (optional)."""
    job_id = _job_started("send_bulk_whatsapp_notifications", tenant_id, {"count": len(notifications)})
    sent = 0
    failed = 0
    try:
        from app.services.whatsapp_service import send_whatsapp_template

        with worker_db_session(tenant_id) as db:
            tenant_settings = _fetch_tenant_settings(db, tenant_id)
            for item in notifications:
                try:
                    event = send_whatsapp_template(
                        db, tenant_id=tenant_id, tenant_settings=tenant_settings,
                        to_phone=item["to_phone"], template_key=item["template_key"],
                        event_type=item["event_type"], body_vars=item.get("body_vars"),
                        fallback_text=item.get("fallback_text", ""),
                        student_id=item.get("student_id"), parent_id=item.get("parent_id"),
                    )
                    if event.status == "SENT":
                        sent += 1
                    else:
                        failed += 1
                except Exception as inner_exc:
                    failed += 1
                    logger.warning("send_bulk_whatsapp_notifications item failed: %s", inner_exc)
        _job_finished(job_id, success=True, result={"sent": sent, "failed": failed})
        return {"job_id": job_id, "sent": sent, "failed": failed}
    except Exception as exc:
        logger.warning("send_bulk_whatsapp_notifications crashed: %s", exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "sent": sent, "failed": failed, "error": str(exc)}


def _fetch_tenant_school_name(db, tenant_id: str) -> str:
    """Companion to _fetch_tenant_settings — the absence/grade/bulletin
    wrappers in whatsapp_service.py need the tenant's display name (used in
    the message template itself, e.g. "École X"), not just its settings."""
    from app.models.tenant import Tenant

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    return tenant.name if tenant else "Academy Guinéenne"


async def send_absence_alert_whatsapp_job(
    ctx: dict, *, tenant_id: str, to_phone: str, parent_name: str, student_name: str,
    date: str, subject: str, student_id: Optional[str] = None, parent_id: Optional[str] = None,
) -> dict:
    """Phase 6 (national audit): off the request path, mirrors
    send_whatsapp_notification's shape but calls the dedicated
    send_absence_alert_whatsapp() wrapper so callers pass named business
    fields (date, subject) instead of raw template body_vars — same
    NotificationEvent/provider_message_id/webhook-tracking guarantees."""
    job_id = _job_started("send_absence_alert_whatsapp_job", tenant_id, {"student_id": student_id})
    try:
        from app.services.whatsapp_service import send_absence_alert_whatsapp

        with worker_db_session(tenant_id) as db:
            tenant_settings = _fetch_tenant_settings(db, tenant_id)
            school_name = _fetch_tenant_school_name(db, tenant_id)
            event = send_absence_alert_whatsapp(
                db, tenant_id=tenant_id, tenant_settings=tenant_settings, school_name=school_name,
                to_phone=to_phone, parent_name=parent_name, student_name=student_name,
                date=date, subject=subject, student_id=student_id, parent_id=parent_id,
            )
            success = event.status == "SENT"
            event_id = str(event.id)
            status = event.status
            error_reason = event.error_reason
        _job_finished(job_id, success=success, result={"notification_event_id": event_id, "status": status},
                       error=None if success else error_reason)
        return {"job_id": job_id, "sent": success, "notification_event_id": event_id}
    except Exception as exc:
        logger.warning("send_absence_alert_whatsapp_job failed: %s", exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "sent": False, "error": str(exc)}


async def send_grade_alert_whatsapp_job(
    ctx: dict, *, tenant_id: str, to_phone: str, parent_name: str, student_name: str,
    subject: str, grade: str, max_grade: str, assessment_name: str,
    student_id: Optional[str] = None, parent_id: Optional[str] = None,
) -> dict:
    """Phase 6 (national audit): grade-alert twin of
    send_absence_alert_whatsapp_job — see its docstring."""
    job_id = _job_started("send_grade_alert_whatsapp_job", tenant_id, {"student_id": student_id})
    try:
        from app.services.whatsapp_service import send_grade_alert_whatsapp

        with worker_db_session(tenant_id) as db:
            tenant_settings = _fetch_tenant_settings(db, tenant_id)
            school_name = _fetch_tenant_school_name(db, tenant_id)
            event = send_grade_alert_whatsapp(
                db, tenant_id=tenant_id, tenant_settings=tenant_settings, school_name=school_name,
                to_phone=to_phone, parent_name=parent_name, student_name=student_name,
                subject=subject, grade=grade, max_grade=max_grade, assessment_name=assessment_name,
                student_id=student_id, parent_id=parent_id,
            )
            success = event.status == "SENT"
            event_id = str(event.id)
            status = event.status
            error_reason = event.error_reason
        _job_finished(job_id, success=success, result={"notification_event_id": event_id, "status": status},
                       error=None if success else error_reason)
        return {"job_id": job_id, "sent": success, "notification_event_id": event_id}
    except Exception as exc:
        logger.warning("send_grade_alert_whatsapp_job failed: %s", exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "sent": False, "error": str(exc)}


async def send_bulletin_ready_whatsapp_job(
    ctx: dict, *, tenant_id: str, to_phone: str, parent_name: str, student_name: str,
    term: str, portal_url: str = "", student_id: Optional[str] = None, parent_id: Optional[str] = None,
) -> dict:
    """Phase 6 (national audit): bulletin-ready twin of
    send_absence_alert_whatsapp_job — see its docstring."""
    job_id = _job_started("send_bulletin_ready_whatsapp_job", tenant_id, {"student_id": student_id})
    try:
        from app.services.whatsapp_service import send_bulletin_ready_whatsapp

        with worker_db_session(tenant_id) as db:
            tenant_settings = _fetch_tenant_settings(db, tenant_id)
            school_name = _fetch_tenant_school_name(db, tenant_id)
            event = send_bulletin_ready_whatsapp(
                db, tenant_id=tenant_id, tenant_settings=tenant_settings, school_name=school_name,
                to_phone=to_phone, parent_name=parent_name, student_name=student_name,
                term=term, portal_url=portal_url, student_id=student_id, parent_id=parent_id,
            )
            success = event.status == "SENT"
            event_id = str(event.id)
            status = event.status
            error_reason = event.error_reason
        _job_finished(job_id, success=success, result={"notification_event_id": event_id, "status": status},
                       error=None if success else error_reason)
        return {"job_id": job_id, "sent": success, "notification_event_id": event_id}
    except Exception as exc:
        logger.warning("send_bulletin_ready_whatsapp_job failed: %s", exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "sent": False, "error": str(exc)}


async def send_whatsapp_reply_job(ctx: dict, *, tenant_id: str, message_item_id: str) -> dict:
    """Actually sends a school→parent WhatsApp reply queued by
    POST /communication/conversations/{thread_id}/reply-whatsapp/ (Phase 4).
    Off the request path for the same reason as send_whatsapp_notification —
    a slow/rate-limited Graph API call must never make that endpoint hang."""
    job_id = _job_started("send_whatsapp_reply_job", tenant_id, {"message_item_id": message_item_id})
    try:
        from app.services.whatsapp_service import send_whatsapp_reply

        with worker_db_session(tenant_id) as db:
            tenant_settings = _fetch_tenant_settings(db, tenant_id)
            send_whatsapp_reply(db, tenant_id=tenant_id, tenant_settings=tenant_settings, message_item_id=message_item_id)
        _job_finished(job_id, success=True, result={"message_item_id": message_item_id})
        return {"job_id": job_id}
    except Exception as exc:
        logger.warning("send_whatsapp_reply_job failed: %s", exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "error": str(exc)}


async def send_public_form_submission_alert(ctx: dict, *, tenant_id: str, submission_id: str) -> dict:
    """Phase 2: notify tenant admins that a visitor submitted the public
    contact form — previously a submission was only ever visible by an
    admin manually opening "Messages reçus"; nothing told them one had
    arrived. Two independent channels, neither one gating the other:

    1. In-app Notification rows (existing badge/dashboard mechanism — see
       send_parent_alert in notifications.py for the same pattern) for every
       TENANT_ADMIN/DIRECTOR of the tenant. Always attempted; needs no
       external service.
    2. An email via EmailSender IF Resend/SMTP is configured for this
       tenant's environment. Best-effort: a missing/misconfigured email
       provider must never make this job "fail" — the submission itself
       was already committed by the endpoint before this job even runs
       (see submit_public_form's enqueue_job call), so there is nothing
       left here that could break the visitor's experience.
    """
    from app.models.public_form_submission import PublicFormSubmission
    from app.models.tenant import Tenant
    from app.models.user import User
    from app.models.user_role import UserRole

    job_id = _job_started(
        "send_public_form_submission_alert", tenant_id, {"submission_id": submission_id}
    )
    notified_in_app = 0
    email_sent = False
    try:
        with worker_db_session(tenant_id) as db:
            submission = db.query(PublicFormSubmission).filter(
                PublicFormSubmission.id == submission_id,
                PublicFormSubmission.tenant_id == tenant_id,
            ).first()
            if not submission:
                # Nothing to notify about — e.g. the submission was already
                # deleted (RGPD manual delete, Phase 5) between enqueue and
                # this job running. Not an error.
                _job_finished(job_id, success=True, result={"skipped": "submission_not_found"})
                return {"job_id": job_id, "skipped": "submission_not_found"}

            tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            tenant_name = tenant.name if tenant else "votre établissement"

            admin_user_ids = [
                row[0] for row in db.query(UserRole.user_id).filter(
                    UserRole.tenant_id == tenant_id,
                    UserRole.role.in_(["TENANT_ADMIN", "DIRECTOR"]),
                ).distinct().all()
            ]
            admins = db.query(User).filter(
                User.id.in_(admin_user_ids), User.is_active == True,
            ).all() if admin_user_ids else []

            title = f"Nouveau message — {submission.subject or 'Formulaire de contact'}"
            preview = submission.message[:200]
            message = f"{submission.name} ({submission.email}) : {preview}"
            for admin in admins:
                db.add(Notification(
                    user_id=admin.id, tenant_id=tenant_id, title=title, message=message,
                    type="message", link="/admin/public-pages/messages",
                ))
                notified_in_app += 1
            db.commit()

            admin_emails = [a.email for a in admins if a.email]

            # Read every field the email step needs onto plain local
            # variables WHILE the session is still open. `submission` (and
            # `tenant`) become detached the instant this `with` block ends
            # — accessing an un-loaded attribute on a detached instance
            # raises DetachedInstanceError. That used to happen silently
            # here: the email step below is wrapped in a broad try/except
            # that logs and swallows it, so the job still reported
            # success/email_sent=False and nothing ever indicated that a
            # correctly-configured Resend/SMTP provider's email was in fact
            # never being sent at all. Found by the escaping tests in
            # test_public_form_email_escaping.py, which — unlike earlier
            # tests — actually force the send path to run instead of
            # short-circuiting on "no provider configured".
            submission_name = submission.name
            submission_email = submission.email
            submission_subject = submission.subject
            submission_message = submission.message

        if admin_emails:
            try:
                from app.core.config import settings
                from app.services.notifications import EmailSender

                sender = EmailSender(
                    resend_api_key=settings.RESEND_API_KEY,
                    smtp_host=settings.SMTP_HOST,
                    smtp_port=settings.SMTP_PORT,
                    smtp_user=settings.SMTP_USER,
                    smtp_pass=settings.SMTP_PASS,
                    from_email=settings.FROM_EMAIL,
                    from_name=settings.FROM_NAME,
                )
                # SECURITY (Phase 1, hardening pass): these four fields are
                # raw, unsanitized visitor input — PublicFormSubmissionCreate
                # validates length/shape but never strips HTML (unlike
                # custom_html sections, which go through DOMPurify on
                # render). Interpolating them straight into this admin
                # notification email used to let a submitted <script>/<img
                # onerror=...> ride along into the admin's inbox verbatim.
                # html.escape() neutralizes markup while leaving normal text
                # (accents, punctuation) untouched.
                import html as html_module

                safe_name = html_module.escape(submission_name)
                safe_email = html_module.escape(submission_email)
                safe_subject = html_module.escape(submission_subject) if submission_subject else None
                safe_message = html_module.escape(submission_message)
                safe_tenant_name = html_module.escape(tenant_name)
                html = f"""
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px">
                  <h2 style="color:#1a56db">📩 Nouveau message reçu — {safe_tenant_name}</h2>
                  <p><strong>De :</strong> {safe_name} ({safe_email})</p>
                  {f'<p><strong>Sujet :</strong> {safe_subject}</p>' if safe_subject else ''}
                  <p style="white-space:pre-wrap;background:#f9fafb;padding:16px;border-radius:8px">{safe_message}</p>
                  <p style="color:#6b7280;font-size:13px">Répondez depuis votre tableau de bord, rubrique "Messages reçus".</p>
                </div>"""
                for admin_email in admin_emails:
                    sent = sender.send(
                        to=admin_email,
                        subject=f"📩 Nouveau message — {tenant_name}",
                        html=html,
                    )
                    email_sent = email_sent or sent is True
            except Exception as exc:
                # Never let an email-provider failure mark the whole job
                # FAILED — the in-app notification above already succeeded,
                # and that alone satisfies "the admin gets notified".
                logger.warning("send_public_form_submission_alert: email step failed: %s", exc)

        _job_finished(
            job_id, success=True,
            result={"notified_in_app": notified_in_app, "email_sent": email_sent},
        )
        return {"job_id": job_id, "notified_in_app": notified_in_app, "email_sent": email_sent}
    except Exception as exc:
        logger.warning("send_public_form_submission_alert failed: %s", exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "error": str(exc)}


async def retry_failed_notifications(ctx: dict, *, tenant_id: Optional[str] = None, max_retry_count: int = 3) -> dict:
    """Re-attempt WhatsApp sends that previously FAILED, up to
    `max_retry_count` attempts. Deliberately re-resolves the recipient's
    phone number from the live User record rather than from the stored
    NotificationEvent (whose recipient_phone is masked on write, by design
    — see whatsapp_service.mask_phone) — this also means a retry
    automatically picks up a corrected phone number if the parent's contact
    info was fixed since the original failure. Each retry creates a NEW
    NotificationEvent (its own real send attempt, own provider_message_id)
    rather than mutating the failed row, so the original failure stays in
    history."""
    from app.models.notification_event import NotificationEvent
    from app.models.user import User
    from app.services.notifications import WhatsAppSender
    from app.services.whatsapp_service import send_whatsapp_template

    retried = 0
    skipped = 0
    job_id = _job_started("retry_failed_notifications", tenant_id, {"max_retry_count": max_retry_count})
    try:
        # tenant_id given -> a single tenant's own retry sweep, tenant-scoped
        # like every other job in this file. tenant_id=None -> a genuinely
        # platform-wide sweep across every tenant's FAILED events - the
        # SELECT below relies on notification_events' RLS platform bypass
        # (migration 20260929_0001) to see rows across tenants, but each
        # event's own tenant context is still switched into explicitly
        # before send_whatsapp_template() writes a new NotificationEvent
        # for it below - never relying on that same bypass to cover writes
        # it happens to also permit.
        session_cm = worker_db_session(tenant_id) if tenant_id else platform_db_session()
        with session_cm as db:
            query = db.query(NotificationEvent).filter(
                NotificationEvent.channel == "whatsapp",
                NotificationEvent.status == "FAILED",
                NotificationEvent.retry_count < max_retry_count,
            )
            if tenant_id:
                query = query.filter(NotificationEvent.tenant_id == tenant_id)
            failed_events = query.limit(100).all()

            for event in failed_events:
                recipient_user_id = event.parent_id or event.user_id
                if not recipient_user_id:
                    skipped += 1
                    continue
                event_tenant_id = str(event.tenant_id)
                if not tenant_id:
                    switch_tenant_context(db, event_tenant_id)
                try:
                    user = db.query(User).filter(User.id == recipient_user_id).first()
                    if not user or not user.phone:
                        skipped += 1
                        continue
                    template_key = next(
                        (k for k, v in WhatsAppSender.TEMPLATES.items() if v == event.template_name), None
                    )
                    if not template_key:
                        skipped += 1
                        continue
                    tenant_settings = _fetch_tenant_settings(db, event_tenant_id)
                    body_vars = (event.payload_json or {}).get("body_vars", [])
                    new_event = send_whatsapp_template(
                        db, tenant_id=event_tenant_id, tenant_settings=tenant_settings, to_phone=user.phone,
                        template_key=template_key, event_type=event.event_type, body_vars=body_vars,
                        fallback_text="", user_id=event.user_id, student_id=event.student_id, parent_id=event.parent_id,
                    )
                finally:
                    if not tenant_id:
                        reset_tenant_context(db)
                if new_event.status == "SENT":
                    retried += 1
        _job_finished(job_id, success=True, result={"retried": retried, "skipped": skipped})
        return {"job_id": job_id, "retried": retried, "skipped": skipped}
    except Exception as exc:
        logger.warning("retry_failed_notifications crashed: %s", exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "retried": retried, "skipped": skipped, "error": str(exc)}


async def sync_whatsapp_statuses(ctx: dict, *, tenant_id: Optional[str] = None, stale_after_hours: int = 6) -> dict:
    """NOT a poller — Meta's Cloud API has no endpoint to pull a message's
    current status, delivery/read updates only ever arrive via webhook
    (see whatsapp_service.process_webhook_event). This job instead flags
    notification_events stuck in SENT/QUEUED past `stale_after_hours`
    without ever receiving a webhook update, for the support dashboard — a
    stuck SENT usually means the webhook subscription is misconfigured
    (wrong verify token, or the Meta app isn't subscribed to the
    'messages' field), not that the message itself failed."""
    from app.models.notification_event import NotificationEvent

    cutoff = datetime.now(timezone.utc) - timedelta(hours=stale_after_hours)
    session_cm = worker_db_session(tenant_id) if tenant_id else platform_db_session()
    with session_cm as db:
        query = db.query(NotificationEvent).filter(
            NotificationEvent.channel == "whatsapp",
            NotificationEvent.status.in_(["SENT", "QUEUED"]),
            NotificationEvent.created_at < cutoff,
        )
        if tenant_id:
            query = query.filter(NotificationEvent.tenant_id == tenant_id)
        stale_count = query.count()
    return {"stale_count": stale_count, "stale_after_hours": stale_after_hours}


async def purge_expired_idempotency_keys(ctx: dict) -> dict:
    """Delete idempotency_keys rows past their expires_at (fine points
    brief, Phase 3). Idempotency records exist only to make a *retry*
    within the TTL window (see DEFAULT_TTL_HOURS in app/core/idempotency.py)
    return the same response instead of redoing the work — once expired,
    keeping the row serves no purpose and just grows the table forever.
    Safe to run repeatedly and concurrently: DELETE ... WHERE expires_at <
    now() is naturally idempotent, no locking needed beyond what Postgres
    already does for a plain DELETE.
    """
    # Platform-scoped by design (see docstring: purges by age across every
    # tenant) - idempotency_keys' RLS platform bypass (migration
    # 20260929_0001) is what lets this DELETE actually reach rows across
    # tenants from platform_db_session()'s "no tenant" context.
    with platform_db_session() as db:
        result = db.execute(
            text("DELETE FROM idempotency_keys WHERE expires_at < :now"),
            {"now": datetime.now(timezone.utc)},
        )
        deleted = result.rowcount
        db.commit()
    logger.info("purge_expired_idempotency_keys: deleted %d expired row(s)", deleted)
    return {"deleted": deleted}


async def send_tenant_5xx_alert(
    ctx: dict, *, tenant_id: str, error_rate: float, sample_size: int, window_seconds: int,
) -> dict:
    """Alerte "Taux d'erreur 5xx" (docs/TENANT_MONITORING.md) — enqueued by
    MetricsMiddleware (app/middlewares/metrics.py) when a tenant's rolling
    in-memory error window crosses the threshold. Kept out of the request
    path: enqueue_job() itself never blocks the response, and the actual
    email send (Resend/SMTP, both blocking network calls) belongs in the
    worker, not in the ASGI middleware's event loop.
    """
    job_id = _job_started("send_tenant_5xx_alert", tenant_id, {"error_rate": error_rate, "sample_size": sample_size})
    try:
        from app.core.config import settings
        from app.models.tenant import Tenant
        from app.services.notifications import EmailSender

        if not settings.ALERT_EMAIL:
            _job_finished(job_id, success=True, result={"skipped": "no_alert_email_configured"})
            return {"job_id": job_id, "skipped": "no_alert_email_configured"}

        with worker_db_session(tenant_id) as db:
            tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            tenant_name = tenant.name if tenant else tenant_id

        sender = EmailSender(
            resend_api_key=settings.RESEND_API_KEY,
            smtp_host=settings.SMTP_HOST,
            smtp_port=settings.SMTP_PORT,
            smtp_user=settings.SMTP_USER,
            smtp_pass=settings.SMTP_PASS,
            from_email=settings.FROM_EMAIL,
            from_name=settings.FROM_NAME,
        )
        pct = round(error_rate * 100)
        window_minutes = round(window_seconds / 60)
        subject = f"[Academy Guinéenne] Taux d'erreur 5xx anormal — {tenant_name} ({pct}%)"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px">
          <h2 style="color:#dc2626">⚠️ Taux d'erreur 5xx anormal</h2>
          <p><strong>Établissement :</strong> {tenant_name}</p>
          <p><strong>Taux d'erreur :</strong> {pct}% sur les {window_minutes} dernières minutes ({sample_size} requêtes observées)</p>
          <p style="color:#6b7280;font-size:13px">Alerte générée automatiquement par le middleware de métriques. Vérifiez les logs applicatifs pour identifier la cause.</p>
        </div>"""
        sent = sender.send(to=settings.ALERT_EMAIL, subject=subject, html=html)
        _job_finished(job_id, success=True, result={"sent": sent is True})
        return {"job_id": job_id, "sent": sent is True}
    except Exception as exc:
        logger.warning("send_tenant_5xx_alert failed for tenant %s: %s", tenant_id, exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "sent": False, "error": str(exc)}


async def check_inactive_tenants(ctx: dict, *, inactivity_days: int = 14, realert_after_days: int = 7) -> dict:
    """Alerte "Tenant inactif anormal" (docs/TENANT_MONITORING.md) — daily
    cron job. Flags active, paying tenants (subscription_status == "active")
    with no recorded activity in `inactivity_days`.

    "Dernière activité" reuses the same definition already established by
    GET /platform/tenants/{id}/health/ (app/api/v1/endpoints/core/
    platform.py): the most recent audit_logs row of any kind for the
    tenant, since no dedicated login-event table exists yet. A tenant with
    zero audit_logs rows ever is measured against its own creation date
    instead, so a tenant that's been provisioned but never touched doesn't
    get silently skipped.

    Dedup: each alerted tenant gets `settings["_last_inactivity_alert_at"]`
    stamped so it isn't re-alerted on every single daily run — only after
    `realert_after_days` have passed since the last alert for that tenant
    (still inactive by then). Sent as ONE digest email (not one per tenant)
    to keep this readable for the commercial recipient.
    """
    from app.models.audit_log import AuditLog
    from app.models.tenant import Tenant

    job_id = _job_started("check_inactive_tenants", None, {"inactivity_days": inactivity_days})
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=inactivity_days)
    flagged = []
    try:
        # Platform-scoped: iterates every active tenant (tenants carries no
        # RLS - it's the root of the tenant hierarchy, not tenant-scoped).
        # audit_logs, though, uses the STRICT tenant policy (no platform
        # bypass, see migration 20260928_0001) - reading one tenant's
        # activity history requires explicitly switching into that
        # tenant's own context for the duration of that one query, then
        # resetting before moving to the next tenant. Never trust the
        # platform bypass to cover this: audit_logs deliberately has none.
        with platform_db_session() as db:
            candidates = (
                db.query(Tenant)
                .filter(Tenant.is_active == True, Tenant.subscription_status == "active")  # noqa: E712
                .all()
            )
            for tenant in candidates:
                tenant_id_str = str(tenant.id)
                switch_tenant_context(db, tenant_id_str)
                try:
                    last_activity_row = (
                        db.query(AuditLog.created_at)
                        .filter(AuditLog.tenant_id == tenant.id)
                        .order_by(AuditLog.created_at.desc())
                        .first()
                    )
                finally:
                    reset_tenant_context(db)
                last_activity_at = last_activity_row[0] if last_activity_row else tenant.created_at
                if not last_activity_at:
                    continue
                if last_activity_at.tzinfo is None:
                    last_activity_at = last_activity_at.replace(tzinfo=timezone.utc)
                if last_activity_at > cutoff:
                    continue

                tenant_settings = tenant.settings if isinstance(tenant.settings, dict) else {}
                last_alert_raw = tenant_settings.get("_last_inactivity_alert_at")
                if last_alert_raw:
                    try:
                        last_alert_at = datetime.fromisoformat(last_alert_raw)
                        if last_alert_at.tzinfo is None:
                            last_alert_at = last_alert_at.replace(tzinfo=timezone.utc)
                        if (now - last_alert_at).days < realert_after_days:
                            continue
                    except ValueError:
                        pass

                flagged.append({
                    "tenant_id": str(tenant.id),
                    "name": tenant.name,
                    "slug": tenant.slug,
                    "plan": tenant.subscription_plan,
                    "days_inactive": (now - last_activity_at).days,
                })
                tenant_settings = dict(tenant_settings)
                tenant_settings["_last_inactivity_alert_at"] = now.isoformat()
                tenant.settings = tenant_settings
            if flagged:
                db.commit()

        if flagged:
            try:
                from app.core.config import settings
                from app.services.notifications import EmailSender

                if settings.ALERT_EMAIL:
                    sender = EmailSender(
                        resend_api_key=settings.RESEND_API_KEY,
                        smtp_host=settings.SMTP_HOST,
                        smtp_port=settings.SMTP_PORT,
                        smtp_user=settings.SMTP_USER,
                        smtp_pass=settings.SMTP_PASS,
                        from_email=settings.FROM_EMAIL,
                        from_name=settings.FROM_NAME,
                    )
                    rows = "".join(
                        f"<tr><td>{t['name']}</td><td>{t['slug']}</td><td>{t['plan'] or '-'}</td>"
                        f"<td>{t['days_inactive']} j</td></tr>"
                        for t in flagged
                    )
                    html = f"""
                    <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:32px">
                      <h2 style="color:#1a56db">📉 Établissements inactifs ({len(flagged)})</h2>
                      <p>Aucune activité depuis au moins {inactivity_days} jours sur un abonnement payant actif.</p>
                      <table style="width:100%;border-collapse:collapse" cellpadding="8">
                        <tr style="background:#f9fafb;text-align:left">
                          <th>Établissement</th><th>Slug</th><th>Plan</th><th>Inactif depuis</th>
                        </tr>
                        {rows}
                      </table>
                    </div>"""
                    sender.send(
                        to=settings.ALERT_EMAIL,
                        subject=f"[Academy Guinéenne] {len(flagged)} établissement(s) payant(s) inactif(s)",
                        html=html,
                    )
            except Exception as exc:
                logger.warning("check_inactive_tenants: alert email failed: %s", exc)

        _job_finished(job_id, success=True, result={"flagged_count": len(flagged)})
        return {"job_id": job_id, "flagged_count": len(flagged), "flagged": flagged}
    except Exception as exc:
        logger.warning("check_inactive_tenants crashed: %s", exc)
        _job_finished(job_id, success=False, error=str(exc))
        return {"job_id": job_id, "error": str(exc)}


async def purge_old_public_form_submissions(ctx: dict, *, retention_days: Optional[int] = None) -> dict:
    """RGPD (Phase 5): delete public contact-form messages older than the
    retention window (see settings.PUBLIC_FORM_RETENTION_DAYS). Tenant
    isolation isn't a concern here — it deletes by age across all tenants,
    the same way purge_expired_idempotency_keys does — but each row's
    tenant_id is untouched by any other tenant's data (a plain DELETE ...
    WHERE created_at < cutoff never crosses tenant boundaries because
    nothing here reads or writes another tenant's rows).
    """
    from app.core.config import settings
    from app.models.public_form_submission import PublicFormSubmission

    days = retention_days if retention_days is not None else settings.PUBLIC_FORM_RETENTION_DAYS
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    # Platform-scoped by design (see docstring above) - relies on
    # public_form_submissions' RLS platform bypass (migration 20260929_0001)
    # to actually reach rows across every tenant from platform_db_session().
    with platform_db_session() as db:
        deleted = db.query(PublicFormSubmission).filter(
            PublicFormSubmission.created_at < cutoff
        ).delete(synchronize_session=False)
        db.commit()
    logger.info("purge_old_public_form_submissions: deleted %d row(s) older than %d days", deleted, days)
    return {"deleted": deleted, "retention_days": days}


async def _heartbeat_loop() -> None:
    """Background loop started by on_startup, cancelled by on_shutdown —
    see app/workers/heartbeat.py's module docstring for why this writes to
    Redis instead of exposing an HTTP endpoint."""
    from app.workers.http_health import mark_heartbeat_ok

    while True:
        try:
            await write_heartbeat()
            mark_heartbeat_ok()
        except Exception as exc:
            # Fail open: a Redis blip must not crash the worker process
            # over a diagnostic side-effect — the next loop iteration
            # retries, and a genuinely down Redis will already show up as
            # "missing" on the reading side once the TTL lapses.
            logger.warning("Worker heartbeat write failed: %s", exc)
        await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)


async def on_startup(ctx: dict) -> None:
    """ARQ startup hook — see docs/AZURE_OBSERVABILITY.md#worker-heartbeat."""
    from app.core.config import settings

    logger.info("Worker starting: release_sha=%s", settings.RELEASE_SHA)
    ctx["heartbeat_task"] = asyncio.create_task(_heartbeat_loop())

    # Sonde HTTP uniquement si l'hébergeur l'exige (App Service) — voir
    # app/workers/http_health.py. Absente par défaut.
    from app.workers.http_health import configured_port, start_http_health_server

    port = configured_port()
    if port is not None:
        ctx["http_health_server"] = await start_http_health_server(port)


async def on_shutdown(ctx: dict) -> None:
    """ARQ shutdown hook — cancels the heartbeat loop and removes this
    replica from the index immediately (a clean shutdown must not linger
    as a false MISSING entry for an operator to chase)."""
    task = ctx.get("heartbeat_task")
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    server = ctx.get("http_health_server")
    if server is not None:
        server.close()
        await server.wait_closed()
    try:
        await clear_heartbeat()
    except Exception as exc:
        logger.warning("Worker heartbeat cleanup failed: %s", exc)


# See WorkerSettings.poll_delay (settings.WORKER_POLL_DELAY_SECONDS).
WORKER_POLL_DELAY_SECONDS = _settings.WORKER_POLL_DELAY_SECONDS


class WorkerSettings:
    """Entry point for the Arq worker process: `arq app.workers.tasks.WorkerSettings`
    (see the `worker` service in docker-compose.yml)."""

    on_startup = on_startup
    on_shutdown = on_shutdown

    functions = [
        send_welcome_email,
        deliver_payment_reminders,
        send_password_reset_email,
        import_students_job,
        import_parents_job,
        import_teachers_job,
        generate_report_cards_batch_job,
        send_public_form_submission_alert,
        send_whatsapp_notification,
        send_bulk_whatsapp_notifications,
        send_absence_alert_whatsapp_job,
        send_grade_alert_whatsapp_job,
        send_bulletin_ready_whatsapp_job,
        send_whatsapp_reply_job,
        retry_failed_notifications,
        sync_whatsapp_statuses,
        purge_expired_idempotency_keys,
        purge_old_public_form_submissions,
        send_tenant_5xx_alert,
        check_inactive_tenants,
    ]
    # Runs once a day regardless of manual enqueue_job() calls — expired
    # idempotency keys / old public-form messages would otherwise only ever
    # be cleaned up if someone remembers to trigger the job by hand.
    cron_jobs = [
        cron(purge_expired_idempotency_keys, hour=3, minute=0),
        cron(purge_old_public_form_submissions, hour=3, minute=30),
        # Tenant-inactivity digest (docs/TENANT_MONITORING.md) — daily is
        # enough given its own 7-day re-alert dedup; send_tenant_5xx_alert
        # is NOT listed here, it's only ever enqueued on-demand by
        # MetricsMiddleware when a tenant's error window actually trips.
        cron(check_inactive_tenants, hour=4, minute=0),
    ]
    redis_settings: RedisSettings = get_worker_redis_settings()
    max_jobs = 10
    job_timeout = 300  # 5 minutes — generous enough for slow SMTP providers
    max_tries = 3  # retry transient failures (e.g. SMTP timeout) automatically
    # ARQ's own built-in health-check key (distinct from our per-replica
    # heartbeat above — this one is shared across every replica by design,
    # since it's keyed by queue_name, and carries queue/job-count stats
    # ARQ already computes for free: j_complete/j_failed/j_retried/queued).
    # Left at ARQ's default queue-scoped key; only the interval is tuned
    # down from ARQ's 1-hour default so "is any worker at all consuming
    # this queue" is answerable within ~30s of a total outage rather than
    # up to an hour later.
    health_check_interval = HEARTBEAT_INTERVAL_SECONDS
    # Redis request budget (incident 2026-10-09: the managed Redis plan's
    # 500,000-request cap was exhausted and every worker start then failed
    # with "max requests limit exceeded"). ARQ polls the queue every 0.5 s
    # by default — ~350,000 commands a day on an idle queue. The default 5 s
    # cuts that by 90% (~35,000/day); a capped plan needs more (30 s fits a
    # 500,000/month cap) — set WORKER_POLL_DELAY_SECONDS, no redeploy needed.
    # A queued job (imports, notifications) starts at most that much later.
    poll_delay = WORKER_POLL_DELAY_SECONDS
