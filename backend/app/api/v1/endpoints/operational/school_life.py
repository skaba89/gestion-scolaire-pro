import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime, date, time
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.schemas.school_life import (
    Assessment, AssessmentCreate, AssessmentUpdate,
    Grade, GradeCreate, GradeUpdate,
    Attendance, AttendanceCreate, AttendanceUpdate,
    SchoolEvent, SchoolEventCreate, SchoolEventUpdate,
    StudentCheckIn, StudentCheckInCreate
)
from app.crud import school_life as crud_sl
from app.utils.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()
logger = logging.getLogger(__name__)

# --- Assessments ---

@router.get("/assessments/", response_model=List[Assessment])
def read_assessments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        return crud_sl.get_assessments(db, tenant_id=current_user.get("tenant_id"))
    except Exception as e:
        db.rollback()
        logger.error(f"Error reading assessments: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.post("/assessments/", response_model=Assessment)
def create_assessment(
    *,
    db: Session = Depends(get_db),
    obj_in: AssessmentCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        return crud_sl.create_assessment(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating assessment: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.put("/assessments/{assessment_id}/", response_model=Assessment)
def update_assessment(
    assessment_id: UUID,
    *,
    db: Session = Depends(get_db),
    obj_in: AssessmentUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update a school life assessment."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    result = crud_sl.update_assessment(db, assessment_id=assessment_id, obj_in=obj_in, tenant_id=tenant_id)
    if not result:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result

@router.delete("/assessments/{assessment_id}/")
def delete_assessment(
    assessment_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a school life assessment."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    assessment = crud_sl.get_assessment(db, assessment_id=assessment_id, tenant_id=tenant_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    db.delete(assessment)
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="DELETE_SCHOOL_LIFE_ASSESSMENT", resource_type="ASSESSMENT",
              resource_id=str(assessment_id))
    db.commit()
    return {"status": "success"}

# --- Grades ---

@router.get("/grades/", response_model=List[Grade])
def read_grades(
    student_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        return crud_sl.get_grades(db, tenant_id=current_user.get("tenant_id"), student_id=student_id)
    except Exception as e:
        db.rollback()
        logger.error(f"Error reading grades: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.post("/grades/", response_model=Grade)
def create_grade(
    *,
    db: Session = Depends(get_db),
    obj_in: GradeCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        return crud_sl.create_grade(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating grade: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.put("/grades/{grade_id}/", response_model=Grade)
def update_grade(
    grade_id: UUID,
    *,
    db: Session = Depends(get_db),
    obj_in: GradeUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update a school life grade."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    result = crud_sl.update_grade(db, grade_id=grade_id, obj_in=obj_in, tenant_id=tenant_id)
    if not result:
        raise HTTPException(status_code=404, detail="Grade not found")
    return result

@router.delete("/grades/{grade_id}/")
def delete_grade(
    grade_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a school life grade."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    from app.models import Grade as GradeModel
    grade_obj = db.query(GradeModel).filter(GradeModel.id == grade_id, GradeModel.tenant_id == tenant_id).first()
    if not grade_obj:
        raise HTTPException(status_code=404, detail="Grade not found")
    db.delete(grade_obj)
    log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
              action="DELETE_SCHOOL_LIFE_GRADE", resource_type="GRADE",
              resource_id=str(grade_id))
    db.commit()
    return {"status": "success"}

# --- Attendance ---

@router.get("/attendance/", response_model=List[Attendance])
def read_attendance(
    student_ids: List[UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        return crud_sl.get_attendance(db, tenant_id=current_user.get("tenant_id"), student_ids=student_ids)
    except Exception as e:
        db.rollback()
        logger.error(f"Error reading attendance: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.post("/attendance/", response_model=Attendance)
def create_attendance(
    *,
    db: Session = Depends(get_db),
    obj_in: AttendanceCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        return crud_sl.create_attendance(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating attendance: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.put("/attendance/{attendance_id}/", response_model=Attendance)
def update_attendance(
    attendance_id: UUID,
    *,
    db: Session = Depends(get_db),
    obj_in: AttendanceUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update an attendance record."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        from app.models import Attendance as AttendanceModel
        att = db.query(AttendanceModel).filter(
            AttendanceModel.id == attendance_id,
            AttendanceModel.tenant_id == tenant_id
        ).first()
        if not att:
            raise HTTPException(status_code=404, detail="Attendance record not found")
        update_data = obj_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(att, field, value)
        db.add(att)
        db.commit()
        db.refresh(att)
        return att
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/attendance/{attendance_id}/")
def delete_attendance(
    attendance_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete an attendance record."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        from app.models import Attendance as AttendanceModel
        att = db.query(AttendanceModel).filter(
            AttendanceModel.id == attendance_id,
            AttendanceModel.tenant_id == tenant_id
        ).first()
        if not att:
            raise HTTPException(status_code=404, detail="Attendance record not found")
        db.delete(att)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_ATTENDANCE", resource_type="ATTENDANCE",
                  resource_id=str(attendance_id))
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# --- Events ---

@router.get("/events/", response_model=List[SchoolEvent])
def read_events(
    start_after: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        return crud_sl.get_events(db, tenant_id=current_user.get("tenant_id"), start_after=start_after)
    except Exception as e:
        db.rollback()
        logger.error(f"Error reading events: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.post("/events/", response_model=SchoolEvent)
def create_event(
    *,
    db: Session = Depends(get_db),
    obj_in: SchoolEventCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        return crud_sl.create_event(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating event: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.put("/events/{event_id}/", response_model=SchoolEvent)
def update_event(
    event_id: UUID,
    *,
    db: Session = Depends(get_db),
    obj_in: SchoolEventUpdate,
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a school event."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        event = crud_sl.update_event(db, event_id=event_id, obj_in=obj_in, tenant_id=tenant_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_SCHOOL_EVENT", resource_type="SCHOOL_EVENT",
                  resource_id=str(event_id))
        db.commit()
        db.refresh(event)
        return event
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating school event: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/events/{event_id}/")
def delete_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a school event."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        success = crud_sl.delete_event(db, event_id=event_id, tenant_id=tenant_id)
        if not success:
            raise HTTPException(status_code=404, detail="Event not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_SCHOOL_EVENT", resource_type="SCHOOL_EVENT",
                  resource_id=str(event_id))
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting school event: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# --- Appointment Slots ---

class AppointmentSlotCreate(BaseModel):
    teacher_id: Optional[UUID] = None
    date: str
    start_time: str
    end_time: str
    max_appointments: int = 1
    location: Optional[str] = None
    is_active: bool = True


@router.get("/appointment-slots/")
def list_appointment_slots(
    teacher_id: Optional[str] = None,
    date: Optional[str] = None,
    is_active: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("school_life:read")),
):
    """List appointment slots with pagination and filters."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        conditions = ["tenant_id = :tid"]
        params: Dict[str, Any] = {"tid": tenant_id}
        if teacher_id:
            conditions.append("teacher_id = :teacher_id")
            params["teacher_id"] = teacher_id
        if date:
            conditions.append("date = :slot_date")
            params["slot_date"] = date
        if is_active is not None:
            conditions.append("is_active = :is_active")
            params["is_active"] = is_active

        where = " AND ".join(conditions)
        offset = (page - 1) * page_size

        count_row = db.execute(
            text(f"SELECT COUNT(*) FROM appointment_slots WHERE {where}"), params
        ).scalar()

        rows = db.execute(
            text(f"SELECT * FROM appointment_slots WHERE {where} ORDER BY date, start_time LIMIT :lim OFFSET :off"),
            {**params, "lim": page_size, "off": offset},
        ).fetchall()

        return {
            "items": [dict(r._mapping) for r in rows],
            "total": count_row,
            "page": page,
            "page_size": page_size,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error listing appointment slots: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/appointment-slots/")
def create_appointment_slot(
    *,
    db: Session = Depends(get_db),
    obj_in: AppointmentSlotCreate,
    current_user: dict = Depends(require_permission("school_life:write")),
):
    """Create a new appointment slot."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        slot_id = str(uuid4())
        db.execute(
            text("""
                INSERT INTO appointment_slots (id, tenant_id, teacher_id, date, start_time, end_time,
                    max_appointments, location, is_active)
                VALUES (:id, :tid, :teacher_id, :slot_date, :start_time, :end_time,
                    :max_appointments, :location, :is_active)
            """),
            {
                "id": slot_id,
                "tid": tenant_id,
                "teacher_id": obj_in.teacher_id or current_user.get("id"),
                "slot_date": obj_in.date,
                "start_time": obj_in.start_time,
                "end_time": obj_in.end_time,
                "max_appointments": obj_in.max_appointments,
                "location": obj_in.location,
                "is_active": obj_in.is_active,
            },
        )
        log_audit(
            db, user_id=current_user.get("id"), tenant_id=tenant_id,
            action="CREATE_APPOINTMENT_SLOT", resource_type="APPOINTMENT_SLOT",
            resource_id=slot_id,
        )
        db.commit()
        row = db.execute(
            text("SELECT * FROM appointment_slots WHERE id = :id"), {"id": slot_id}
        ).first()
        return dict(row._mapping) if row else {"id": slot_id}
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating appointment slot: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.delete("/appointment-slots/{slot_id}/")
def delete_appointment_slot(
    slot_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("school_life:write")),
):
    """Delete an appointment slot."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        row = db.execute(
            text("SELECT * FROM appointment_slots WHERE id = :id AND tenant_id = :tid"),
            {"id": slot_id, "tid": tenant_id},
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail="Appointment slot not found")
        db.execute(
            text("DELETE FROM appointment_slots WHERE id = :id AND tenant_id = :tid"),
            {"id": slot_id, "tid": tenant_id},
        )
        log_audit(
            db, user_id=current_user.get("id"), tenant_id=tenant_id,
            action="DELETE_APPOINTMENT_SLOT", resource_type="APPOINTMENT_SLOT",
            resource_id=str(slot_id),
        )
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting appointment slot: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# --- Check-Ins ---

class CheckInSessionCreate(BaseModel):
    classroom_id: Optional[UUID] = None
    notes: Optional[str] = None


@router.get("/check-ins/sessions/")
def list_check_in_sessions(
    teacher_id: Optional[str] = None,
    session_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("school_life:read")),
):
    """List check-in sessions with pagination and filters."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        conditions = ["tenant_id = :tid"]
        params: Dict[str, Any] = {"tid": tenant_id}
        if teacher_id:
            conditions.append("teacher_id = :teacher_id")
            params["teacher_id"] = teacher_id
        if session_date:
            conditions.append("session_date = :session_date")
            params["session_date"] = session_date

        where = " AND ".join(conditions)
        offset = (page - 1) * page_size

        count_row = db.execute(
            text(f"SELECT COUNT(*) FROM check_in_sessions WHERE {where}"), params
        ).scalar()

        rows = db.execute(
            text(f"SELECT * FROM check_in_sessions WHERE {where} ORDER BY session_date DESC, created_at DESC LIMIT :lim OFFSET :off"),
            {**params, "lim": page_size, "off": offset},
        ).fetchall()

        return {
            "items": [dict(r._mapping) for r in rows],
            "total": count_row,
            "page": page,
            "page_size": page_size,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error listing check-in sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/check-ins/sessions/")
def create_check_in_session(
    *,
    db: Session = Depends(get_db),
    obj_in: CheckInSessionCreate,
    current_user: dict = Depends(require_permission("school_life:write")),
):
    """Start a new check-in session."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        session_id = str(uuid4())
        db.execute(
            text("""
                INSERT INTO check_in_sessions (id, tenant_id, teacher_id, classroom_id, status, notes)
                VALUES (:id, :tid, :teacher_id, :classroom_id, 'ACTIVE', :notes)
            """),
            {
                "id": session_id,
                "tid": tenant_id,
                "teacher_id": current_user.get("id"),
                "classroom_id": obj_in.classroom_id,
                "notes": obj_in.notes,
            },
        )
        log_audit(
            db, user_id=current_user.get("id"), tenant_id=tenant_id,
            action="CREATE_CHECK_IN_SESSION", resource_type="CHECK_IN_SESSION",
            resource_id=session_id,
        )
        db.commit()
        row = db.execute(
            text("SELECT * FROM check_in_sessions WHERE id = :id"), {"id": session_id}
        ).first()
        return dict(row._mapping) if row else {"id": session_id}
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating check-in session: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.get("/check-ins/assignments/")
def list_check_in_assignments(
    session_id: Optional[str] = None,
    student_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("school_life:read")),
):
    """List check-in assignments with pagination and filters."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        conditions = ["ca.tenant_id = :tid"]
        params: Dict[str, Any] = {"tid": tenant_id}
        if session_id:
            conditions.append("ca.session_id = :session_id")
            params["session_id"] = session_id
        if student_id:
            conditions.append("ca.student_id = :student_id")
            params["student_id"] = student_id
        if status:
            conditions.append("ca.status = :status")
            params["status"] = status

        where = " AND ".join(conditions)
        offset = (page - 1) * page_size

        count_row = db.execute(
            text(f"SELECT COUNT(*) FROM check_in_assignments ca WHERE {where}"), params
        ).scalar()

        rows = db.execute(
            text(f"""
                SELECT ca.*, s.first_name, s.last_name, s.registration_number
                FROM check_in_assignments ca
                LEFT JOIN students s ON s.id = ca.student_id
                WHERE {where}
                ORDER BY ca.created_at DESC
                LIMIT :lim OFFSET :off
            """),
            {**params, "lim": page_size, "off": offset},
        ).fetchall()

        items = []
        for r in rows:
            item = dict(r._mapping)
            item["student"] = {
                "id": r.student_id,
                "first_name": r.first_name,
                "last_name": r.last_name,
                "registration_number": r.registration_number,
            } if r.student_id else None
            items.append(item)

        return {
            "items": items,
            "total": count_row,
            "page": page,
            "page_size": page_size,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error listing check-in assignments: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.get("/check-ins/", response_model=List[StudentCheckIn])
def read_check_ins(
    student_ids: List[UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        return crud_sl.get_check_ins(db, tenant_id=current_user.get("tenant_id"), student_ids=student_ids)
    except Exception as e:
        db.rollback()
        logger.error(f"Error reading check-ins: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.post("/check-ins/", response_model=StudentCheckIn)
def create_check_in(
    *,
    db: Session = Depends(get_db),
    obj_in: StudentCheckInCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        return crud_sl.create_check_in(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating check-in: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# --- Badges ---

@router.get("/badges/")
def list_badges(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []
        from sqlalchemy import text
        rows = db.execute(text("""
            SELECT b.*, s.first_name, s.last_name, s.registration_number, s.photo_url
            FROM student_badges b
            JOIN students s ON s.id = b.student_id
            WHERE b.tenant_id = :tid
            ORDER BY b.issued_at DESC
        """), {"tid": tenant_id}).fetchall()
        return [{
            **dict(r._mapping),
            "student": {"id": r.student_id, "first_name": r.first_name, "last_name": r.last_name, "registration_number": r.registration_number, "photo_url": r.photo_url}
        } for r in rows]
    except Exception as e:
        db.rollback()
        logger.error(f"Error listing badges: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.get("/students-without-badges/")
def students_without_badges(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []
        from sqlalchemy import text
        rows = db.execute(text("""
            SELECT id, first_name, last_name, registration_number
            FROM students
            WHERE tenant_id = :tid 
              AND is_archived = false
              AND id NOT IN (SELECT student_id FROM student_badges WHERE tenant_id = :tid AND status = 'ACTIVE')
            ORDER BY last_name, first_name
        """), {"tid": tenant_id}).mappings().all()
        return rows
    except Exception as e:
        db.rollback()
        logger.error(f"Error listing students without badges: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.get("/event-registrations/")
def list_event_registrations(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []
        from sqlalchemy import text
        return db.execute(text("SELECT event_id, id FROM career_event_registrations WHERE tenant_id = :tid"), {"tid": tenant_id}).mappings().all()
    except Exception as e:
        db.rollback()
        logger.error(f"Error listing event registrations: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.get("/gamification/stats/")
def get_gamification_stats(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return {"totalPoints": 0, "totalAchievements": 0, "totalStudents": 0}
        from sqlalchemy import text
        row = db.execute(text("""
            SELECT 
                COUNT(*) as total_badges,
                COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_badges,
                COUNT(DISTINCT badge_type) as types
            FROM student_badges
            WHERE tenant_id = :tid
        """), {"tid": tenant_id}).mappings().first()
        return {
            "totalPoints": 0, # Placeholder
            "totalAchievements": row["total_badges"],
            "totalStudents": 0 # Placeholder
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error getting gamification stats: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")
