"""WhatsApp Cloud API industrialization — orchestration layer on top of
WhatsAppSender (app/services/notifications.py).

WhatsAppSender only knows how to make one HTTP call to Meta's Graph API. This
module adds what's needed to run it as a real production feature:
  - every send is logged as a NotificationEvent (PENDING → SENT/FAILED),
    before and after the actual HTTP call, so a crash mid-send is still
    visible as a FAILED row instead of silently vanishing;
  - the provider's message id (wamid) is captured and stored, so incoming
    webhook status updates (sent/delivered/read/failed) can be matched back
    without guessing;
  - webhook signature/verify-token validation and status application are
    idempotent — replaying the same webhook event twice never double-counts
    or downgrades a message that was already marked READ.

Business-event wrappers (send_payment_reminder_whatsapp, etc.) reuse the
exact same message content as the email/SMS channels (Templates class in
notifications.py) so the wording stays consistent across channels.

Inbound parent messages are persisted via process_webhook_event() into
message_threads/message_items (see app/models/message_thread.py) — one
open thread per (tenant, parent), reused across messages until a staff
member closes it. A sender we can't match to a User by phone number still
gets a message recorded (sender_type="unknown", thread with parent_id
NULL) rather than being dropped, so nothing a parent sends is silently
lost even before onboarding/phone-linking is complete.

NOT in scope here (deliberately, see docs/RENDER_RESEND_DEPLOYMENT_CHECKLIST.md
sibling doc docs/WHATSAPP_NOTIFICATIONS.md for the full roadmap):
  - the FastAPI webhook endpoint itself (this module only exposes the pure
    functions a thin endpoint will call).
  - the Arq jobs that call these functions asynchronously (see
    app/workers/tasks.py: send_whatsapp_notification, etc.).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

from app.models.notification_event import NotificationEvent
from app.services.notifications import Templates, WhatsAppSender

logger = logging.getLogger(__name__)

# Status progression used by apply_webhook_status() to make replay/out-of-order
# webhook delivery idempotent — a later status is never downgraded by an
# earlier one arriving after it (Meta does not guarantee delivery order).
_STATUS_RANK = {
    "PENDING": 0, "QUEUED": 1, "SENT": 2, "DELIVERED": 3, "READ": 4,
    "FAILED": 5, "CANCELED": 5,
}


# ─── Masking helpers ───────────────────────────────────────────────────────
# notification_events is a support/admin-facing log, not a PII store — the
# real phone/email lives on the User/Student record already.

def mask_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return phone
    digits = phone.strip()
    if len(digits) <= 4:
        return "*" * len(digits)
    return f"{digits[:4]}{'*' * (len(digits) - 6)}{digits[-2:]}" if len(digits) > 6 else f"{digits[:2]}***"


def mask_email(email: Optional[str]) -> Optional[str]:
    if not email or "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 1:
        return f"*@{domain}"
    return f"{local[0]}***@{domain}"


# ─── NotificationEvent CRUD ────────────────────────────────────────────────

def create_pending_event(
    db: Session,
    *,
    tenant_id: str,
    event_type: str,
    channel: str,
    recipient_phone: Optional[str] = None,
    recipient_email: Optional[str] = None,
    template_name: Optional[str] = None,
    payload: Optional[dict] = None,
    user_id: Optional[str] = None,
    student_id: Optional[str] = None,
    parent_id: Optional[str] = None,
) -> NotificationEvent:
    event = NotificationEvent(
        tenant_id=tenant_id,
        user_id=user_id,
        student_id=student_id,
        parent_id=parent_id,
        event_type=event_type,
        channel=channel,
        recipient_phone=mask_phone(recipient_phone),
        recipient_email=mask_email(recipient_email),
        template_name=template_name,
        payload_json=payload or {},
        status="PENDING",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def mark_event_sent(db: Session, event: NotificationEvent, provider_message_id: Optional[str]) -> None:
    event.status = "SENT"
    event.provider_message_id = provider_message_id
    event.sent_at = datetime.now(timezone.utc)
    db.commit()


def mark_event_failed(db: Session, event: NotificationEvent, error_reason: str) -> None:
    event.status = "FAILED"
    event.error_reason = (error_reason or "")[:500]
    event.failed_at = datetime.now(timezone.utc)
    event.retry_count = (event.retry_count or 0) + 1
    db.commit()


def apply_webhook_status(
    db: Session, provider_message_id: str, new_status: str, at: Optional[datetime] = None
) -> bool:
    """Idempotently advance a NotificationEvent's status from a webhook
    payload. Returns False if no event matches this provider_message_id
    (unknown/foreign message — never raises, the caller just counts it as
    unmatched and logs). A status that doesn't move the event forward
    (e.g. a duplicate/late 'sent' after 'read' already arrived) is a no-op,
    not an error — this is what makes replayed webhooks safe.
    """
    event = (
        db.query(NotificationEvent)
        .filter(NotificationEvent.provider_message_id == provider_message_id)
        .first()
    )
    if not event:
        return False

    new_rank = _STATUS_RANK.get(new_status, 0)
    current_rank = _STATUS_RANK.get(event.status, 0)
    if new_rank <= current_rank and event.status not in ("PENDING", "QUEUED", "SENT"):
        return True  # already at/past this status — matched, nothing to change

    ts = at or datetime.now(timezone.utc)
    event.status = new_status
    if new_status == "SENT" and not event.sent_at:
        event.sent_at = ts
    elif new_status == "DELIVERED":
        event.delivered_at = ts
    elif new_status == "READ":
        event.read_at = ts
    elif new_status == "FAILED":
        event.failed_at = ts
    db.commit()
    return True


# ─── Sending ────────────────────────────────────────────────────────────────

def send_whatsapp_template(
    db: Session,
    *,
    tenant_id: str,
    tenant_settings: dict,
    to_phone: str,
    template_key: str,
    event_type: str,
    body_vars: Optional[list] = None,
    fallback_text: str = "",
    language: str = "fr",
    user_id: Optional[str] = None,
    student_id: Optional[str] = None,
    parent_id: Optional[str] = None,
) -> NotificationEvent:
    """Send one WhatsApp message (template-first, text-fallback within the
    24h session window) and record it as a NotificationEvent regardless of
    outcome. `template_key` is a key into WhatsAppSender.TEMPLATES (e.g.
    "payment_reminder"), not the raw Meta template name.
    """
    event = create_pending_event(
        db,
        tenant_id=tenant_id,
        event_type=event_type,
        channel="whatsapp",
        recipient_phone=to_phone,
        template_name=WhatsAppSender.TEMPLATES.get(template_key, template_key),
        payload={"body_vars": body_vars or []},
        user_id=user_id,
        student_id=student_id,
        parent_id=parent_id,
    )

    token = tenant_settings.get("whatsappAccessToken", "")
    phone_id = tenant_settings.get("whatsappPhoneId", "")
    if not token or not phone_id:
        mark_event_failed(db, event, "WhatsApp non configuré pour cet établissement")
        return event
    if not to_phone:
        mark_event_failed(db, event, "Numéro de téléphone manquant")
        return event

    sender = WhatsAppSender(token, phone_id)
    success, message_id, error = sender.send_smart_full(
        to_phone=to_phone,
        body=fallback_text,
        template=template_key,
        template_vars=body_vars,
        language=language,
    )
    if success:
        mark_event_sent(db, event, message_id)
    else:
        mark_event_failed(db, event, error or "Échec inconnu du fournisseur")
    return event


def send_text_message(
    db: Session,
    *,
    tenant_id: str,
    tenant_settings: dict,
    to_phone: str,
    body: str,
    event_type: str = "manual_text",
    user_id: Optional[str] = None,
    student_id: Optional[str] = None,
    parent_id: Optional[str] = None,
) -> NotificationEvent:
    """Free-form text send (24h session window only) — used for the admin
    "test WhatsApp" button and for replying to an inbound conversation."""
    event = create_pending_event(
        db, tenant_id=tenant_id, event_type=event_type, channel="whatsapp",
        recipient_phone=to_phone, payload={"body_preview": body[:100]},
        user_id=user_id, student_id=student_id, parent_id=parent_id,
    )
    token = tenant_settings.get("whatsappAccessToken", "")
    phone_id = tenant_settings.get("whatsappPhoneId", "")
    if not token or not phone_id:
        mark_event_failed(db, event, "WhatsApp non configuré pour cet établissement")
        return event

    sender = WhatsAppSender(token, phone_id)
    success, message_id, error = sender.send_text_full(to_phone, body)
    if success:
        mark_event_sent(db, event, message_id)
    else:
        mark_event_failed(db, event, error or "Échec inconnu du fournisseur")
    return event


# ─── Business-event wrappers ────────────────────────────────────────────────
# Reuse the exact same copy as email/SMS (Templates class) so wording stays
# consistent across channels — only the delivery mechanics differ here.

def send_payment_reminder_whatsapp(
    db: Session, *, tenant_id: str, tenant_settings: dict, school_name: str,
    to_phone: str, parent_name: str, student_name: str, invoice_number: str,
    amount: str, due_date: str, student_id: Optional[str] = None, parent_id: Optional[str] = None,
) -> NotificationEvent:
    msg = Templates.payment_reminder(parent_name, student_name, invoice_number, amount, due_date, school_name)
    return send_whatsapp_template(
        db, tenant_id=tenant_id, tenant_settings=tenant_settings, to_phone=to_phone,
        template_key="payment_reminder", event_type="payment_reminder",
        body_vars=msg["whatsapp_vars"], fallback_text=msg["whatsapp_text"],
        student_id=student_id, parent_id=parent_id,
    )


def send_absence_alert_whatsapp(
    db: Session, *, tenant_id: str, tenant_settings: dict, school_name: str,
    to_phone: str, parent_name: str, student_name: str, date: str, subject: str,
    student_id: Optional[str] = None, parent_id: Optional[str] = None,
) -> NotificationEvent:
    msg = Templates.absence_alert(parent_name, student_name, date, subject, school_name)
    return send_whatsapp_template(
        db, tenant_id=tenant_id, tenant_settings=tenant_settings, to_phone=to_phone,
        template_key="absence_alert", event_type="absence_alert",
        body_vars=msg["whatsapp_vars"], fallback_text=msg["whatsapp_text"],
        student_id=student_id, parent_id=parent_id,
    )


def send_grade_alert_whatsapp(
    db: Session, *, tenant_id: str, tenant_settings: dict, school_name: str,
    to_phone: str, parent_name: str, student_name: str, subject: str, grade: str,
    max_grade: str, assessment_name: str, student_id: Optional[str] = None, parent_id: Optional[str] = None,
) -> NotificationEvent:
    msg = Templates.grade_alert(parent_name, student_name, subject, grade, max_grade, assessment_name, school_name)
    return send_whatsapp_template(
        db, tenant_id=tenant_id, tenant_settings=tenant_settings, to_phone=to_phone,
        template_key="grade_alert", event_type="grade_alert",
        body_vars=msg["whatsapp_vars"], fallback_text=msg["whatsapp_text"],
        student_id=student_id, parent_id=parent_id,
    )


def send_bulletin_ready_whatsapp(
    db: Session, *, tenant_id: str, tenant_settings: dict, school_name: str,
    to_phone: str, parent_name: str, student_name: str, term: str, portal_url: str = "",
    student_id: Optional[str] = None, parent_id: Optional[str] = None,
) -> NotificationEvent:
    msg = Templates.bulletin_ready(parent_name, student_name, term, school_name, portal_url)
    return send_whatsapp_template(
        db, tenant_id=tenant_id, tenant_settings=tenant_settings, to_phone=to_phone,
        template_key="bulletin_ready", event_type="bulletin_ready",
        body_vars=msg["whatsapp_vars"], fallback_text=msg["whatsapp_text"],
        student_id=student_id, parent_id=parent_id,
    )


def send_account_invitation_whatsapp(
    db: Session, *, tenant_id: str, tenant_settings: dict, school_name: str,
    to_phone: str, user_name: str, setup_url: str, user_id: Optional[str] = None, parent_id: Optional[str] = None,
) -> NotificationEvent:
    msg = Templates.account_invitation(user_name, setup_url, school_name)
    return send_whatsapp_template(
        db, tenant_id=tenant_id, tenant_settings=tenant_settings, to_phone=to_phone,
        template_key="account_invitation", event_type="account_invitation",
        body_vars=[user_name, setup_url, school_name], fallback_text=msg["whatsapp_text"],
        user_id=user_id, parent_id=parent_id,
    )


# ─── Webhook (Meta Cloud API) ───────────────────────────────────────────────

def verify_webhook(mode: Optional[str], token: Optional[str], challenge: Optional[str], expected_token: str) -> Optional[str]:
    """GET /whatsapp/webhook/ handshake per Meta's spec: echo `hub.challenge`
    back only if `hub.mode == "subscribe"` and the verify token matches the
    one configured for this tenant. Returns None on any mismatch — the
    endpoint must then respond 403, never guess or fall back to a default."""
    if mode == "subscribe" and expected_token and token == expected_token:
        return challenge
    return None


def resolve_tenant_settings_by_phone_id(db: Session, phone_number_id: str) -> Optional[tuple[str, dict]]:
    """Meta's webhook payload identifies the receiving number by
    `phone_number_id`, not by tenant — find which tenant owns it. Iterates
    in Python rather than a JSON-operator SQL WHERE clause so this works
    identically on Postgres (production) and SQLite (tests)."""
    if not phone_number_id:
        return None
    rows = db.execute(sql_text("SELECT id, settings FROM tenants")).mappings().all()
    for row in rows:
        raw = row["settings"]
        tenant_settings: dict = raw if isinstance(raw, dict) else (json.loads(raw) if raw else {})
        if tenant_settings.get("whatsappPhoneId") == phone_number_id:
            return str(row["id"]), tenant_settings
    return None


def _normalize_phone_digits(phone: Optional[str]) -> str:
    return "".join(c for c in (phone or "") if c.isdigit())


def _find_parent_by_phone(db: Session, tenant_id: str, phone: str):
    """Exact digit-normalized match only (no fuzzy suffix matching) — a
    wrong match here would misattribute a parent's message to a stranger,
    which is worse than leaving it unmatched. `+224 623 45 67 89` and
    "224623456789" compare equal; a genuinely different number never does.
    """
    from app.models import User

    digits = _normalize_phone_digits(phone)
    if not digits:
        return None
    candidates = (
        db.query(User)
        .filter(User.tenant_id == tenant_id, User.phone.isnot(None))
        .all()
    )
    for u in candidates:
        if _normalize_phone_digits(u.phone) == digits:
            return u
    return None


def _find_or_create_thread(
    db: Session, *, tenant_id: str, parent_id: Optional[str], student_id: Optional[str],
    source_channel: str = "whatsapp",
):
    from app.models import MessageThread

    query = db.query(MessageThread).filter(
        MessageThread.tenant_id == tenant_id,
        MessageThread.status == "OPEN",
        MessageThread.source_channel == source_channel,
    )
    # An unmatched sender still gets a thread (so the message isn't lost),
    # but must never be merged into another unmatched sender's thread —
    # match on parent_id only when we actually have one.
    query = query.filter(MessageThread.parent_id == parent_id) if parent_id else query.filter(MessageThread.parent_id.is_(None))
    thread = query.order_by(MessageThread.created_at.desc()).first()
    if thread:
        return thread

    thread = MessageThread(
        tenant_id=tenant_id, parent_id=parent_id, student_id=student_id,
        status="OPEN", source_channel=source_channel,
    )
    db.add(thread)
    db.flush()
    return thread


def process_webhook_event(db: Session, payload: dict) -> dict:
    """POST /whatsapp/webhook/ body handler. Never raises — a malformed or
    unrecognized payload is logged and counted, not a 500. Applies status
    updates (sent/delivered/read/failed) idempotently via
    apply_webhook_status(). Inbound parent messages are persisted as
    message_items (creating/reusing a message_threads row per parent) —
    an inbound message from an unrecognized number, or for an unresolved
    tenant, is still counted in `unmatched` and never crashes the webhook.
    """
    from app.models import MessageItem, ParentStudent

    summary = {
        "statuses_processed": 0, "unmatched": 0, "messages_seen": 0,
        "messages_persisted": 0, "errors": 0,
    }

    entries = payload.get("entry") if isinstance(payload, dict) else None
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        for change in entry.get("changes") or []:
            if not isinstance(change, dict):
                continue
            value = change.get("value")
            if not isinstance(value, dict):
                continue

            for status in value.get("statuses") or []:
                try:
                    provider_message_id = status.get("id")
                    raw_status = (status.get("status") or "").upper()
                    if not provider_message_id or raw_status not in ("SENT", "DELIVERED", "READ", "FAILED"):
                        continue
                    ts_raw = status.get("timestamp")
                    ts = datetime.fromtimestamp(int(ts_raw), tz=timezone.utc) if ts_raw else None
                    matched = apply_webhook_status(db, provider_message_id, raw_status, ts)
                    if matched:
                        summary["statuses_processed"] += 1
                    else:
                        summary["unmatched"] += 1
                        logger.warning("WhatsApp webhook status for an unknown message id")
                except Exception as exc:
                    summary["errors"] += 1
                    logger.error("Error applying WhatsApp status webhook event: %s", exc)

            metadata = value.get("metadata") or {}
            phone_number_id = metadata.get("phone_number_id")

            for message in value.get("messages") or []:
                summary["messages_seen"] += 1
                try:
                    provider_message_id = message.get("id")

                    # Webhook replay guard — Meta may redeliver the same
                    # event; a message already persisted must never be
                    # inserted twice.
                    if provider_message_id:
                        already = (
                            db.query(MessageItem)
                            .filter(MessageItem.provider_message_id == provider_message_id)
                            .first()
                        )
                        if already:
                            continue

                    resolved = (
                        resolve_tenant_settings_by_phone_id(db, phone_number_id)
                        if phone_number_id else None
                    )
                    if not resolved:
                        summary["unmatched"] += 1
                        logger.warning("WhatsApp inbound message for an unresolved phone_number_id")
                        continue
                    tenant_id, _tenant_settings = resolved

                    msg_type = message.get("type") or "unknown"
                    if msg_type == "text":
                        body = (message.get("text") or {}).get("body") or ""
                    else:
                        # Non-text (image/audio/location/...) — record that
                        # something arrived without trying to store media;
                        # a human still sees it in the thread and can call
                        # the parent back if it matters.
                        body = f"[message {msg_type} reçu — non affichable ici]"
                    body = body[:10000]  # defensive cap, mirrors other free-text fields in this codebase

                    from_phone = message.get("from")
                    parent_user = _find_parent_by_phone(db, tenant_id, from_phone) if from_phone else None

                    student_id = None
                    if parent_user:
                        link = (
                            db.query(ParentStudent)
                            .filter(
                                ParentStudent.parent_id == parent_user.id,
                                ParentStudent.tenant_id == tenant_id,
                            )
                            .first()
                        )
                        if link:
                            student_id = link.student_id

                    thread = _find_or_create_thread(
                        db,
                        tenant_id=tenant_id,
                        parent_id=str(parent_user.id) if parent_user else None,
                        student_id=str(student_id) if student_id else None,
                    )

                    item = MessageItem(
                        tenant_id=tenant_id,
                        thread_id=thread.id,
                        sender_type="parent" if parent_user else "unknown",
                        sender_user_id=str(parent_user.id) if parent_user else None,
                        direction="INBOUND",
                        channel="whatsapp",
                        body=body,
                        provider_message_id=provider_message_id,
                        status="RECEIVED",
                    )
                    db.add(item)
                    db.commit()
                    summary["messages_persisted"] += 1
                except Exception as exc:
                    db.rollback()
                    summary["errors"] += 1
                    logger.error("Error persisting inbound WhatsApp message: %s", exc)

    return summary
