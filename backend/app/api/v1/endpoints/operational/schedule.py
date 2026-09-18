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


def _can_view_roster(db: Session, *, current_user: dict, slot: dict, tenant_id: str) -> bool:
    """Feature (institutional-readiness audit, 2026-09, classroom badge-in):
    a class roster (every enrolled student's name + today's attendance
    status) is sensitive enough to restrict beyond the blanket
    schedule:read permission STUDENT/PARENT also hold for their own
    timetable — only staff/admin, or the slot's own teacher, may see it."""
    roles = set(current_user.get("roles", []))
    privileged = roles & {"SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "TEACHER",
                          "DEPARTMENT_HEAD", "SECRETARY", "STAFF"}
    if not privileged:
        return False
    if "TEACHER" in roles and not (roles & {"SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "DEPARTMENT_HEAD", "SECRETARY", "STAFF"}):
        return slot["teacher_id"] is not None and str(slot["teacher_id"]) == str(current_user.get("id"))
    return True


@router.get("/{slot_id}/roster/")
def get_schedule_slot_roster(
    request: Request,
    slot_id: str,
    on_date: Optional[str] = Query(None, description="Date (YYYY-MM-DD), défaut aujourd'hui"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("schedule:read")),
):
    """The class roster for a schedule slot's course, with each enrolled
    student's attendance status for the given date (defaults to today):
    PRESENT/ABSENT/LATE/EXCUSED if already recorded — including
    automatically, by a student badging in at a room-bound kiosk device
    (see operational/kiosk.py::kiosk_scan) — or PENDING otherwise. This is
    what a teacher opens before or during their course to see who is
    expected and who has actually shown up.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")

    slot = db.execute(text("""
        SELECT s.id, s.class_id, s.subject_id, s.teacher_id, s.day_of_week, s.start_time, s.end_time,
               c.name AS class_name, sub.name AS subject_name
        FROM schedule s
        LEFT JOIN classes c ON c.id = s.class_id
        LEFT JOIN subjects sub ON sub.id = s.subject_id
        WHERE s.id = :slot_id AND s.tenant_id = :tenant_id
    """), {"slot_id": slot_id, "tenant_id": tenant_id}).mappings().first()
    if not slot:
        raise HTTPException(status_code=404, detail="Créneau introuvable")
    if not _can_view_roster(db, current_user=current_user, slot=slot, tenant_id=tenant_id):
        raise HTTPException(status_code=403, detail="Accès non autorisé à la liste de cette classe")

    target_date = on_date or datetime.now().date().isoformat()

    rows = db.execute(text("""
        SELECT st.id AS student_id, st.first_name, st.last_name, st.registration_number,
               a.status AS attendance_status, a.created_at AS recorded_at, a.reason
        FROM enrollments e
        JOIN students st ON st.id = e.student_id
        LEFT JOIN attendance a ON a.student_id = st.id AND a.tenant_id = :tenant_id
            AND a.date = :target_date AND a.subject_id IS NOT DISTINCT FROM :subject_id
        WHERE e.tenant_id = :tenant_id AND e.class_id = :class_id AND e.status = 'ACTIVE'
        ORDER BY st.last_name, st.first_name
    """), {
        "tenant_id": tenant_id, "class_id": slot["class_id"], "subject_id": slot["subject_id"],
        "target_date": target_date,
    }).mappings().all()

    return {
        "slot": {
            "id": str(slot["id"]), "class_name": slot["class_name"], "subject_name": slot["subject_name"],
            "day_of_week": slot["day_of_week"],
            "start_time": slot["start_time"].strftime("%H:%M") if slot["start_time"] else None,
            "end_time": slot["end_time"].strftime("%H:%M") if slot["end_time"] else None,
        },
        "date": target_date,
        "students": [
            {
                "student_id": str(r["student_id"]),
                "first_name": r["first_name"],
                "last_name": r["last_name"],
                "registration_number": r["registration_number"],
                "status": r["attendance_status"] or "PENDING",
                "recorded_at": r["recorded_at"].isoformat() if r["recorded_at"] else None,
                "auto_marked": bool(r["reason"] and "Badge automatique" in r["reason"]),
            }
            for r in rows
        ],
    }
