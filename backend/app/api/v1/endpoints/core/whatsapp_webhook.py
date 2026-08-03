"""WhatsApp Cloud API webhook — GET (Meta's verify-token handshake) and
POST (message/status delivery). No JWT: Meta can never obtain one for this
platform, and the tenant isn't known until the payload is parsed (see
whatsapp_service.resolve_tenant_settings_by_phone_id). Exempted from
TenantMiddleware's JWT/tenant-context requirement in app/middlewares/tenant.py.

Authenticity is checked two different ways for the two methods, both
inside this handler rather than via a shared dependency:
  - GET: the `hub.verify_token` query param must match some tenant's
    configured `whatsappVerifyToken`.
  - POST: if the resolved tenant has a `whatsappAppSecret` configured,
    Meta's `X-Hub-Signature-256` header is verified over the raw request
    body (HMAC-SHA256). If no app secret is configured for that tenant,
    the event is still processed (Meta Business apps that skip app-secret
    configuration are common for small deployments) but this is a real
    security gap worth closing before scaling past a handful of tenants —
    see docs/WHATSAPP_NOTIFICATIONS.md.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import text as sql_text

from app.core.database import SessionLocal
from app.services import whatsapp_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _fetch_all_tenant_settings(db) -> list[dict]:
    rows = db.execute(sql_text("SELECT id, settings FROM tenants")).mappings().all()
    result = []
    for row in rows:
        raw = row["settings"]
        settings = raw if isinstance(raw, dict) else (json.loads(raw) if raw else {})
        result.append({"tenant_id": str(row["id"]), **settings})
    return result


@router.get("/webhook/")
@router.get("/webhook")
async def whatsapp_webhook_verify(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
):
    """Meta's one-time subscription handshake. Must return the raw
    `hub.challenge` value as plain text (not JSON) on success, or a 403
    on any mismatch — never guess or accept a default token."""
    with SessionLocal() as db:
        candidate_tokens = {
            t["whatsappVerifyToken"] for t in _fetch_all_tenant_settings(db) if t.get("whatsappVerifyToken")
        }

    for expected_token in candidate_tokens:
        challenge = whatsapp_service.verify_webhook(hub_mode, hub_verify_token, hub_challenge, expected_token)
        if challenge is not None:
            return Response(content=challenge, media_type="text/plain")

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


@router.post("/webhook/")
@router.post("/webhook")
async def whatsapp_webhook_receive(request: Request):
    """Meta delivers message/status events here. Always returns 200 once
    the payload has been parsed and processed (even for unmatched/unknown
    messages) — a non-200 response makes Meta retry the same event
    repeatedly, which is not what an "unmatched event" should trigger.
    A truly malformed body (not even valid JSON) still returns 200 with a
    zeroed summary rather than 400 — same reasoning."""
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body) if raw_body else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        logger.warning("WhatsApp webhook: received non-JSON body")
        return {"processed": False}

    phone_number_id = _extract_phone_number_id(payload)
    with SessionLocal() as db:
        resolved = (
            whatsapp_service.resolve_tenant_settings_by_phone_id(db, phone_number_id)
            if phone_number_id else None
        )
        if resolved:
            tenant_id, tenant_settings = resolved
            app_secret = tenant_settings.get("whatsappAppSecret")
            if app_secret:
                signature = request.headers.get("x-hub-signature-256", "")
                if not _valid_signature(raw_body, app_secret, signature):
                    logger.warning("WhatsApp webhook: invalid signature for tenant %s", tenant_id)
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
        else:
            logger.warning("WhatsApp webhook: no tenant matches phone_number_id in payload")

        summary = whatsapp_service.process_webhook_event(db, payload)

    return {"processed": True, **summary}


def _extract_phone_number_id(payload: dict) -> str | None:
    try:
        entries = payload.get("entry") or []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            for change in entry.get("changes") or []:
                if not isinstance(change, dict):
                    continue
                value = change.get("value")
                if not isinstance(value, dict):
                    continue
                metadata = value.get("metadata") or {}
                phone_id = metadata.get("phone_number_id")
                if phone_id:
                    return phone_id
    except Exception:
        pass
    return None


def _valid_signature(raw_body: bytes, app_secret: str, signature_header: str) -> bool:
    if not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    provided = signature_header.removeprefix("sha256=")
    return hmac.compare_digest(expected, provided)
