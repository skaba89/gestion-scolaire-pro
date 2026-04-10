import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models.schedule import ScheduleSlot
from app.utils.audit import log_audit

router = APIRouter()

@router.get("/", response_model=List[dict])
def list_schedule(
    class_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("schedule:read")),
):
    """List schedule slots, optionally filtered by class."""
    tenant_id = current_user.get("tenant_id")
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

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_schedule_slot(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("schedule:write")),
):
    """Create a new schedule slot."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    
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
    slot_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("schedule:write")),
):
    """Update a schedule slot."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")

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
    slot_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("schedule:write")),
):
    """Delete a schedule slot."""
    tenant_id = current_user.get("tenant_id")
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
