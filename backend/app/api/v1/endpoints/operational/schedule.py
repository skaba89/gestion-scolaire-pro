import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.models.schedule import ScheduleSlot
from app.utils.audit import log_audit

router = APIRouter()

@router.get("/", response_model=List[dict])
def list_schedule(
    request: Request,
    class_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("schedule:read")),
):
    """List schedule slots, optionally filtered by class."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        return []
    
    where_clauses = ["s.tenant_id = :tenant_id"]
    params = {"tenant_id": tenant_id}
    
    if class_id and class_id != "none":
        where_clauses.append("s.class_id = :class_id")
        params["class_id"] = class_id
        
    where_sql = " AND ".join(where_clauses)
    sql = text(f"""
        SELECT 
            s.*,
            sub.name as subject_name,
            r.name as room_name,
            u.first_name as teacher_first_name,
            u.last_name as teacher_last_name
        FROM schedule s
        LEFT JOIN subjects sub ON sub.id = s.subject_id
        LEFT JOIN rooms r ON r.id = s.room_id
        LEFT JOIN users u ON u.id = s.teacher_id
        WHERE {where_sql}
        ORDER BY s.day_of_week, s.start_time
    """)
    
    rows = db.execute(sql, params).fetchall()
    
    return [
        {
            **dict(r._mapping),
            "subject": {"name": r.subject_name} if r.subject_name else None,
            "room": {"name": r.room_name} if r.room_name else None,
            "teacher": {"first_name": r.teacher_first_name, "last_name": r.teacher_last_name} if r.teacher_first_name else None,
            "start_time": r.start_time.strftime("%H:%M") if r.start_time else None,
            "end_time": r.end_time.strftime("%H:%M") if r.end_time else None,
        }
        for r in rows
    ]

def _find_schedule_conflict(
    db: Session, *, tenant_id: str, day_of_week, start_time, end_time,
    teacher_id=None, room_id=None, class_id=None, exclude_slot_id=None,
) -> Optional[dict]:
    """Whether another slot overlaps this one for the same teacher, room,
    or class on the same day. Two ranges overlap iff start < other.end AND
    end > other.start (touching edges, e.g. 10:00-11:00 then 11:00-12:00,
    is not a conflict).
    """
    if day_of_week is None or start_time is None or end_time is None:
        return None
    conds = ["s.tenant_id = :tenant_id", "s.day_of_week = :day_of_week",
             "s.start_time < :end_time", "s.end_time > :start_time"]
    params = {"tenant_id": tenant_id, "day_of_week": day_of_week,
              "start_time": start_time, "end_time": end_time}
    scope = []
    if teacher_id:
        scope.append("s.teacher_id = :teacher_id")
        params["teacher_id"] = teacher_id
    if room_id:
        scope.append("s.room_id = :room_id")
        params["room_id"] = room_id
    if class_id:
        scope.append("s.class_id = :class_id")
        params["class_id"] = class_id
    if not scope:
        return None
    conds.append(f"({' OR '.join(scope)})")
    if exclude_slot_id:
        conds.append("s.id != :exclude_id")
        params["exclude_id"] = exclude_slot_id
    row = db.execute(text(f"""
        SELECT s.id, s.teacher_id, s.room_id, s.class_id FROM schedule s
        WHERE {' AND '.join(conds)}
        LIMIT 1
    """), params).mappings().first()
    return dict(row) if row else None


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_schedule_slot(
    request: Request,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("schedule:write")),
):
    """Create a new schedule slot.

    BUSINESS-RULE FIX (institutional-readiness audit, 2026-09): nothing
    prevented double-booking — the same teacher, room, or class could be
    given two overlapping slots on the same day, silently. This is the
    exact timetable an inspector would review.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")

    conflict = _find_schedule_conflict(
        db, tenant_id=tenant_id,
        day_of_week=payload.get("day_of_week"),
        start_time=payload.get("start_time"), end_time=payload.get("end_time"),
        teacher_id=payload.get("teacher_id"), room_id=payload.get("room_id"),
        class_id=payload.get("class_id"),
    )
    if conflict:
        raise HTTPException(status_code=409, detail="Ce créneau chevauche un cours existant (enseignant, salle ou classe déjà occupé)")

    new_id = str(uuid.uuid4())
    sql = text("""
        INSERT INTO schedule (id, tenant_id, class_id, subject_id, teacher_id, day_of_week, start_time, end_time, room_id, created_at, updated_at)
        VALUES (:id, :tenant_id, :class_id, :subject_id, :teacher_id, :day_of_week, :start_time, :end_time, :room_id, NOW(), NOW())
    """)

    db.execute(sql, {
        "id": new_id,
        "tenant_id": tenant_id,
        "class_id": payload.get("class_id"),
        "subject_id": payload.get("subject_id"),
        "teacher_id": payload.get("teacher_id"),
        "day_of_week": payload.get("day_of_week"),
        "start_time": payload.get("start_time"),
        "end_time": payload.get("end_time"),
        "room_id": payload.get("room_id"),
    })
    db.commit()

    return {"id": new_id}

