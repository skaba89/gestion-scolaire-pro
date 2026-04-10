import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Any
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit

router = APIRouter()
logger = logging.getLogger(__name__)


# --- Schemas ---

class IncidentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    incident_type: str
    severity: str = "LOW"
    occurred_at: Optional[str] = None
    location: Optional[str] = None
    student_ids: Optional[List[str]] = None
    notes: Optional[str] = None


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    incident_type: Optional[str] = None
    severity: Optional[str] = None
    occurred_at: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class ResolveRequest(BaseModel):
    resolution: Optional[str] = None
    action_taken: Optional[str] = None


class AssignRequest(BaseModel):
    resolver_id: str
    notes: Optional[str] = None


# --- List Incidents ---

@router.get("/")
def list_incidents(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    rows = db.execute(text("""
        SELECT i.*,
               u1.first_name as reporter_first_name, u1.last_name as reporter_last_name,
               u2.first_name as resolver_first_name, u2.last_name as resolver_last_name
        FROM incidents i
        LEFT JOIN users u1 ON u1.id = i.reported_by
        LEFT JOIN users u2 ON u2.id = i.resolved_by
        WHERE i.tenant_id = :tid
        ORDER BY i.occurred_at DESC
    """), {"tid": tenant_id}).fetchall()

    return [{
        **dict(r._mapping),
        "reporter": {"first_name": r.reporter_first_name, "last_name": r.reporter_last_name},
        "resolver": {"first_name": r.resolver_first_name, "last_name": r.resolver_last_name},
        "parties": [],
        "actions": []
    } for r in rows]


# --- Create Incident ---

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_incident(
    incident: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new incident."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            INSERT INTO incidents (id, tenant_id, title, description, incident_type, severity,
                                   occurred_at, location, status, reported_by, notes, created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :title, :desc, :itype, :severity, :occurred, :loc,
                    'OPEN', :uid, :notes, NOW(), NOW())
            RETURNING id, tenant_id, title, description, incident_type, severity,
                      occurred_at, location, status, reported_by, resolved_by, resolution,
                      action_taken, notes, created_at, updated_at
        """), {
            "tid": tenant_id, "title": incident.title, "desc": incident.description,
            "itype": incident.incident_type, "severity": incident.severity,
            "occurred": incident.occurred_at, "loc": incident.location,
            "uid": current_user.get("id"), "notes": incident.notes,
        }).mappings().first()

        incident_id = str(result["id"])

        # Link involved students if provided
        if incident.student_ids:
            for sid in incident.student_ids:
                db.execute(text("""
                    INSERT INTO incident_parties (id, tenant_id, incident_id, student_id, party_type, created_at)
                    VALUES (gen_random_uuid(), :tid, :iid, :sid, 'INVOLVED', NOW())
                    ON CONFLICT DO NOTHING
                """), {"tid": tenant_id, "iid": incident_id, "sid": sid})

        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_INCIDENT", resource_type="INCIDENT", resource_id=incident_id)
        db.commit()

        return {
            **dict(result),
            "reporter": {"first_name": current_user.get("first_name"), "last_name": current_user.get("last_name")},
            "resolver": None,
            "parties": incident.student_ids or [],
            "actions": [],
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating incident: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# --- Update Incident ---

@router.put("/{incident_id}/")
def update_incident(
    incident_id: UUID,
    incident: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update an incident."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        sets = []
        params = {"iid": str(incident_id), "tid": tenant_id}
        field_map = {
            "title": incident.title, "description": incident.description,
            "incident_type": incident.incident_type, "severity": incident.severity,
            "occurred_at": incident.occurred_at, "location": incident.location,
            "status": incident.status, "notes": incident.notes,
        }
        for col, val in field_map.items():
            if val is not None:
                sets.append(f"{col} = :{col}")
                params[col] = val
        if not sets:
            raise HTTPException(status_code=400, detail="No fields to update")
        sets.append("updated_at = NOW()")
        query_str = f"""
            UPDATE incidents SET {', '.join(sets)}
            WHERE id = :iid AND tenant_id = :tid
            RETURNING id, tenant_id, title, description, incident_type, severity,
                      occurred_at, location, status, reported_by, resolved_by, resolution,
                      action_taken, notes, created_at, updated_at
        """
        result = db.execute(text(query_str), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Incident not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_INCIDENT", resource_type="INCIDENT", resource_id=str(incident_id))
        db.commit()
        return {
            **dict(result),
            "reporter": None, "resolver": None, "parties": [], "actions": [],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating incident: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# --- Resolve Incident ---

@router.put("/{incident_id}/resolve/")
def resolve_incident(
    incident_id: UUID,
    resolve: ResolveRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Resolve an incident."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        params = {
            "iid": str(incident_id), "tid": tenant_id,
            "resolver": current_user.get("id"),
            "resolution": resolve.resolution,
            "action_taken": resolve.action_taken,
            "now": datetime.now(timezone.utc),
        }
        result = db.execute(text("""
            UPDATE incidents SET status = 'RESOLVED', resolved_by = :resolver,
                resolution = :resolution, action_taken = :action_taken,
                resolved_at = :now, updated_at = :now
            WHERE id = :iid AND tenant_id = :tid AND status != 'RESOLVED'
            RETURNING id, tenant_id, title, description, incident_type, severity,
                      occurred_at, location, status, reported_by, resolved_by, resolution,
                      action_taken, notes, created_at, updated_at
        """), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Incident not found or already resolved")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="RESOLVE_INCIDENT", resource_type="INCIDENT", resource_id=str(incident_id))
        db.commit()
        return {
            **dict(result),
            "reporter": None, "resolver": {"id": current_user.get("id"), "first_name": current_user.get("first_name"), "last_name": current_user.get("last_name")},
            "parties": [], "actions": [],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error resolving incident: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# --- Assign Incident ---

@router.put("/{incident_id}/assign/")
def assign_incident(
    incident_id: UUID,
    assign: AssignRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Assign an incident to a resolver."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        params = {
            "iid": str(incident_id), "tid": tenant_id,
            "resolver": assign.resolver_id,
        }
        result = db.execute(text("""
            UPDATE incidents SET assigned_to = :resolver, status = 'ASSIGNED', updated_at = NOW()
            WHERE id = :iid AND tenant_id = :tid
            RETURNING id, tenant_id, title, description, incident_type, severity,
                      occurred_at, location, status, reported_by, resolved_by, assigned_to,
                      resolution, action_taken, notes, created_at, updated_at
        """), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Incident not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="ASSIGN_INCIDENT", resource_type="INCIDENT", resource_id=str(incident_id))
        db.commit()
        return {
            **dict(result),
            "reporter": None, "resolver": None, "parties": [], "actions": [],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error assigning incident: {e}")
        raise HTTPException(status_code=400, detail=str(e))
