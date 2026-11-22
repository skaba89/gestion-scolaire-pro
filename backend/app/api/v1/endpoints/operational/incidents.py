import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID, uuid4
from datetime import datetime, timezone

from app.core.cycle_scope import (
    is_cycle_restricted, require_students_in_scope, scoped_class_ids, student_scope_sql,
)
from app.core.database import get_db
from app.core.security import require_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.models.student import Student
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


# --- Participants et périmètre par cycle (lot B2c-2) ---
# ``incidents.student_id`` reste la représentation historique. Les nouveaux
# incidents portent aussi chaque participant dans ``incident_parties``. Un
# incident restreint n'est visible que si TOUS ses élèves sont dans le
# périmètre ; un incident sans élève reste réservé aux comptes non restreints.


def _validated_student_ids(
    db: Session, tenant_id: str, student_ids: Optional[List[str]]
) -> List[str]:
    """Return unique tenant-owned student UUIDs, preserving request order.

    Validation is required even for unrestricted administrators: relying only
    on a foreign key would distinguish a foreign student from an unknown one
    and would make the multi-row write fail after the incident insert.
    """
    parsed: List[str] = []
    parsed_uuids: List[UUID] = []
    seen = set()
    for value in student_ids or []:
        try:
            normalized = str(UUID(str(value)))
        except (TypeError, ValueError, AttributeError):
            raise HTTPException(status_code=404, detail="Élève introuvable")
        if normalized not in seen:
            parsed.append(normalized)
            parsed_uuids.append(UUID(normalized))
            seen.add(normalized)
    if not parsed:
        return []
    rows = (
        db.query(Student.id)
        .filter(Student.tenant_id == tenant_id, Student.id.in_(parsed_uuids))
        .all()
    )
    if {str(student_id) for (student_id,) in rows} != set(parsed):
        raise HTTPException(status_code=404, detail="Élève introuvable")
    return parsed


def _incident_student_ids(
    db: Session, tenant_id: str, incident_id: UUID | str
) -> List[str]:
    rows = db.execute(
        text("""
            SELECT ip.student_id::text
            FROM incident_parties ip
            WHERE ip.tenant_id = :tid AND ip.incident_id = :iid
            UNION
            SELECT i.student_id::text
            FROM incidents i
            WHERE i.tenant_id = :tid AND i.id = :iid AND i.student_id IS NOT NULL
        """),
        {"tid": tenant_id, "iid": str(incident_id)},
    ).scalars().all()
    return list(rows)


def _require_incident_in_scope(
    db: Session,
    tenant_id: str,
    current_user: dict,
    incident_id: UUID,
    detail: str,
) -> None:
    """404 (même message qu'un incident inexistant) si l'incident n'est pas dans le périmètre ;
    sans effet pour un compte non restreint. À appeler AVANT toute écriture."""
    if not is_cycle_restricted(current_user):
        return
    student_ids = _incident_student_ids(db, tenant_id, incident_id)
    if not student_ids:
        raise HTTPException(status_code=404, detail=detail)
    require_students_in_scope(
        db, tenant_id, current_user, student_ids, detail=detail
    )


# --- List Incidents ---

