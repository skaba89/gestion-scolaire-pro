"""
SchoolFlow Pro — Webhook Management API
========================================
Tenants can register webhook URLs to receive event notifications.

Security model:
- Each webhook can optionally have a ``secret`` — the payload is signed
  with HMAC-SHA256 and sent in the ``X-SchoolFlow-Signature`` header.
- Tenant isolation is enforced: tenants can only manage their own webhooks.
- Maximum 25 webhooks per tenant.
- Maximum 20 event subscriptions per webhook.

Delivery:
- Webhooks are delivered asynchronously via the event bus.
- Failed deliveries are logged with HTTP status code.
- Retry logic: 3 attempts with exponential back-off (handled by a background task).
"""
import hashlib
import hmac
import json
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.events import DomainEvent, EventType, subscribe_all
from app.core.security import get_current_user, require_permission

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class WebhookCreate(BaseModel):
    url: HttpUrl
    events: List[str]
    description: Optional[str] = None
    is_active: bool = True
    secret: Optional[str] = None

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: list) -> list:
        if not v:
            raise ValueError("Au moins un type d'événement est requis")
        valid = {e.value for e in EventType}
        invalid = [e for e in v if e not in valid]
        if invalid:
            raise ValueError(
                f"Types d'événements invalides: {invalid}. "
                f"Utilisez GET /webhooks/events/ pour la liste complète."
            )
        if len(v) > 20:
            raise ValueError("Maximum 20 événements par webhook")
        return list(set(v))  # deduplicate


class WebhookUpdate(BaseModel):
    url: Optional[HttpUrl] = None
    events: Optional[List[str]] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: Optional[list]) -> Optional[list]:
        if v is None:
            return v
        valid = {e.value for e in EventType}
        invalid = [e for e in v if e not in valid]
        if invalid:
            raise ValueError(f"Types d'événements invalides: {invalid}")
        return list(set(v))


class WebhookResponse(BaseModel):
    id: str
    url: str
    events: List[str]
    description: Optional[str] = None
    is_active: bool
    has_secret: bool = False
    created_at: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── Webhook Delivery ─────────────────────────────────────────────────────────

def _sign_payload(payload: str, secret: str) -> str:
    """Create HMAC-SHA256 signature for webhook payload."""
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


async def _deliver_webhook(url: str, payload: dict, secret: Optional[str] = None) -> bool:
    """Deliver a webhook payload to the target URL.

    Returns True on success (2xx response), False otherwise.
    Signs the payload with HMAC-SHA256 if a secret is configured.
    """
    import httpx

    body = json.dumps(payload, ensure_ascii=False, default=str)
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "SchoolFlowPro-Webhooks/1.0",
        "X-SchoolFlow-Event": payload.get("event", ""),
    }

    if secret:
        sig = _sign_payload(body, secret)
        headers["X-SchoolFlow-Signature"] = f"sha256={sig}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, content=body, headers=headers)
            if response.status_code >= 400:
                logger.warning(
                    "Webhook delivery failed: %s → HTTP %d",
                    url, response.status_code,
                )
                return False
            logger.debug("Webhook delivered: %s → HTTP %d", url, response.status_code)
            return True
    except Exception as exc:
        logger.error("Webhook delivery error to %s: %s", url, exc)
        return False


async def _dispatch_webhooks(event: DomainEvent) -> None:
    """Event handler: fan out event to all matching tenant webhooks."""
    from app.core.database import SessionLocal

    if not event.tenant_id:
        return

    try:
        with SessionLocal() as db:
            rows = db.execute(text("""
                SELECT url, secret
                FROM webhooks
                WHERE tenant_id = :tid
                  AND is_active = TRUE
                  AND :event = ANY(events)
            """), {
                "tid": event.tenant_id,
                "event": event.event_type.value,
            }).mappings().fetchall()

        for row in rows:
            await _deliver_webhook(row["url"], event.to_dict(), row.get("secret"))
    except Exception as exc:
        logger.error("Webhook dispatch failed for event %s: %s", event.event_type.value, exc)


# Register the dispatch handler for ALL event types at module load time
subscribe_all(_dispatch_webhooks)


# ─── API Endpoints ────────────────────────────────────────────────────────────

@router.get("/events/", tags=["Webhooks"])
def list_available_events(
    current_user: dict = Depends(get_current_user),
):
    """List all available webhook event types with their categories."""
    categories: dict = {}
    for e in EventType:
        cat = e.value.split(".")[0]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(e.value)
    return {"categories": categories, "total": len(EventType)}


