"""Early warning workflows. Every operation is scoped by tenant and permission."""
import logging
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.utils.audit import log_audit

router = APIRouter()
logger = logging.getLogger(__name__)

AlertType = Literal["academic", "attendance", "behavior", "engagement", "wellbeing"]
Severity = Literal["low", "medium", "high", "critical"]
Status = Literal["new", "acknowledged", "in_progress", "resolved", "dismissed"]


class EarlyWarningCreate(BaseModel):
    student_id: UUID
    alert_type: AlertType
    severity: Severity
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    recommended_actions: list[str] = Field(default_factory=list, max_length=10)


class EarlyWarningUpdate(BaseModel):
    status: Status
    resolution_notes: str | None = Field(default=None, max_length=4000)
    # Ignore client-supplied identity/time: both are determined by the server.
    model_config = {"extra": "forbid"}


def _management_only(user: dict) -> None:
    """Alert contents are sensitive student records, not generic KPI analytics."""
    roles = set(user.get("roles") or [])
    if not roles.intersection({"TENANT_ADMIN", "DIRECTOR", "SUPER_ADMIN"}):
        raise HTTPException(status_code=403, detail="Early warning access reserved for school management")


def _tenant(request: Request, user: dict, db: Session) -> str:
    tenant_id = resolve_current_tenant_id(request, user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Tenant context required")
    return str(tenant_id)


def _row_to_response(row: dict) -> dict:
    item = dict(row)
    for key in ("id", "tenant_id", "student_id", "acknowledged_by", "resolved_by"):
        if item.get(key) is not None:
            item[key] = str(item[key])
    for key in ("created_at", "updated_at", "acknowledged_at", "resolved_at"):
        if item.get(key) is not None:
            item[key] = item[key].isoformat() if hasattr(item[key], "isoformat") else str(item[key])
    item["student"] = {
        "first_name": item.pop("first_name", None),
        "last_name": item.pop("last_name", None),
        "registration_number": item.pop("registration_number", None),
    }
    # The processing tab relies on acknowledged_user; do not leave that
    # metadata silently empty after a successful acknowledgement.
    acknowledged_first = item.pop("acknowledged_first_name", None)
    acknowledged_last = item.pop("acknowledged_last_name", None)
    item["acknowledged_user"] = (
        {"first_name": acknowledged_first, "last_name": acknowledged_last}
        if item.get("acknowledged_by") and
        (acknowledged_first is not None or acknowledged_last is not None)
        else None
    )
    return item


_SELECT = """
    SELECT w.*, s.first_name, s.last_name, s.registration_number,
           ack.first_name AS acknowledged_first_name,
           ack.last_name AS acknowledged_last_name
    FROM early_warnings w
    JOIN students s ON s.id = w.student_id AND s.tenant_id = w.tenant_id
    LEFT JOIN users ack ON ack.id = w.acknowledged_by
                       AND ack.tenant_id = w.tenant_id
"""


@router.get("/")
def list_early_warnings(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
):
    _management_only(current_user)
    tenant_id = _tenant(request, current_user, db)
    # The UI currently renders all alerts. Do not silently return a paginated
    # subset that would make the counters claim completeness.
    rows = db.execute(text(_SELECT + """
        WHERE w.tenant_id = :tid ORDER BY w.created_at DESC, w.id
    """), {"tid": tenant_id}).mappings().all()
    return [_row_to_response(row) for row in rows]



@router.get("/paginated/")
def list_early_warnings_paginated(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Status | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("analytics:read")),
):
    """Bounded tenant-scoped listing; legacy unpaged endpoint remains unchanged.

    Status is Pydantic-validated and all SQL values are bound parameters.
    The frontend must migrate explicitly before the unpaged API is retired.
    """
    _management_only(current_user)
    tenant_id = _tenant(request, current_user, db)
    where = " WHERE w.tenant_id = :tid"
    params: dict = {"tid": tenant_id}
    if status is not None:
        where += " AND w.status = :status"
        params["status"] = status

    total = db.execute(
        text("SELECT COUNT(*) FROM early_warnings w" + where), params
    ).scalar_one()
    offset = (page - 1) * page_size
    rows = db.execute(
        text(_SELECT + where + " ORDER BY w.created_at DESC, w.id DESC LIMIT :limit OFFSET :offset"),
        {**params, "limit": page_size, "offset": offset},
    ).mappings().all()
    return {
        "items": [_row_to_response(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.post("/", status_code=201)
def create_early_warning(
    payload: EarlyWarningCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    _management_only(current_user)
    tenant_id = _tenant(request, current_user, db)
    student = db.execute(text("""
        SELECT 1 FROM students
        WHERE id = :sid AND tenant_id = :tid
    """), {"sid": str(payload.student_id), "tid": tenant_id}).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in this establishment")
    warning_id = str(uuid4())
    db.execute(text("""
        INSERT INTO early_warnings
            (id, tenant_id, student_id, alert_type, severity,
             title, description, recommended_actions, status)
        VALUES (:id, :tid, :sid, :type, :severity, :title, :description,
                CAST(:actions AS JSON), 'new')
    """), {
        "id": warning_id, "tid": tenant_id, "sid": str(payload.student_id),
        "type": payload.alert_type, "severity": payload.severity,
        "title": payload.title, "description": payload.description,
        "actions": __import__("json").dumps(payload.recommended_actions),
    })
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="CREATE_EARLY_WARNING", resource_type="EARLY_WARNING",
              resource_id=warning_id)
    db.commit()
    row = db.execute(text(_SELECT + """
        WHERE w.id = :id AND w.tenant_id = :tid
    """), {"id": warning_id, "tid": tenant_id}).mappings().first()
    return _row_to_response(row)


@router.put("/{warning_id}/")
def update_early_warning(
    warning_id: UUID,
    payload: EarlyWarningUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    _management_only(current_user)
    tenant_id = _tenant(request, current_user, db)
    row = db.execute(text("""
        SELECT status FROM early_warnings
        WHERE id = :id AND tenant_id = :tid FOR UPDATE
    """), {"id": str(warning_id), "tid": tenant_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Alert not found")
    old_status = row[0]
    transitions = {
        "new": {"acknowledged", "dismissed"},
        "acknowledged": {"in_progress", "resolved", "dismissed"},
        "in_progress": {"resolved", "dismissed"},
        "resolved": set(),
        "dismissed": set(),
    }
    if payload.status not in transitions.get(old_status, set()):
        raise HTTPException(status_code=409, detail="Invalid alert status transition")
    if payload.status == "resolved" and not (payload.resolution_notes or "").strip():
        raise HTTPException(status_code=422, detail="Resolution notes required")
    now = datetime.now(timezone.utc)
    db.execute(text("""
        UPDATE early_warnings SET
            status = CAST(:status AS VARCHAR(20)),
            resolution_notes = CASE WHEN CAST(:status AS VARCHAR(20)) = 'resolved'
                                    THEN CAST(:notes AS TEXT) ELSE resolution_notes END,
            acknowledged_by = CASE WHEN CAST(:status AS VARCHAR(20)) = 'acknowledged'
                                   THEN CAST(:uid AS UUID) ELSE acknowledged_by END,
            acknowledged_at = CASE WHEN CAST(:status AS VARCHAR(20)) = 'acknowledged'
                                   THEN CAST(:now AS TIMESTAMP WITH TIME ZONE) ELSE acknowledged_at END,
            resolved_by = CASE WHEN CAST(:status AS VARCHAR(20)) = 'resolved'
                               THEN CAST(:uid AS UUID) ELSE resolved_by END,
            resolved_at = CASE WHEN CAST(:status AS VARCHAR(20)) = 'resolved'
                               THEN CAST(:now AS TIMESTAMP WITH TIME ZONE) ELSE resolved_at END,
            updated_at = CAST(:now AS TIMESTAMP WITH TIME ZONE)
        WHERE id = :id AND tenant_id = :tid
    """), {
        "status": payload.status, "notes": payload.resolution_notes,
        "uid": str(current_user["id"]), "now": now,
        "id": str(warning_id), "tid": tenant_id,
    })
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="UPDATE_EARLY_WARNING", resource_type="EARLY_WARNING",
              resource_id=str(warning_id))
    db.commit()
    result = db.execute(text(_SELECT + """
        WHERE w.id = :id AND w.tenant_id = :tid
    """), {"id": str(warning_id), "tid": tenant_id}).mappings().first()
    return _row_to_response(result)