@router.get("/")
def list_incidents(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    # SECURITY FIX (institutional-readiness audit, 2026-09): had NO
    # permission check at all (get_current_user only), while
    # create_incident/update_incident/resolve_incident/assign_incident below
    # all require settings:write — any authenticated tenant user could read
    # every incident's raw fields (title, description, notes, student_ids,
    # location, occurred_at, reporter/resolver identity) tenant-wide. Gated
    # on the same permission as its siblings; DIRECTOR already holds
    # settings:write, so this doesn't regress existing DIRECTOR access.
    current_user: dict = Depends(require_permission("settings:write")),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        return []
    # SCALABILITY: bounded by page_size — this table has no purge policy and
    # grows indefinitely, so an unbounded SELECT would eventually load the
    # entire tenant's incident history into memory on every page view.
    scope_sql, scope_binds = "1 = 1", []
    if is_cycle_restricted(current_user):
        # Filtre avant LIMIT/OFFSET et règle « tous les participants » :
        # l'existence d'un seul élève hors périmètre masque tout le texte libre.
        participant_in_scope, scope_binds = student_scope_sql(
            "participant.student_id",
            scoped_class_ids(db, tenant_id, current_user),
            tenant_id=tenant_id,
            tag="inc",
        )
        scope_sql = f"""
            EXISTS (
                SELECT 1 FROM incident_participants participant
                WHERE participant.incident_id = i.id
                  AND participant.tenant_id = i.tenant_id
            )
            AND NOT EXISTS (
                SELECT 1 FROM incident_participants participant
                WHERE participant.incident_id = i.id
                  AND participant.tenant_id = i.tenant_id
                  AND NOT ({participant_in_scope})
            )
        """
    rows = db.execute(text(f"""
        WITH incident_participants AS (
            SELECT ip.tenant_id, ip.incident_id, ip.student_id
            FROM incident_parties ip
            WHERE ip.tenant_id = :tid
            UNION
            SELECT legacy.tenant_id, legacy.id AS incident_id, legacy.student_id
            FROM incidents legacy
            WHERE legacy.tenant_id = :tid AND legacy.student_id IS NOT NULL
        )
        SELECT i.*,
               u1.first_name as reporter_first_name, u1.last_name as reporter_last_name,
               u2.first_name as resolver_first_name, u2.last_name as resolver_last_name,
               COALESCE(
                   (SELECT array_agg(participant.student_id::text ORDER BY participant.student_id::text)
                    FROM incident_participants participant
                    WHERE participant.incident_id = i.id
                      AND participant.tenant_id = i.tenant_id),
                   ARRAY[]::text[]
               ) AS party_ids
        FROM incidents i
        LEFT JOIN users u1 ON u1.id = i.reported_by
        LEFT JOIN users u2 ON u2.id = i.resolved_by
        WHERE i.tenant_id = :tid AND {scope_sql}
        ORDER BY i.occurred_at DESC
        LIMIT :limit OFFSET :offset
    """).bindparams(*scope_binds), {"tid": tenant_id, "limit": page_size, "offset": (page - 1) * page_size}).fetchall()

    items = []
    for row in rows:
        item = dict(row._mapping)
        party_ids = list(item.pop("party_ids", []) or [])
        reporter_first_name = item.pop("reporter_first_name", None)
        reporter_last_name = item.pop("reporter_last_name", None)
        resolver_first_name = item.pop("resolver_first_name", None)
        resolver_last_name = item.pop("resolver_last_name", None)
        item.update({
            "reporter": {
                "first_name": reporter_first_name,
                "last_name": reporter_last_name,
            },
            "resolver": (
                {"first_name": resolver_first_name, "last_name": resolver_last_name}
                if item.get("resolved_by") else None
            ),
            "parties": party_ids,
            "actions": [],
        })
        items.append(item)
    return items


# --- Create Incident ---

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_incident(
    request: Request,
    incident: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new incident."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    student_ids = _validated_student_ids(db, tenant_id, incident.student_ids)
    if is_cycle_restricted(current_user):
        # Périmètre par cycle (B2c-2), avant toute écriture : au moins un élève, tous dans le
        # périmètre (un incident sans élève serait invisible de son propre auteur).
        if not student_ids:
            raise HTTPException(status_code=422, detail="Au moins un élève du périmètre est requis")
        require_students_in_scope(db, tenant_id, current_user, student_ids)
    try:
        result = db.execute(text("""
            INSERT INTO incidents (id, tenant_id, title, description, incident_type, severity,
                                   occurred_at, location, status, reported_by, student_id,
                                   notes, created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :title, :desc, :itype, :severity, :occurred, :loc,
                    'OPEN', :uid, :student_id, :notes, NOW(), NOW())
            RETURNING id, tenant_id, title, description, incident_type, severity,
                      occurred_at, location, status, reported_by, resolved_by, resolution,
                      action_taken, resolved_at, notes, created_at, updated_at
        """), {
            "tid": tenant_id, "title": incident.title, "desc": incident.description,
            "itype": incident.incident_type, "severity": incident.severity,
            "occurred": incident.occurred_at, "loc": incident.location,
            "uid": current_user.get("id"),
            "student_id": student_ids[0] if student_ids else None,
            "notes": incident.notes,
        }).mappings().first()

        incident_id = str(result["id"])

        # Link involved students if provided
        if student_ids:
            for sid in student_ids:
                db.execute(text("""
                    INSERT INTO incident_parties (id, tenant_id, incident_id, student_id, party_type, created_at)
                    VALUES (:id, :tid, :iid, :sid, 'INVOLVED', NOW())
                    ON CONFLICT (tenant_id, incident_id, student_id) DO NOTHING
                """), {
                    "id": str(uuid4()), "tid": tenant_id,
                    "iid": incident_id, "sid": sid,
                })

        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="CREATE_INCIDENT", resource_type="INCIDENT", resource_id=incident_id)
        db.commit()

        return {
            **dict(result),
            "reporter": {"first_name": current_user.get("first_name"), "last_name": current_user.get("last_name")},
            "resolver": None,
            "parties": student_ids,
            "actions": [],
        }
    except Exception as e:
        db.rollback()
        logger.error("Error creating incident: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


# --- Update Incident ---

@router.put("/{incident_id}/")
def update_incident(
    request: Request,
    incident_id: UUID,
    incident: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update an incident."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    _require_incident_in_scope(db, tenant_id, current_user, incident_id, "Incident not found")  # B2c-2
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
                      action_taken, resolved_at, notes, created_at, updated_at
        """
        result = db.execute(text(query_str), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Incident not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_INCIDENT", resource_type="INCIDENT", resource_id=str(incident_id))
        db.commit()
        return {
            **dict(result),
            "reporter": None, "resolver": None,
            "parties": _incident_student_ids(db, tenant_id, incident_id),
            "actions": [],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating incident: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


# --- Resolve Incident ---

@router.put("/{incident_id}/resolve/")
def resolve_incident(
    request: Request,
    incident_id: UUID,
    resolve: ResolveRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Resolve an incident."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    _require_incident_in_scope(db, tenant_id, current_user, incident_id,
                               "Incident not found or already resolved")  # B2c-2
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
                      action_taken, resolved_at, notes, created_at, updated_at
        """), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Incident not found or already resolved")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="RESOLVE_INCIDENT", resource_type="INCIDENT", resource_id=str(incident_id))
        db.commit()
        return {
            **dict(result),
            "reporter": None, "resolver": {"id": current_user.get("id"), "first_name": current_user.get("first_name"), "last_name": current_user.get("last_name")},
            "parties": _incident_student_ids(db, tenant_id, incident_id),
            "actions": [],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error resolving incident: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")


# --- Assign Incident ---

@router.put("/{incident_id}/assign/")
def assign_incident(
    request: Request,
    incident_id: UUID,
    assign: AssignRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Assign an incident to a resolver.

    DATA-INTEGRITY FIX (institutional-readiness audit, 2026-09):
    resolver_id was written straight into assigned_to with no check it's a
    real user in this tenant — a typo or stray id silently created an
    orphaned assignment with no FK enforcement on this raw-SQL table.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    _require_incident_in_scope(db, tenant_id, current_user, incident_id, "Incident not found")  # B2c-2
    try:
        resolver = db.execute(text(
            "SELECT id FROM users WHERE id = :uid AND tenant_id = :tid"
        ), {"uid": assign.resolver_id, "tid": tenant_id}).first()
        if not resolver:
            raise HTTPException(status_code=404, detail="Resolver introuvable dans cet établissement")
        params = {
            "iid": str(incident_id), "tid": tenant_id,
            "resolver": assign.resolver_id,
        }
        result = db.execute(text("""
            UPDATE incidents SET assigned_to = :resolver, status = 'ASSIGNED', updated_at = NOW()
            WHERE id = :iid AND tenant_id = :tid
            RETURNING id, tenant_id, title, description, incident_type, severity,
                      occurred_at, location, status, reported_by, resolved_by, assigned_to,
                      resolution, action_taken, resolved_at, notes, created_at, updated_at
        """), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Incident not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="ASSIGN_INCIDENT", resource_type="INCIDENT", resource_id=str(incident_id))
        db.commit()
        return {
            **dict(result),
            "reporter": None, "resolver": None,
            "parties": _incident_student_ids(db, tenant_id, incident_id),
            "actions": [],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error assigning incident: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")