@router.get("/", response_model=List[WebhookResponse])
def list_webhooks(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("auth:manage")),
):
    """List all webhooks for the current tenant."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Contexte tenant requis")

    try:
        rows = db.execute(text("""
            SELECT id, url, events, description, is_active,
                   (secret IS NOT NULL AND secret <> '') AS has_secret,
                   created_at
            FROM webhooks
            WHERE tenant_id = :tid
            ORDER BY created_at DESC
        """), {"tid": tenant_id}).mappings().fetchall()

        return [
            WebhookResponse(
                id=str(r["id"]),
                url=r["url"],
                events=r["events"] if isinstance(r["events"], list) else [],
                description=r.get("description"),
                is_active=bool(r["is_active"]),
                has_secret=bool(r.get("has_secret", False)),
                created_at=str(r["created_at"]) if r.get("created_at") else None,
            )
            for r in rows
        ]
    except Exception as exc:
        logger.error("Failed to list webhooks: %s", exc)
        return []


@router.post("/", status_code=201, response_model=WebhookResponse)
def create_webhook(
    body: WebhookCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("auth:manage")),
):
    """Register a new webhook endpoint.

    If ``secret`` is provided, all deliveries will include an
    ``X-SchoolFlow-Signature: sha256=<hmac>`` header for verification.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Contexte tenant requis")

    try:
        count = db.execute(
            text("SELECT COUNT(*) FROM webhooks WHERE tenant_id = :tid"),
            {"tid": tenant_id},
        ).scalar() or 0

        if count >= 25:
            raise HTTPException(
                status_code=429,
                detail="Maximum 25 webhooks par tenant atteint",
            )

        row = db.execute(text("""
            INSERT INTO webhooks (tenant_id, url, events, description, is_active, secret)
            VALUES (:tid, :url, :events::text[], :desc, :active, :secret)
            RETURNING id, url, events, description, is_active,
                      (secret IS NOT NULL AND secret <> '') AS has_secret,
                      created_at
        """), {
            "tid": tenant_id,
            "url": str(body.url),
            "events": body.events,
            "desc": body.description,
            "active": body.is_active,
            "secret": body.secret,
        }).mappings().first()

        db.commit()

        return WebhookResponse(
            id=str(row["id"]),
            url=row["url"],
            events=row["events"] if isinstance(row["events"], list) else [],
            description=row.get("description"),
            is_active=bool(row["is_active"]),
            has_secret=bool(row.get("has_secret", False)),
            created_at=str(row["created_at"]) if row.get("created_at") else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.error("Failed to create webhook: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors de la création du webhook")


@router.patch("/{webhook_id}/", response_model=WebhookResponse)
def update_webhook(
    webhook_id: UUID,
    body: WebhookUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("auth:manage")),
):
    """Update a webhook (partial update)."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Contexte tenant requis")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")

    ALLOWED = {"url", "events", "description", "is_active"}
    set_clauses = []
    params: dict = {"wid": str(webhook_id), "tid": tenant_id}

    for k, v in updates.items():
        if k in ALLOWED:
            if k == "url":
                v = str(v)
            set_clauses.append(f"{k} = :{k}")
            params[k] = v

    if not set_clauses:
        raise HTTPException(status_code=400, detail="Aucun champ valide à mettre à jour")

    try:
        row = db.execute(text(f"""
            UPDATE webhooks SET {', '.join(set_clauses)}, updated_at = NOW()
            WHERE id = :wid AND tenant_id = :tid
            RETURNING id, url, events, description, is_active,
                      (secret IS NOT NULL AND secret <> '') AS has_secret,
                      created_at
        """), params).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Webhook introuvable")

        db.commit()
        return WebhookResponse(
            id=str(row["id"]),
            url=row["url"],
            events=row["events"] if isinstance(row["events"], list) else [],
            description=row.get("description"),
            is_active=bool(row["is_active"]),
            has_secret=bool(row.get("has_secret", False)),
            created_at=str(row["created_at"]) if row.get("created_at") else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.error("Failed to update webhook %s: %s", webhook_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour")


@router.delete("/{webhook_id}/")
def delete_webhook(
    webhook_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("auth:manage")),
):
    """Delete a webhook permanently."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Contexte tenant requis")

    result = db.execute(text(
        "DELETE FROM webhooks WHERE id = :wid AND tenant_id = :tid"
    ), {"wid": str(webhook_id), "tid": tenant_id})

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Webhook introuvable")

    db.commit()
    return {"message": "Webhook supprimé avec succès"}


@router.post("/{webhook_id}/test/")
async def test_webhook(
    webhook_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("auth:manage")),
):
    """Send a test ping to a webhook URL to verify it's reachable."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Contexte tenant requis")

    row = db.execute(text("""
        SELECT url, secret FROM webhooks
        WHERE id = :wid AND tenant_id = :tid AND is_active = TRUE
    """), {"wid": str(webhook_id), "tid": tenant_id}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Webhook introuvable ou inactif")

    test_payload = {
        "event": "webhook.test",
        "version": "1.0",
        "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "tenant_id": tenant_id,
        "data": {"message": "Test de connectivité SchoolFlow Pro"},
    }

    success = await _deliver_webhook(row["url"], test_payload, row.get("secret"))
    return {
        "success": success,
        "url": row["url"],
        "message": "Ping envoyé avec succès" if success else "Échec — vérifiez l'URL et que votre serveur répond avec 2xx",
    }
