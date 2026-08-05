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
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text

from arq.connections import RedisSettings
from arq.cron import cron

from app.core.database import SessionLocal
from app.core.jobs import get_redis_settings
from app.models.job import Job

logger = logging.getLogger(__name__)


def _job_started(job_type: str, tenant_id: Optional[str], payload: dict) -> str:
    with SessionLocal() as db:
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
    with SessionLocal() as db:
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
          <h2 style="color:#1a56db">🎉 Bienvenue sur SchoolFlow Pro !</h2>
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
          <p style="color:#9ca3af;font-size:12px">SchoolFlow Pro — L'ERP scolaire pour l'Afrique francophone</p>
        </div>"""
        sent = sender.send(to=to_email, subject=f"🎉 Bienvenue sur SchoolFlow Pro — {school_name}", html=html)
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

        with SessionLocal() as db:
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

        with SessionLocal() as db:
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


async def send_whatsapp_reply_job(ctx: dict, *, tenant_id: str, message_item_id: str) -> dict:
    """Actually sends a school→parent WhatsApp reply queued by
    POST /communication/conversations/{thread_id}/reply-whatsapp/ (Phase 4).
    Off the request path for the same reason as send_whatsapp_notification —
    a slow/rate-limited Graph API call must never make that endpoint hang."""
    job_id = _job_started("send_whatsapp_reply_job", tenant_id, {"message_item_id": message_item_id})
    try:
        from app.services.whatsapp_service import send_whatsapp_reply

        with SessionLocal() as db:
            tenant_settings = _fetch_tenant_settings(db, tenant_id)
            send_whatsapp_reply(db, tenant_id=tenant_id, tenant_settings=tenant_settings, message_item_id=message_item_id)
        _job_finished(job_id, success=True, result={"message_item_id": message_item_id})
        return {"job_id": job_id}
    except Exception as exc:
        logger.warning("send_whatsapp_reply_job failed: %s", exc)
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
        with SessionLocal() as db:
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
                tenant_settings = _fetch_tenant_settings(db, str(event.tenant_id))
                body_vars = (event.payload_json or {}).get("body_vars", [])
                new_event = send_whatsapp_template(
                    db, tenant_id=str(event.tenant_id), tenant_settings=tenant_settings, to_phone=user.phone,
                    template_key=template_key, event_type=event.event_type, body_vars=body_vars,
                    fallback_text="", user_id=event.user_id, student_id=event.student_id, parent_id=event.parent_id,
                )
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
    with SessionLocal() as db:
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
    with SessionLocal() as db:
        result = db.execute(
            text("DELETE FROM idempotency_keys WHERE expires_at < :now"),
            {"now": datetime.now(timezone.utc)},
        )
        deleted = result.rowcount
        db.commit()
    logger.info("purge_expired_idempotency_keys: deleted %d expired row(s)", deleted)
    return {"deleted": deleted}


class WorkerSettings:
    """Entry point for the Arq worker process: `arq app.workers.tasks.WorkerSettings`
    (see the `worker` service in docker-compose.yml)."""

    functions = [
        send_welcome_email,
        send_whatsapp_notification,
        send_bulk_whatsapp_notifications,
        send_whatsapp_reply_job,
        retry_failed_notifications,
        sync_whatsapp_statuses,
        purge_expired_idempotency_keys,
    ]
    # Runs once a day regardless of manual enqueue_job() calls — expired
    # idempotency keys would otherwise only ever be cleaned up if someone
    # remembers to trigger the job by hand.
    cron_jobs = [cron(purge_expired_idempotency_keys, hour=3, minute=0)]
    redis_settings: RedisSettings = get_redis_settings()
    max_jobs = 10
    job_timeout = 300  # 5 minutes — generous enough for slow SMTP providers
    max_tries = 3  # retry transient failures (e.g. SMTP timeout) automatically
