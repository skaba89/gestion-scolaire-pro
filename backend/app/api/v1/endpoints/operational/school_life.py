from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.school_life import (
    Assessment, AssessmentCreate, AssessmentUpdate,
    Grade, GradeCreate, GradeUpdate,
    Attendance, AttendanceCreate, AttendanceUpdate,
    SchoolEvent, SchoolEventCreate, SchoolEventUpdate,
    StudentCheckIn, StudentCheckInCreate
)
from app.crud import school_life as crud_sl

router = APIRouter()

# --- Assessments ---

@router.get("/assessments/", response_model=List[Assessment])
def read_assessments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud_sl.get_assessments(db, tenant_id=current_user.get("tenant_id"))

@router.post("/assessments/", response_model=Assessment)
def create_assessment(
    *,
    db: Session = Depends(get_db),
    obj_in: AssessmentCreate,
    current_user: dict = Depends(get_current_user),
):
    return crud_sl.create_assessment(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))

# --- Grades ---

@router.get("/grades/", response_model=List[Grade])
def read_grades(
    student_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud_sl.get_grades(db, tenant_id=current_user.get("tenant_id"), student_id=student_id)

@router.post("/grades/", response_model=Grade)
def create_grade(
    *,
    db: Session = Depends(get_db),
    obj_in: GradeCreate,
    current_user: dict = Depends(get_current_user),
):
    return crud_sl.create_grade(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))

# --- Attendance ---

@router.get("/attendance/", response_model=List[Attendance])
def read_attendance(
    student_ids: List[UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud_sl.get_attendance(db, tenant_id=current_user.get("tenant_id"), student_ids=student_ids)

@router.post("/attendance/", response_model=Attendance)
def create_attendance(
    *,
    db: Session = Depends(get_db),
    obj_in: AttendanceCreate,
    current_user: dict = Depends(get_current_user),
):
    return crud_sl.create_attendance(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))

# --- Events ---

@router.get("/events/", response_model=List[SchoolEvent])
def read_events(
    start_after: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud_sl.get_events(db, tenant_id=current_user.get("tenant_id"), start_after=start_after)

@router.post("/events/", response_model=SchoolEvent)
def create_event(
    *,
    db: Session = Depends(get_db),
    obj_in: SchoolEventCreate,
    current_user: dict = Depends(get_current_user),
):
    return crud_sl.create_event(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))

# --- Check-Ins ---

@router.get("/check-ins/", response_model=List[StudentCheckIn])
def read_check_ins(
    student_ids: List[UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud_sl.get_check_ins(db, tenant_id=current_user.get("tenant_id"), student_ids=student_ids)

@router.post("/check-ins/", response_model=StudentCheckIn)
def create_check_in(
    *,
    db: Session = Depends(get_db),
    obj_in: StudentCheckInCreate,
    current_user: dict = Depends(get_current_user),
):
    return crud_sl.create_check_in(db, obj_in=obj_in, tenant_id=current_user.get("tenant_id"))

# --- Badges ---

@router.get("/badges/")
def list_badges(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
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

@router.get("/students-without-badges/")
def students_without_badges(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
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

@router.get("/event-registrations/")
def list_event_registrations(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    from sqlalchemy import text
    return db.execute(text("SELECT event_id, id FROM career_event_registrations WHERE tenant_id = :tid"), {"tid": tenant_id}).mappings().all()

@router.get("/gamification/stats/")
def get_gamification_stats(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
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
