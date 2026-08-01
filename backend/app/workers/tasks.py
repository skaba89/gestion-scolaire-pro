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
from datetime import datetime, timezone
from typing import Any, Optional

from arq.connections import RedisSettings

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


class WorkerSettings:
    """Entry point for the Arq worker process: `arq app.workers.tasks.WorkerSettings`
    (see the `worker` service in docker-compose.yml)."""

    functions = [send_welcome_email]
    redis_settings: RedisSettings = get_redis_settings()
    max_jobs = 10
    job_timeout = 300  # 5 minutes — generous enough for slow SMTP providers
    max_tries = 3  # retry transient failures (e.g. SMTP timeout) automatically
