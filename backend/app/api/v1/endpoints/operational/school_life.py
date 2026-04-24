import logging
import base64
import html as html_mod
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any, Tuple
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
        logger.error("Error reading assessments: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")

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
        logger.error("Error creating assessment: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create resource. Please check your input and try again.")

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
        logger.error("Error reading grades: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")

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
        logger.error("Error creating grade: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create resource. Please check your input and try again.")

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
        logger.error("Error reading attendance: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")

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
        logger.error("Error creating attendance: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create resource. Please check your input and try again.")

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
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")

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
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")

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
        logger.error("Error reading events: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

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
        logger.error("Error creating event: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

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
        logger.error("Error updating school event: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")

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
        logger.error("Error deleting school event: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")

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
        # SECURITY: WHERE clauses built from developer-controlled literals, not user-supplied SQL.
        # All filter values are passed as bound parameters (safe from injection).
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
        logger.error("Error listing appointment slots: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


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
        logger.error("Error creating appointment slot: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


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
        logger.error("Error deleting appointment slot: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


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
        # SECURITY: WHERE clauses built from developer-controlled literals, not user-supplied SQL.
        # All filter values are passed as bound parameters (safe from injection).
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
        logger.error("Error listing check-in sessions: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


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
        logger.error("Error creating check-in session: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


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
        # SECURITY: Filter values are whitelisted to prevent SQL injection.
        # All column literals are developer-controlled; user values use bound params.
        ALLOWED_ASSIGNMENT_STATUSES = {"PENDING", "COMPLETED", "SKIPPED", "ABSENT"}
        conditions = ["ca.tenant_id = :tid"]
        params: Dict[str, Any] = {"tid": tenant_id}
        if session_id:
            conditions.append("ca.session_id = :session_id")
            params["session_id"] = session_id
        if student_id:
            conditions.append("ca.student_id = :student_id")
            params["student_id"] = student_id
        if status:
            # SECURITY: Validate status against whitelist to prevent invalid values
            if status not in ALLOWED_ASSIGNMENT_STATUSES:
                raise HTTPException(400, detail=f"Invalid filter value: {status}")
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
        logger.error("Error listing check-in assignments: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


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
        logger.error("Error reading check-ins: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

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
        logger.error("Error creating check-in: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

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
        logger.error("Error listing badges: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

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
        logger.error("Error listing students without badges: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.get("/event-registrations/")
def list_event_registrations(
    student_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return []
        params: dict = {"tid": tenant_id}
        where = "WHERE tenant_id = :tid"
        if student_id:
            where += " AND student_id = :student_id"
            params["student_id"] = student_id
        rows = db.execute(text(
            f"SELECT event_id, id, student_id, registered_at FROM career_event_registrations {where} ORDER BY registered_at DESC"
        ), params).mappings().all()
        return [dict(r) for r in rows]
    except Exception as e:
        db.rollback()
        logger.error("Error listing event registrations: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


class EventRegistrationCreate(BaseModel):
    event_id: str
    student_id: Optional[str] = None
    alumni_id: Optional[str] = None


@router.post("/event-registrations/", status_code=201)
def create_event_registration(
    payload: EventRegistrationCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=400, detail="tenant_id required")
        new_id = str(uuid4())
        db.execute(text("""
            INSERT INTO career_event_registrations
                (id, tenant_id, event_id, student_id, alumni_id)
            VALUES (:id, :tenant_id, :event_id, :student_id, :alumni_id)
            ON CONFLICT DO NOTHING
        """), {
            "id": new_id,
            "tenant_id": tenant_id,
            "event_id": payload.event_id,
            "student_id": payload.student_id,
            "alumni_id": payload.alumni_id,
        })
        db.commit()
        return {"id": new_id, "event_id": payload.event_id, "student_id": payload.student_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error creating event registration: %s", e)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

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
        logger.error("Error getting gamification stats: %s", e)
        logger.error("Operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")


# ─── Bulletin de notes — Format officiel Guinée ───────────────────────────────

# ── Pydantic models for smart v2 endpoint ─────────────────────────────────────

class SmartReportCardRequest(BaseModel):
    """Single student bulletin — all data fetched from DB."""
    student_id: str
    term_id: str
    classroom_id: str
    director_comment: Optional[str] = None
    decision: Optional[str] = None          # "Passage", "Redoublement", "Félicitations"
    show_guinea_header: bool = True          # République de Guinée header

class SmartBatchRequest(BaseModel):
    """Batch bulletin for all students in a class."""
    classroom_id: str
    term_id: str
    director_comment: Optional[str] = None
    decision: Optional[str] = None
    show_guinea_header: bool = True


# ── Helpers ────────────────────────────────────────────────────────────────────

def _grade_mention_v2(avg: float) -> str:
    if avg >= 18: return "Excellent"
    if avg >= 16: return "Très Bien"
    if avg >= 14: return "Bien"
    if avg >= 12: return "Assez Bien"
    if avg >= 10: return "Passable"
    return "Insuffisant"

def _grade_color_v2(avg: float) -> str:
    if avg >= 14: return "#166534"   # green-800
    if avg >= 10: return "#1d4ed8"   # blue-700
    if avg >= 8:  return "#92400e"   # amber-800
    return "#991b1b"                 # red-800

def _mention_bg(avg: float) -> str:
    if avg >= 14: return "#dcfce7"
    if avg >= 10: return "#dbeafe"
    if avg >= 8:  return "#fef3c7"
    return "#fee2e2"


def _fetch_student_data(db, student_id: str, tenant_id: str) -> dict:
    """Fetch all data needed for one bulletin from the DB."""
    esc = html_mod.escape

    # Student
    s_row = db.execute(text("""
        SELECT first_name, last_name, registration_number,
               date_of_birth, gender
        FROM students WHERE id = :sid AND tenant_id = :tid
    """), {"sid": student_id, "tid": tenant_id}).mappings().first()

    # Tenant
    t_row = db.execute(text("""
        SELECT name, address, phone, email, settings
        FROM tenants WHERE id = :tid
    """), {"tid": tenant_id}).mappings().first()

    return {"student": s_row, "tenant": t_row}


def _fetch_grades_for_term(db, student_id: str, term_id: str, tenant_id: str) -> list:
    """Return list of {subject_name, coefficient, score, max_score, comments}."""
    rows = db.execute(text("""
        SELECT
            COALESCE(subj.name, 'Matière inconnue') AS subject_name,
            COALESCE(subj.coefficient, g.coefficient, 1.0) AS coefficient,
            g.score,
            g.max_score,
            g.comments
        FROM grades g
        JOIN assessments a ON g.assessment_id = a.id
        LEFT JOIN subjects subj ON a.subject_id = subj.id
        WHERE g.student_id    = :sid
          AND g.tenant_id     = :tid
          AND a.term_id       = :term_id
        ORDER BY subj.name
    """), {"sid": student_id, "tid": tenant_id, "term_id": term_id}).mappings().all()
    return [dict(r) for r in rows]


def _fetch_absences(db, student_id: str, start_date, end_date, tenant_id: str) -> dict:
    """Return {excused, absent, late} counts for the term."""
    row = db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE status = 'EXCUSED') AS excused,
            COUNT(*) FILTER (WHERE status = 'ABSENT')  AS absent,
            COUNT(*) FILTER (WHERE status = 'LATE')    AS late
        FROM attendance
        WHERE student_id = :sid
          AND tenant_id  = :tid
          AND date BETWEEN :sd AND :ed
    """), {"sid": student_id, "tid": tenant_id, "sd": start_date, "ed": end_date}).mappings().first()
    if not row:
        return {"excused": 0, "absent": 0, "late": 0}
    return {"excused": int(row["excused"] or 0), "absent": int(row["absent"] or 0), "late": int(row["late"] or 0)}


def _compute_average(grades: list) -> float:
    """Weighted average /20 across subjects (group by subject, then weight by coeff)."""
    by_subject: Dict[str, Dict] = {}
    for g in grades:
        name = g["subject_name"]
        score = g.get("score")
        max_s = float(g.get("max_score") or 20)
        coeff = float(g.get("coefficient") or 1)
        if name not in by_subject:
            by_subject[name] = {"scores": [], "coefficient": coeff}
        if score is not None:
            by_subject[name]["scores"].append((float(score), max_s))

    total_weighted = 0.0
    total_coeff = 0.0
    for subj, data in by_subject.items():
        scores = data["scores"]
        coeff = data["coefficient"]
        if scores:
            subj_avg = sum(s / m * 20 for s, m in scores) / len(scores)
            total_weighted += subj_avg * coeff
            total_coeff += coeff

    if total_coeff == 0:
        return -1.0
    return total_weighted / total_coeff


def _compute_class_rank(db, classroom_id: str, term_id: str, tenant_id: str, student_id: str) -> Tuple[int, int]:
    """Return (rank, total) for the student in this class/term. rank=0 if not computable."""
    try:
        rows = db.execute(text("""
            SELECT
                e.student_id,
                CASE WHEN SUM(COALESCE(subj.coefficient, g.coefficient, 1)) > 0
                     THEN SUM((g.score::float / NULLIF(g.max_score,0)) * 20
                              * COALESCE(subj.coefficient, g.coefficient, 1))
                          / SUM(COALESCE(subj.coefficient, g.coefficient, 1))
                     ELSE -1
                END AS avg
            FROM enrollments e
            LEFT JOIN grades g
                ON g.student_id = e.student_id AND g.tenant_id = :tid
            LEFT JOIN assessments a
                ON g.assessment_id = a.id AND a.term_id = :term_id
            LEFT JOIN subjects subj ON a.subject_id = subj.id
            WHERE e.class_id   = :cid
              AND e.tenant_id  = :tid
              AND e.status     = 'ACTIVE'
            GROUP BY e.student_id
            ORDER BY avg DESC NULLS LAST
        """), {"cid": classroom_id, "tid": tenant_id, "term_id": term_id}).mappings().all()

        total = len(rows)
        for idx, r in enumerate(rows, 1):
            if str(r["student_id"]) == str(student_id):
                return idx, total
        return 0, total
    except Exception as exc:
        logger.warning("Class rank computation failed: %s", exc)
        return 0, 0


# ── HTML template v2 — Format officiel Guinée ──────────────────────────────────

def _build_bulletin_v2(
    *,
    # Tenant
    school_name: str,
    school_address: str = "",
    school_phone: str = "",
    school_email: str = "",
    school_logo_url: str = "",
    # Student
    student_name: str,
    registration_number: str = "",
    date_of_birth: str = "",
    gender: str = "",
    # Academic context
    classroom: str = "",
    level: str = "",
    term: str = "",
    academic_year: str = "",
    # Grades
    grades: list = None,
    # Computed stats
    general_average: float = -1.0,
    class_rank: int = 0,
    class_total: int = 0,
    # Absences
    absences_excused: int = 0,
    absences_absent: int = 0,
    absences_late: int = 0,
    # Council decision
    director_comment: str = "",
    decision: str = "",
    show_guinea_header: bool = True,
) -> str:
    """Generate a professional A4 bulletin in the official Guinea MEN format."""

    esc = html_mod.escape
    grades = grades or []
    now_str = datetime.now().strftime("%d/%m/%Y")

    # ── Subject rows ──────────────────────────────────────────────────────────
    by_subject: Dict[str, Dict] = {}
    for g in grades:
        name = esc(str(g.get("subject_name", "Matière inconnue")))
        score = g.get("score")
        max_s = float(g.get("max_score") or 20)
        coeff = float(g.get("coefficient") or 1)
        if name not in by_subject:
            by_subject[name] = {"scores": [], "coefficient": coeff, "max_score": max_s}
        if score is not None:
            by_subject[name]["scores"].append((float(score), max_s))

    subject_rows_html = ""
    for subj_name, data in by_subject.items():
        scores = data["scores"]
        coeff = data["coefficient"]
        max_s = data["max_score"]
        if scores:
            subj_avg = sum(s / m * 20 for s, m in scores) / len(scores)
            avg_str = f"{subj_avg:.2f}"
            color = _grade_color_v2(subj_avg)
            appre = _grade_mention_v2(subj_avg)
        else:
            subj_avg = -1
            avg_str = "—"
            color = "#9ca3af"
            appre = "—"
        subject_rows_html += f"""
        <tr>
          <td class="td-left">{subj_name}</td>
          <td class="td-center">{coeff:.0f}</td>
          <td class="td-center bold" style="color:{color};">{avg_str}<span style="color:#6b7280;font-weight:400;">/20</span></td>
          <td class="td-center small" style="color:{color};">{appre}</td>
        </tr>"""

    if not subject_rows_html:
        subject_rows_html = '<tr><td colspan="4" class="td-center" style="color:#9ca3af;padding:16px;">Aucune note disponible pour cette période</td></tr>'

    # ── Average & mention ──────────────────────────────────────────────────────
    if general_average >= 0:
        avg_display = f"{general_average:.2f}/20"
        mention = _grade_mention_v2(general_average)
        avg_color = _grade_color_v2(general_average)
        mention_bg = _mention_bg(general_average)
        avg_color_text = "#fff" if general_average < 10 or general_average >= 14 else "#1e3a8a"
        avg_box_bg = avg_color
    else:
        avg_display = "—"
        mention = "—"
        avg_color = "#6b7280"
        mention_bg = "#f3f4f6"
        avg_box_bg = "#6b7280"

    # ── Rank display ──────────────────────────────────────────────────────────
    rank_html = f"{class_rank}<sup>e</sup>/{class_total}" if class_rank > 0 and class_total > 0 else "—"

    # ── Absences display ──────────────────────────────────────────────────────
    total_absences = absences_absent + absences_excused
    absences_html = f"{absences_absent} abs. injust. · {absences_excused} abs. just. · {absences_late} retard(s)" \
                    if total_absences > 0 or absences_late > 0 else "Aucune absence enregistrée"

    # ── Guinea republic header ────────────────────────────────────────────────
    guinea_header_html = ""
    if show_guinea_header:
        guinea_header_html = """
        <div class="guinea-header">
          <div class="guinea-left">
            <div class="guinea-title">RÉPUBLIQUE DE GUINÉE</div>
            <div class="guinea-subtitle">Travail · Justice · Solidarité</div>
          </div>
          <div class="guinea-center">
            <div class="guinea-ministry">Ministère de l'Éducation Nationale</div>
            <div class="guinea-ministry-sub">de l'Enseignement Technique et de la Formation Professionnelle</div>
          </div>
          <div class="guinea-right">
            <div class="guinea-title">ANNÉE SCOLAIRE</div>
            <div class="guinea-subtitle" style="font-size:13px;font-weight:700;">{year}</div>
          </div>
        </div>""".format(year=esc(academic_year) if academic_year else "——")

    # ── Logo ──────────────────────────────────────────────────────────────────
    logo_html = f'<img src="{esc(school_logo_url)}" alt="Logo" class="logo-img" />' \
                if school_logo_url else \
                '<div class="logo-placeholder">🏫</div>'

    # ── School info ───────────────────────────────────────────────────────────
    school_info_lines = []
    if school_address: school_info_lines.append(esc(school_address))
    if school_phone:   school_info_lines.append(f"Tél : {esc(school_phone)}")
    if school_email:   school_info_lines.append(esc(school_email))
    school_contact_html = " &nbsp;|&nbsp; ".join(school_info_lines)

    # ── Gender display ────────────────────────────────────────────────────────
    gender_display = {"M": "Masculin", "F": "Féminin", "MALE": "Masculin", "FEMALE": "Féminin"}.get(
        str(gender).upper(), esc(gender) if gender else "—"
    )

    # ── Decision ──────────────────────────────────────────────────────────────
    decision_display = esc(decision) if decision else "À déterminer par le conseil de classe"
    decision_color = {
        "Passage": "#166534",
        "Redoublement": "#991b1b",
        "Félicitations": "#1d4ed8",
        "Encouragements": "#0369a1",
        "Avertissement": "#92400e",
    }.get(decision, "#374151")

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Bulletin — {esc(student_name)} — {esc(term or "Période")}</title>
<style>
  /* ── Reset & base ───────────────────────────────────────────────── */
  @page {{ size: A4 portrait; margin: 12mm 14mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: "Arial", "Helvetica", sans-serif; font-size: 12px;
          color: #111; background: #fff; }}
  .page {{ max-width: 794px; margin: 0 auto; }}

  /* ── Guinea republic header ─────────────────────────────────────── */
  .guinea-header {{
    display: flex; align-items: flex-start; justify-content: space-between;
    background: #f0f9ff; border: 1px solid #bae6fd;
    padding: 6px 12px; border-radius: 6px; margin-bottom: 10px;
    gap: 8px;
  }}
  .guinea-left, .guinea-right {{ min-width: 130px; }}
  .guinea-center {{ flex: 1; text-align: center; }}
  .guinea-title {{ font-size: 11px; font-weight: 800; text-transform: uppercase;
                   color: #0c4a6e; letter-spacing: 0.5px; }}
  .guinea-subtitle {{ font-size: 10px; color: #075985; margin-top: 2px; font-style: italic; }}
  .guinea-ministry {{ font-size: 11px; font-weight: 700; color: #0c4a6e; }}
  .guinea-ministry-sub {{ font-size: 9px; color: #0369a1; margin-top: 2px; }}
  .guinea-right {{ text-align: right; }}

  /* ── School header ──────────────────────────────────────────────── */
  .school-header {{
    display: flex; align-items: center; gap: 14px;
    padding: 10px 0 10px; border-bottom: 3px solid #1e40af;
    margin-bottom: 10px;
  }}
  .logo-img {{ height: 64px; width: auto; object-fit: contain; }}
  .logo-placeholder {{ font-size: 40px; line-height: 1; }}
  .school-info {{ flex: 1; }}
  .school-name {{ font-size: 17px; font-weight: 900; color: #1e3a8a;
                  text-transform: uppercase; letter-spacing: 0.5px; }}
  .school-contact {{ font-size: 10px; color: #6b7280; margin-top: 3px; }}

  /* ── Document title ─────────────────────────────────────────────── */
  .doc-title {{
    text-align: center; margin: 10px 0;
    padding: 7px 0;
    background: #1e3a8a; color: #fff; border-radius: 6px;
  }}
  .doc-title h2 {{ font-size: 14px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }}
  .doc-title p  {{ font-size: 11px; margin-top: 2px; opacity: .85; }}

  /* ── Student info grid ──────────────────────────────────────────── */
  .info-grid {{
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
    margin-bottom: 10px;
    background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 8px;
    padding: 10px;
  }}
  .info-item {{ display: flex; flex-direction: column; gap: 2px; }}
  .info-label {{ font-size: 9px; font-weight: 700; color: #3b82f6;
                 text-transform: uppercase; letter-spacing: 0.4px; }}
  .info-value {{ font-size: 12px; font-weight: 600; color: #111; }}

  /* ── Grades table ───────────────────────────────────────────────── */
  .grades-table {{ width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 12px; }}
  .grades-table thead tr {{ background: #1e3a8a; color: #fff; }}
  .grades-table thead th {{ padding: 8px 10px; font-size: 11px; font-weight: 700; }}
  .grades-table tbody tr:nth-child(even) {{ background: #f8fafc; }}
  .grades-table tbody tr:hover {{ background: #eff6ff; }}
  .td-left   {{ padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; }}
  .td-center {{ padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; }}
  .bold {{ font-weight: 700; }}
  .small {{ font-size: 11px; }}

  /* ── Stats row ──────────────────────────────────────────────────── */
  .stats-row {{
    display: grid; grid-template-columns: 2fr 1fr 1fr;
    gap: 8px; margin-bottom: 10px;
  }}
  .stat-box {{
    border-radius: 8px; padding: 10px 14px;
    display: flex; flex-direction: column; align-items: center;
    gap: 4px;
  }}
  .stat-label {{ font-size: 10px; font-weight: 700; text-transform: uppercase;
                 letter-spacing: 0.5px; }}
  .stat-value {{ font-size: 22px; font-weight: 900; line-height: 1; }}
  .stat-sub   {{ font-size: 11px; font-weight: 600; opacity: .85; }}

  /* ── Absences banner ────────────────────────────────────────────── */
  .absences-box {{
    background: #fff7ed; border: 1px solid #fed7aa;
    border-radius: 6px; padding: 8px 14px;
    margin-bottom: 10px; display: flex; align-items: center; gap: 10px;
  }}
  .absences-icon {{ font-size: 16px; }}
  .absences-label {{ font-size: 10px; font-weight: 700; color: #9a3412;
                     text-transform: uppercase; }}
  .absences-value {{ font-size: 12px; color: #7c2d12; }}

  /* ── Decision & appreciation ────────────────────────────────────── */
  .council-grid {{
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 8px; margin-bottom: 10px;
  }}
  .council-box {{
    border: 1px solid #d1d5db; border-radius: 6px; padding: 10px;
    min-height: 70px;
  }}
  .council-title {{ font-size: 10px; font-weight: 700; color: #6b7280;
                    text-transform: uppercase; margin-bottom: 6px; }}
  .council-content {{ font-size: 12px; color: #111; font-weight: 600; }}

  /* ── Signature zone ─────────────────────────────────────────────── */
  .sig-grid {{
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 10px; margin-bottom: 14px;
  }}
  .sig-box {{
    border: 1px solid #d1d5db; border-radius: 6px;
    padding: 10px; min-height: 80px; text-align: center;
  }}
  .sig-title {{ font-size: 10px; font-weight: 700; color: #6b7280;
                text-transform: uppercase; margin-bottom: 4px; }}
  .sig-hint {{ font-size: 9px; color: #9ca3af; margin-top: 6px; }}

  /* ── Footer ─────────────────────────────────────────────────────── */
  .footer {{
    border-top: 1px solid #e5e7eb; padding-top: 6px;
    font-size: 9px; color: #9ca3af; text-align: center;
  }}

  /* ── Print button ───────────────────────────────────────────────── */
  .print-bar {{
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #1e40af; padding: 10px;
    text-align: center; z-index: 9999;
  }}
  .print-btn {{
    background: #fff; color: #1e40af; border: none;
    padding: 8px 28px; border-radius: 6px; font-size: 14px;
    font-weight: 700; cursor: pointer; margin: 0 6px;
  }}
  .download-btn {{
    background: transparent; color: #fff; border: 1px solid #93c5fd;
    padding: 8px 20px; border-radius: 6px; font-size: 13px;
    font-weight: 600; cursor: pointer; margin: 0 6px;
  }}

  @media print {{
    body {{ print-color-adjust: exact; -webkit-print-color-adjust: exact; }}
    .no-print {{ display: none !important; }}
    .print-bar {{ display: none !important; }}
    .page {{ margin-bottom: 0; }}
  }}
</style>
</head>
<body>
<div class="page">

  {guinea_header_html}

  <!-- School header -->
  <div class="school-header">
    <div>{logo_html}</div>
    <div class="school-info">
      <div class="school-name">{esc(school_name)}</div>
      <div class="school-contact">{school_contact_html}</div>
    </div>
  </div>

  <!-- Document title -->
  <div class="doc-title">
    <h2>Bulletin Officiel de Notes</h2>
    <p>{esc(term or "Période")} &nbsp;·&nbsp; Année scolaire {esc(academic_year or "——")}</p>
  </div>

  <!-- Student info -->
  <div class="info-grid">
    <div class="info-item">
      <span class="info-label">Nom &amp; Prénom</span>
      <span class="info-value">{esc(student_name)}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Matricule</span>
      <span class="info-value">{esc(registration_number or "—")}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Date de naissance</span>
      <span class="info-value">{esc(date_of_birth or "—")}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Sexe</span>
      <span class="info-value">{gender_display}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Classe</span>
      <span class="info-value">{esc(classroom or "—")}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Niveau</span>
      <span class="info-value">{esc(level or "—")}</span>
    </div>
  </div>

  <!-- Grades table -->
  <table class="grades-table">
    <thead>
      <tr>
        <th style="text-align:left;width:45%;">Matière</th>
        <th style="width:15%;">Coeff.</th>
        <th style="width:20%;">Moyenne</th>
        <th style="width:20%;">Appréciation</th>
      </tr>
    </thead>
    <tbody>
      {subject_rows_html}
    </tbody>
  </table>

  <!-- Stats: average, rank, mention -->
  <div class="stats-row">
    <div class="stat-box" style="background:{avg_box_bg};color:#fff;">
      <span class="stat-label" style="color:rgba(255,255,255,.8);">Moyenne Générale</span>
      <span class="stat-value">{avg_display}</span>
      <span class="stat-sub">{esc(mention)}</span>
    </div>
    <div class="stat-box" style="background:#f0f9ff;border:1px solid #bae6fd;">
      <span class="stat-label" style="color:#0369a1;">Rang dans la classe</span>
      <span class="stat-value" style="color:#0c4a6e;font-size:18px;">{rank_html}</span>
      <span class="stat-sub" style="color:#0369a1;">élèves</span>
    </div>
    <div class="stat-box" style="background:{mention_bg};border:1px solid #d1d5db;">
      <span class="stat-label" style="color:#374151;">Mention</span>
      <span class="stat-value" style="color:{avg_color};font-size:13px;text-align:center;">{esc(mention)}</span>
    </div>
  </div>

  <!-- Absences -->
  <div class="absences-box">
    <span class="absences-icon">📋</span>
    <div>
      <div class="absences-label">Absences &amp; Retards — {esc(term or "Période")}</div>
      <div class="absences-value">{absences_html}</div>
    </div>
  </div>

  <!-- Decision & appreciation -->
  <div class="council-grid">
    <div class="council-box">
      <div class="council-title">Appréciation du professeur principal</div>
      <div class="council-content" style="color:#374151;font-weight:400;">
        {esc(director_comment) if director_comment else '<span style="color:#9ca3af;font-style:italic;">—</span>'}
      </div>
    </div>
    <div class="council-box" style="border-color:{decision_color};">
      <div class="council-title">Décision du conseil de classe</div>
      <div class="council-content" style="color:{decision_color};font-size:14px;">
        {decision_display}
      </div>
    </div>
  </div>

  <!-- Signatures -->
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-title">Cachet &amp; Signature du Directeur</div>
      <div class="sig-hint">À apposer avant remise aux parents</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Professeur Principal</div>
      <div class="sig-hint">Date et signature</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Signature des Parents / Tuteurs</div>
      <div class="sig-hint">Lu et pris connaissance</div>
    </div>
  </div>

  <div class="footer">
    Bulletin généré le {now_str} &nbsp;·&nbsp; {esc(school_name)}
    &nbsp;·&nbsp; <strong>Confidentiel</strong> — Réservé aux parents et tuteurs légaux
    &nbsp;·&nbsp; SchoolFlow Pro
  </div>

</div>

<!-- Print bar (hidden on print) -->
<div class="print-bar no-print">
  <button class="print-btn" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
  <button class="download-btn" onclick="downloadHtml()">⬇️ Télécharger .html</button>
</div>

<script>
function downloadHtml() {{
  const a = document.createElement('a');
  a.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(document.documentElement.outerHTML);
  a.download = 'bulletin_{safe_name}_{safe_term}.html';
  a.click();
}}
</script>

</body>
</html>""".replace(
    "{safe_name}", student_name.replace(" ", "_")[:30],
).replace(
    "{safe_term}", (term or "trimestre").replace(" ", "_")[:20],
)


# ── Smart endpoint v2 ──────────────────────────────────────────────────────────

@router.post("/generate-report-card/v2/")
def generate_smart_report_card(
    body: SmartReportCardRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    POST /school-life/generate-report-card/v2/
    Fully DB-driven bulletin: provide only IDs, all data fetched server-side.
    Returns base64-encoded A4 HTML ready for print-to-PDF.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Tenant context required")

    try:
        # ── Fetch base data ──────────────────────────────────────────────────
        info = _fetch_student_data(db, body.student_id, tenant_id)
        s = info["student"]
        t = info["tenant"]
        if not s:
            raise HTTPException(status_code=404, detail="Élève introuvable")

        # Classroom + level
        cls_row = db.execute(text("""
            SELECT c.name AS class_name, l.name AS level_name, ay.name AS year_name
            FROM classes c
            LEFT JOIN levels l ON c.level_id = l.id
            LEFT JOIN academic_years ay ON c.academic_year_id = ay.id
            WHERE c.id = :cid AND c.tenant_id = :tid
        """), {"cid": body.classroom_id, "tid": tenant_id}).mappings().first()

        # Term
        term_row = db.execute(text("""
            SELECT name, start_date, end_date FROM terms
            WHERE id = :tid_term AND tenant_id = :tid
        """), {"tid_term": body.term_id, "tid": tenant_id}).mappings().first()

        # Grades
        grades = _fetch_grades_for_term(db, body.student_id, body.term_id, tenant_id)
        general_avg = _compute_average(grades)

        # Absences
        absences = {"excused": 0, "absent": 0, "late": 0}
        if term_row and term_row["start_date"] and term_row["end_date"]:
            absences = _fetch_absences(
                db, body.student_id,
                term_row["start_date"], term_row["end_date"], tenant_id
            )

        # Class rank
        rank, total = _compute_class_rank(db, body.classroom_id, body.term_id, tenant_id, body.student_id)

        # Tenant settings (logo URL, show_guinea_header)
        settings: dict = {}
        if t and t.get("settings"):
            raw = t["settings"]
            settings = raw if isinstance(raw, dict) else {}

        # Format DOB
        dob = s.get("date_of_birth")
        dob_str = dob.strftime("%d/%m/%Y") if dob and hasattr(dob, "strftime") else (str(dob) if dob else "")

        html_content = _build_bulletin_v2(
            school_name=t["name"] if t else "École",
            school_address=t.get("address") or "" if t else "",
            school_phone=t.get("phone") or "" if t else "",
            school_email=t.get("email") or "" if t else "",
            school_logo_url=settings.get("logoUrl", ""),
            student_name=f"{s.get('first_name', '')} {s.get('last_name', '')}".strip(),
            registration_number=s.get("registration_number") or "",
            date_of_birth=dob_str,
            gender=s.get("gender") or "",
            classroom=cls_row["class_name"] if cls_row else "",
            level=cls_row["level_name"] if cls_row else "",
            academic_year=cls_row["year_name"] if cls_row else "",
            term=term_row["name"] if term_row else "",
            grades=grades,
            general_average=general_avg,
            class_rank=rank,
            class_total=total,
            absences_excused=absences["excused"],
            absences_absent=absences["absent"],
            absences_late=absences["late"],
            director_comment=body.director_comment or "",
            decision=body.decision or "",
            show_guinea_header=body.show_guinea_header,
        )

        encoded = base64.b64encode(html_content.encode("utf-8")).decode("ascii")
        student_name = f"{s.get('first_name', '')} {s.get('last_name', '')}".strip()
        return {
            "html": encoded,
            "format": "html",
            "count": 1,
            "student_name": student_name,
            "average": f"{general_avg:.2f}" if general_avg >= 0 else None,
            "rank": rank,
            "class_total": total,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("generate-report-card/v2 error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors de la génération du bulletin")


@router.post("/generate-report-cards/batch/")
def generate_batch_report_cards(
    body: SmartBatchRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    POST /school-life/generate-report-cards/batch/
    Generate all bulletins for a classroom in a single printable HTML document.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Tenant context required")

    try:
        # All active students in the class
        student_rows = db.execute(text("""
            SELECT e.student_id
            FROM enrollments e
            WHERE e.class_id  = :cid
              AND e.tenant_id = :tid
              AND e.status    = 'ACTIVE'
            ORDER BY (
                SELECT last_name FROM students WHERE id = e.student_id LIMIT 1
            )
        """), {"cid": body.classroom_id, "tid": tenant_id}).mappings().all()

        if not student_rows:
            raise HTTPException(status_code=404, detail="Aucun élève inscrit dans cette classe")

        # Tenant + class/term data (shared across all bulletins)
        t_row = db.execute(text(
            "SELECT name, address, phone, email, settings FROM tenants WHERE id = :tid"
        ), {"tid": tenant_id}).mappings().first()

        cls_row = db.execute(text("""
            SELECT c.name AS class_name, l.name AS level_name, ay.name AS year_name
            FROM classes c
            LEFT JOIN levels l ON c.level_id = l.id
            LEFT JOIN academic_years ay ON c.academic_year_id = ay.id
            WHERE c.id = :cid AND c.tenant_id = :tid
        """), {"cid": body.classroom_id, "tid": tenant_id}).mappings().first()

        term_row = db.execute(text("""
            SELECT name, start_date, end_date FROM terms
            WHERE id = :tid_term AND tenant_id = :tid
        """), {"tid_term": body.term_id, "tid": tenant_id}).mappings().first()

        settings: dict = {}
        if t_row and t_row.get("settings"):
            raw = t_row["settings"]
            settings = raw if isinstance(raw, dict) else {}

        html_parts: list[str] = []

        for row in student_rows:
            sid = str(row["student_id"])
            s = db.execute(text("""
                SELECT first_name, last_name, registration_number, date_of_birth, gender
                FROM students WHERE id = :sid AND tenant_id = :tid
            """), {"sid": sid, "tid": tenant_id}).mappings().first()
            if not s:
                continue

            grades = _fetch_grades_for_term(db, sid, body.term_id, tenant_id)
            general_avg = _compute_average(grades)

            absences = {"excused": 0, "absent": 0, "late": 0}
            if term_row and term_row["start_date"] and term_row["end_date"]:
                absences = _fetch_absences(db, sid, term_row["start_date"], term_row["end_date"], tenant_id)

            rank, total = _compute_class_rank(db, body.classroom_id, body.term_id, tenant_id, sid)

            dob = s.get("date_of_birth")
            dob_str = dob.strftime("%d/%m/%Y") if dob and hasattr(dob, "strftime") else (str(dob) if dob else "")

            bulletin_html = _build_bulletin_v2(
                school_name=t_row["name"] if t_row else "École",
                school_address=t_row.get("address") or "" if t_row else "",
                school_phone=t_row.get("phone") or "" if t_row else "",
                school_email=t_row.get("email") or "" if t_row else "",
                school_logo_url=settings.get("logoUrl", ""),
                student_name=f"{s.get('first_name', '')} {s.get('last_name', '')}".strip(),
                registration_number=s.get("registration_number") or "",
                date_of_birth=dob_str,
                gender=s.get("gender") or "",
                classroom=cls_row["class_name"] if cls_row else "",
                level=cls_row["level_name"] if cls_row else "",
                academic_year=cls_row["year_name"] if cls_row else "",
                term=term_row["name"] if term_row else "",
                grades=grades,
                general_average=general_avg,
                class_rank=rank,
                class_total=total,
                absences_excused=absences["excused"],
                absences_absent=absences["absent"],
                absences_late=absences["late"],
                director_comment=body.director_comment or "",
                decision=body.decision or "",
                show_guinea_header=body.show_guinea_header,
            )

            # Extract body content for merging (strip full HTML wrapper)
            b_start = bulletin_html.find("<body>") + len("<body>")
            b_end = bulletin_html.rfind("</body>")
            body_content = bulletin_html[b_start:b_end]
            html_parts.append(f'<div style="page-break-after:always;">{body_content}</div>')

        if not html_parts:
            raise HTTPException(status_code=404, detail="Aucun bulletin généré")

        # Build combined document (reuse CSS from first bulletin)
        first_full = _build_bulletin_v2(
            school_name=t_row["name"] if t_row else "École",
            show_guinea_header=body.show_guinea_header,
            student_name="", grades=[],
        )
        css_start = first_full.find("<style>")
        css_end = first_full.find("</style>") + len("</style>")
        shared_css = first_full[css_start:css_end]

        n = len(html_parts)
        combined = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Bulletins — {html_mod.escape(cls_row["class_name"] if cls_row else "")} — {html_mod.escape(term_row["name"] if term_row else "")} ({n} élèves)</title>
{shared_css}
</head>
<body>
{"".join(html_parts)}
<div class="print-bar no-print">
  <button class="print-btn" onclick="window.print()">🖨️ Imprimer tous les bulletins ({n} élèves)</button>
</div>
</body>
</html>"""

        encoded = base64.b64encode(combined.encode("utf-8")).decode("ascii")
        return {"html": encoded, "format": "html", "count": n}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("generate-report-cards/batch error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors de la génération groupée des bulletins")


# ─── Bulletin de notes (Report Card) — Legacy v1 ──────────────────────────────

class ReportCardGrade(BaseModel):
    subject_name: str
    score: Optional[float] = None
    max_score: float = 20
    coefficient: float = 1
    weight: float = 1


class ReportCardStudent(BaseModel):
    firstName: str
    lastName: str
    registration_number: Optional[str] = None


class ReportCardTenant(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None


class ReportCardRequest(BaseModel):
    tenant: ReportCardTenant
    student: ReportCardStudent
    classroom: Optional[str] = None
    level: Optional[str] = None
    term: Optional[str] = None
    academicYear: Optional[str] = None
    grades: List[ReportCardGrade] = []
    average: Optional[str] = None
    # Batch mode
    reports: Optional[List[dict]] = None


def _grade_mention(avg: float) -> str:
    if avg >= 18: return "Excellent"
    if avg >= 16: return "Très Bien"
    if avg >= 14: return "Bien"
    if avg >= 12: return "Assez Bien"
    if avg >= 10: return "Passable"
    return "Insuffisant"


def _grade_color(avg: float) -> str:
    if avg >= 14: return "#166534"   # green-800
    if avg >= 10: return "#92400e"   # amber-800
    return "#991b1b"                 # red-800


def _build_bulletin_html(
    tenant_name: str,
    tenant_address: str,
    tenant_phone: str,
    tenant_email: str,
    student_name: str,
    registration_number: str,
    classroom: str,
    level: str,
    term: str,
    academic_year: str,
    grades: list,
    average: str,
    logo_url: str = "",
) -> str:
    """Generate a professional bulletin HTML with inline CSS for print."""

    # Compute subject averages from grades
    by_subject: Dict[str, Dict] = {}
    for g in grades:
        name = html_mod.escape(str(g.get("subject_name", "Matière inconnue")))
        score = g.get("score")
        max_s = float(g.get("max_score", 20) or 20)
        coeff = float(g.get("coefficient", 1) or 1)
        if name not in by_subject:
            by_subject[name] = {"scores": [], "max_score": max_s, "coefficient": coeff}
        if score is not None:
            by_subject[name]["scores"].append((float(score), max_s))

    rows_html = ""
    total_weighted = 0.0
    total_coeff = 0.0
    for subj_name, data in by_subject.items():
        scores = data["scores"]
        coeff = data["coefficient"]
        max_s = data["max_score"]
        if scores:
            subj_avg = sum(s / m * 20 for s, m in scores) / len(scores)
            avg_str = f"{subj_avg:.2f}/20"
            total_weighted += subj_avg * coeff
            total_coeff += coeff
            color = _grade_color(subj_avg)
        else:
            subj_avg = -1
            avg_str = "—"
            color = "#6b7280"
        rows_html += f"""
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">{subj_name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">{coeff:.0f}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:{color};">{avg_str}</td>
        </tr>"""

    # Compute or use provided average
    computed_avg = -1.0
    if total_coeff > 0:
        computed_avg = total_weighted / total_coeff
        avg_display = f"{computed_avg:.2f}/20"
        mention = _grade_mention(computed_avg)
        avg_color = _grade_color(computed_avg)
    elif average and average != "-":
        avg_display = average + "/20" if "/" not in average else average
        mention = ""
        avg_color = "#374151"
    else:
        avg_display = "—"
        mention = ""
        avg_color = "#374151"

    logo_html = ""
    if logo_url:
        logo_html = f'<img src="{html_mod.escape(logo_url)}" alt="Logo" style="height:64px;object-fit:contain;" />'

    esc = html_mod.escape
    now = datetime.now().strftime("%d/%m/%Y")

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Bulletin — {esc(student_name)}</title>
<style>
  @page {{ size: A4 portrait; margin: 15mm 20mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: "Arial", sans-serif; }}
  body {{ background: #fff; color: #111; font-size: 13px; }}
  .page {{ max-width: 794px; margin: 0 auto; padding: 0; }}

  /* ─── Header ───────────────────────────── */
  .header {{ display:flex; align-items:center; gap:16px; padding-bottom:12px;
             border-bottom: 3px solid #1e40af; margin-bottom:16px; }}
  .header-logo {{ width:80px; min-width:80px; }}
  .header-center {{ flex:1; text-align:center; }}
  .header-center h1 {{ font-size:18px; font-weight:800; color:#1e40af; text-transform:uppercase; }}
  .header-center p {{ font-size:11px; color:#6b7280; margin-top:2px; }}
  .header-right {{ text-align:right; font-size:11px; color:#6b7280; line-height:1.6; }}

  /* ─── Doc title ─────────────────────────── */
  .doc-title {{ text-align:center; padding:10px 0; margin-bottom:14px; }}
  .doc-title h2 {{ font-size:16px; font-weight:800; color:#1e3a8a; text-transform:uppercase;
                   letter-spacing:2px; border-top:2px solid #bfdbfe; border-bottom:2px solid #bfdbfe;
                   padding:6px 0; display:inline-block; }}

  /* ─── Info grid ─────────────────────────── */
  .info-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:16px;
                background:#f0f7ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px; }}
  .info-item {{ display:flex; flex-direction:column; gap:2px; }}
  .info-label {{ font-size:10px; font-weight:700; color:#3b82f6; text-transform:uppercase; }}
  .info-value {{ font-size:13px; font-weight:600; color:#111; }}

  /* ─── Grades table ─────────────────────── */
  table {{ width:100%; border-collapse:collapse; margin-bottom:16px; }}
  thead tr {{ background:#1e40af; color:#fff; }}
  thead th {{ padding:9px 12px; text-align:left; font-size:12px; font-weight:700; }}
  thead th:not(:first-child) {{ text-align:center; }}
  tbody tr:nth-child(even) {{ background:#f8fafc; }}

  /* ─── Average box ─────────────────────── */
  .avg-box {{ display:flex; align-items:center; justify-content:space-between;
              background:#1e40af; color:#fff; border-radius:8px; padding:14px 20px;
              margin-bottom:16px; }}
  .avg-label {{ font-size:13px; font-weight:700; opacity:.9; }}
  .avg-value {{ font-size:26px; font-weight:900; }}
  .avg-mention {{ font-size:13px; font-weight:600; opacity:.85; }}

  /* ─── Signature area ─────────────────── */
  .sig-grid {{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px; margin-top:20px; }}
  .sig-box {{ border:1px solid #d1d5db; border-radius:6px; padding:12px; min-height:90px; }}
  .sig-title {{ font-size:11px; font-weight:700; color:#6b7280; text-transform:uppercase; margin-bottom:8px; }}

  /* ─── Footer ──────────────────────────── */
  .footer {{ margin-top:24px; padding-top:8px; border-top:1px solid #e5e7eb;
             font-size:10px; color:#9ca3af; text-align:center; }}

  @media print {{
    body {{ print-color-adjust: exact; -webkit-print-color-adjust: exact; }}
    .no-print {{ display:none !important; }}
  }}
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-logo">{logo_html}</div>
    <div class="header-center">
      <h1>{esc(tenant_name)}</h1>
      <p>BULLETIN DE NOTES</p>
    </div>
    <div class="header-right">
      {esc(tenant_address) if tenant_address else ""}<br>
      {esc(tenant_phone) if tenant_phone else ""}<br>
      {esc(tenant_email) if tenant_email else ""}
    </div>
  </div>

  <!-- Document title -->
  <div class="doc-title">
    <h2>Bulletin Scolaire — {esc(term or "Période")} · {esc(academic_year or "")}</h2>
  </div>

  <!-- Student info -->
  <div class="info-grid">
    <div class="info-item">
      <span class="info-label">Nom complet</span>
      <span class="info-value">{esc(student_name)}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Matricule</span>
      <span class="info-value">{esc(registration_number or "—")}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Classe</span>
      <span class="info-value">{esc(classroom or "—")}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Niveau</span>
      <span class="info-value">{esc(level or "—")}</span>
    </div>
  </div>

  <!-- Grades table -->
  <table>
    <thead>
      <tr>
        <th style="width:55%">Matière</th>
        <th style="width:20%">Coefficient</th>
        <th style="width:25%">Moyenne</th>
      </tr>
    </thead>
    <tbody>
      {rows_html if rows_html else '<tr><td colspan="3" style="padding:12px;text-align:center;color:#9ca3af;">Aucune note disponible</td></tr>'}
    </tbody>
  </table>

  <!-- Average -->
  <div class="avg-box">
    <span class="avg-label">Moyenne Générale</span>
    <span class="avg-value" style="color:{'#86efac' if computed_avg >= 10 else '#fca5a5' if computed_avg >= 0 else '#fff'}">{avg_display}</span>
    <span class="avg-mention">{esc(mention)}</span>
  </div>

  <!-- Signature area -->
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-title">Appréciation du professeur principal</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Signature du directeur</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Signature des parents</div>
    </div>
  </div>

  <div class="footer">
    Bulletin généré le {now} · {esc(tenant_name)} · Confidentiel — Réservé aux parents et tuteurs légaux
  </div>

</div>

<div class="no-print" style="text-align:center;padding:16px;">
  <button onclick="window.print()" style="padding:10px 24px;background:#1e40af;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;">
    🖨️ Imprimer / Enregistrer en PDF
  </button>
</div>

</body>
</html>"""


@router.post("/generate-report-card/")
def generate_report_card_html(
    body: ReportCardRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    POST /school-life/generate-report-card/
    Returns a base64-encoded professional HTML bulletin ready for printing / PDF.
    Supports single student or batch (body.reports list).
    """
    # ── Single report ──────────────────────────────────────────────────────────
    if not body.reports:
        student_name = f"{body.student.firstName} {body.student.lastName}".strip()
        html_content = _build_bulletin_html(
            tenant_name=body.tenant.name,
            tenant_address=body.tenant.address or "",
            tenant_phone=body.tenant.phone or "",
            tenant_email=body.tenant.email or "",
            student_name=student_name,
            registration_number=body.student.registration_number or "",
            classroom=body.classroom or "",
            level=body.level or "",
            term=body.term or "",
            academic_year=body.academicYear or "",
            grades=[g.dict() for g in body.grades],
            average=body.average or "",
            logo_url=body.tenant.logo_url or "",
        )
        encoded = base64.b64encode(html_content.encode("utf-8")).decode("ascii")
        return {"html": encoded, "format": "html", "count": 1}

    # ── Batch: merge all bulletins into one printable HTML page ───────────────
    all_html_parts = []
    for rep in body.reports:
        t = rep.get("tenant", {})
        s = rep.get("student", {})
        student_name = f"{s.get('firstName', '')} {s.get('lastName', '')}".strip()
        part = _build_bulletin_html(
            tenant_name=t.get("name", ""),
            tenant_address=t.get("address", ""),
            tenant_phone=t.get("phone", ""),
            tenant_email=t.get("email", ""),
            student_name=student_name,
            registration_number=s.get("registration_number", "") or "",
            classroom=rep.get("classroom", "") or "",
            level=rep.get("level", "") or "",
            term=rep.get("term", "") or "",
            academic_year=rep.get("academicYear", "") or "",
            grades=rep.get("grades", []),
            average=str(rep.get("average", "")) or "",
            logo_url=t.get("logo_url", "") or "",
        )
        # Strip the full HTML wrapper for merging — just keep body content
        # Extract <body> content for each bulletin page
        body_start = part.find("<body>") + len("<body>")
        body_end = part.rfind("</body>")
        body_content = part[body_start:body_end]
        all_html_parts.append(
            f'<div style="page-break-after:always;">{body_content}</div>'
        )

    # Wrap everything in a single HTML document
    combined = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Bulletins — Impression groupée ({len(body.reports)} élèves)</title>
<style>
  @page {{ size: A4 portrait; margin: 15mm 20mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }}
  body {{ background: #fff; color: #111; font-size: 13px; }}
  .page {{ max-width: 794px; margin: 0 auto; }}
  @media print {{
    body {{ print-color-adjust: exact; -webkit-print-color-adjust: exact; }}
    .no-print {{ display: none !important; }}
  }}
</style>
</head>
<body>
{"".join(all_html_parts)}
<div class="no-print" style="text-align:center;padding:16px;position:fixed;bottom:20px;left:50%;transform:translateX(-50%);">
  <button onclick="window.print()" style="padding:10px 24px;background:#1e40af;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;">
    🖨️ Imprimer tous les bulletins ({len(body.reports)} élèves)
  </button>
</div>
</body>
</html>"""

    encoded = base64.b64encode(combined.encode("utf-8")).decode("ascii")
    return {"html": encoded, "format": "html", "count": len(body.reports)}