@router.put("/{slot_id}/")
def update_schedule_slot(
    request: Request,
    slot_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("schedule:write")),
):
    """Update a schedule slot.

    BUSINESS-RULE FIX (institutional-readiness audit, 2026-09): same
    missing double-booking check as create_schedule_slot() — moving a
    slot's time/teacher/room/class could silently create an overlap.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")

    existing = db.execute(text("""
        SELECT day_of_week, start_time, end_time, teacher_id, room_id, class_id
        FROM schedule WHERE id = :slot_id AND tenant_id = :tenant_id
    """), {"slot_id": slot_id, "tenant_id": tenant_id}).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Slot not found")

    sets = []
    params = {"slot_id": slot_id, "tenant_id": tenant_id}

    field_map = {
        "class_id": payload.get("class_id"),
        "subject_id": payload.get("subject_id"),
        "teacher_id": payload.get("teacher_id"),
        "day_of_week": payload.get("day_of_week"),
        "start_time": payload.get("start_time"),
        "end_time": payload.get("end_time"),
        "room_id": payload.get("room_id"),
    }

    for col, val in field_map.items():
        if val is not None:
            sets.append(f"{col} = :{col}")
            params[col] = val

    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")

    conflict = _find_schedule_conflict(
        db, tenant_id=tenant_id,
        day_of_week=field_map["day_of_week"] if field_map["day_of_week"] is not None else existing["day_of_week"],
        start_time=field_map["start_time"] or existing["start_time"],
        end_time=field_map["end_time"] or existing["end_time"],
        teacher_id=field_map["teacher_id"] if field_map["teacher_id"] is not None else existing["teacher_id"],
        room_id=field_map["room_id"] if field_map["room_id"] is not None else existing["room_id"],
        class_id=field_map["class_id"] if field_map["class_id"] is not None else existing["class_id"],
        exclude_slot_id=slot_id,
    )
    if conflict:
        raise HTTPException(status_code=409, detail="Ce créneau chevauche un cours existant (enseignant, salle ou classe déjà occupé)")

    sets.append("updated_at = NOW()")
    query_str = f"""
        UPDATE schedule SET {', '.join(sets)}
        WHERE id = :slot_id AND tenant_id = :tenant_id
        RETURNING id, tenant_id, class_id, subject_id, teacher_id, day_of_week, start_time, end_time, room_id
    """

    try:
        result = db.execute(text(query_str), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Slot not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_SCHEDULE_SLOT", resource_type="SCHEDULE", resource_id=slot_id)
        db.commit()
        return {
            **dict(result),
            "start_time": result["start_time"].strftime("%H:%M") if result["start_time"] else None,
            "end_time": result["end_time"].strftime("%H:%M") if result["end_time"] else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to update schedule slot: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")

@router.delete("/{slot_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule_slot(
    request: Request,
    slot_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("schedule:write")),
):
    """Delete a schedule slot."""
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")

    result = db.execute(
        text("DELETE FROM schedule WHERE id = :slot_id AND tenant_id = :tenant_id"),
        {"slot_id": slot_id, "tenant_id": tenant_id}
    )

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Slot not found")

    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="DELETE_SCHEDULE_SLOT", resource_type="SCHEDULE", resource_id=slot_id)
    db.commit()

    return None
