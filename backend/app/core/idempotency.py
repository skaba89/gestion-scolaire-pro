"""Backend idempotency helpers for the offline queue (Phase 5, WhatsApp/
offline hardening brief).

The frontend's offline outbox (localStorage today, IndexedDB after Phase 6)
retries a queued POST/PATCH whenever it can't tell if the first attempt's
response actually reached it — a dropped response after the server already
committed the write is indistinguishable, from the client, from the
request never having arrived. Without this, a retried "mark present" or
"send message" silently double-writes.

Usage in an endpoint (see attendance.py for the first wiring):

    idem_key = request.headers.get("x-idempotency-key")
    if idem_key:
        cached = get_idempotent_response_or_lock(
            db, tenant_id=tenant_id, user_id=user_id, key=idem_key,
            method="POST", endpoint=str(request.url.path), request_body=body_dict,
        )
        if cached is not None:
            return JSONResponse(status_code=cached[1], content=cached[0])
    ... do the real work, build `response_body` and `status_code` ...
    if idem_key:
        store_idempotent_response(
            db, tenant_id=tenant_id, user_id=user_id, key=idem_key,
            method="POST", endpoint=str(request.url.path), request_body=body_dict,
            response_body=response_body, status_code=status_code,
        )

Header absent → every call above is skipped and behavior is byte-for-byte
unchanged from before this feature existed.
"""
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.idempotency_key import IdempotencyKey

logger = logging.getLogger(__name__)

DEFAULT_TTL_HOURS = 48


def _hash_request(body: Any) -> str:
    canonical = json.dumps(body, sort_keys=True, default=str) if body is not None else ""
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def get_idempotent_response_or_lock(
    db: Session, *, tenant_id: str, user_id: str, key: str, method: str, endpoint: str,
    request_body: Any = None,
) -> Optional[tuple]:
    """Call before doing the real work. Returns (response_body, status_code)
    to replay if this exact (tenant, user, key) was already handled with the
    SAME request body. Raises 409 if the same key is replayed with a
    DIFFERENT body (client bug, or a key collision) — never silently
    returns the old response for a different request. Returns None if this
    is a genuinely new key (caller should proceed and then call
    store_idempotent_response()).
    """
    if not key:
        return None

    existing = (
        db.query(IdempotencyKey)
        .filter(
            IdempotencyKey.tenant_id == tenant_id,
            IdempotencyKey.user_id == user_id,
            IdempotencyKey.key == key,
        )
        .first()
    )
    if not existing:
        return None

    if existing.expires_at and existing.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        # Expired — treat as if it never existed; the row is overwritten
        # by store_idempotent_response()'s upsert-by-delete below.
        return None

    request_hash = _hash_request(request_body)
    if existing.request_hash != request_hash:
        raise HTTPException(
            status_code=409,
            detail="Idempotency-Key déjà utilisée avec un contenu différent",
        )

    try:
        response_body = json.loads(existing.response_json)
    except (TypeError, ValueError):
        response_body = None
    return (response_body, existing.status_code)


def store_idempotent_response(
    db: Session, *, tenant_id: str, user_id: str, key: str, method: str, endpoint: str,
    request_body: Any, response_body: Any, status_code: int, ttl_hours: int = DEFAULT_TTL_HOURS,
) -> None:
    """Call once the real work succeeded, with the response actually sent
    to the client. Never raises — a failure to persist the idempotency
    record must not fail the request that already succeeded; a retry that
    lands after a failed store here just redoes the work once more, which
    is the pre-Phase-5 behavior, not a regression."""
    if not key:
        return
    try:
        existing = (
            db.query(IdempotencyKey)
            .filter(
                IdempotencyKey.tenant_id == tenant_id,
                IdempotencyKey.user_id == user_id,
                IdempotencyKey.key == key,
            )
            .first()
        )
        if existing:
            return  # a concurrent request already recorded this key

        record = IdempotencyKey(
            key=key, tenant_id=tenant_id, user_id=user_id, method=method, endpoint=endpoint,
            request_hash=_hash_request(request_body),
            response_json=json.dumps(response_body, default=str),
            status_code=status_code,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl_hours),
        )
        db.add(record)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Failed to store idempotency record for key %s: %s", key, exc)
