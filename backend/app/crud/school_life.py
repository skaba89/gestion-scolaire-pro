from typing import List, Optional
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import date, datetime

from app.models import Grade, Assessment, Attendance, SchoolEvent, StudentCheckIn
from app.schemas.school_life import (
    GradeCreate, GradeUpdate,
    AssessmentCreate, AssessmentUpdate,
    AttendanceCreate, AttendanceUpdate,
    SchoolEventCreate, SchoolEventUpdate,
    StudentCheckInCreate
)

# --- Assessment ---
def get_assessments(db: Session, tenant_id: UUID) -> List[Assessment]:
    return db.query(Assessment).filter(Assessment.tenant_id == tenant_id).order_by(Assessment.date.desc()).all()

def get_assessment(db: Session, assessment_id: UUID, tenant_id: UUID) -> Optional[Assessment]:
    return db.query(Assessment).filter(Assessment.id == assessment_id, Assessment.tenant_id == tenant_id).first()

def create_assessment(db: Session, obj_in: AssessmentCreate, tenant_id: UUID) -> Assessment:
    db_obj = Assessment(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_assessment(db: Session, assessment_id: UUID, obj_in: AssessmentUpdate, tenant_id: UUID) -> Optional[Assessment]:
    db_obj = get_assessment(db, assessment_id, tenant_id)
    if not db_obj:
        return None
    
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

# --- Grade ---
def get_grades(db: Session, tenant_id: UUID, student_id: Optional[UUID] = None) -> List[Grade]:
    query = db.query(Grade).filter(Grade.tenant_id == tenant_id)
    if student_id:
        query = query.filter(Grade.student_id == student_id)
    return query.order_by(Grade.created_at.desc()).all()

def create_grade(db: Session, obj_in: GradeCreate, tenant_id: UUID) -> Grade:
    db_obj = Grade(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_grade(db: Session, grade_id: UUID, obj_in: GradeUpdate, tenant_id: UUID) -> Optional[Grade]:
    db_obj = db.query(Grade).filter(Grade.id == grade_id, Grade.tenant_id == tenant_id).first()
    if not db_obj:
        return None
    
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

# --- Attendance ---
def get_attendance(db: Session, tenant_id: UUID, student_ids: Optional[List[UUID]] = None) -> List[Attendance]:
    query = db.query(Attendance).filter(Attendance.tenant_id == tenant_id)
    if student_ids:
        query = query.filter(Attendance.student_id.in_(student_ids))
    return query.order_by(Attendance.date.desc()).all()

def create_attendance(db: Session, obj_in: AttendanceCreate, tenant_id: UUID) -> Attendance:
    db_obj = Attendance(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

# --- School Event ---
def get_events(db: Session, tenant_id: UUID, start_after: Optional[datetime] = None) -> List[SchoolEvent]:
    query = db.query(SchoolEvent).filter(SchoolEvent.tenant_id == tenant_id)
    if start_after:
        query = query.filter(SchoolEvent.start_date >= start_after)
    return query.order_by(SchoolEvent.start_date.asc()).all()

def get_event(db: Session, event_id: UUID, tenant_id: UUID) -> Optional[SchoolEvent]:
    return db.query(SchoolEvent).filter(SchoolEvent.id == event_id, SchoolEvent.tenant_id == tenant_id).first()

def create_event(db: Session, obj_in: SchoolEventCreate, tenant_id: UUID) -> SchoolEvent:
    db_obj = SchoolEvent(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_event(db: Session, event_id: UUID, obj_in: SchoolEventUpdate, tenant_id: UUID) -> Optional[SchoolEvent]:
    db_obj = get_event(db, event_id, tenant_id)
    if not db_obj:
        return None
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_event(db: Session, event_id: UUID, tenant_id: UUID) -> bool:
    db_obj = get_event(db, event_id, tenant_id)
    if not db_obj:
        return False
    db.delete(db_obj)
    db.commit()
    return True

# --- Student Check-In ---
def get_check_ins(db: Session, tenant_id: UUID, student_ids: Optional[List[UUID]] = None) -> List[StudentCheckIn]:
    query = db.query(StudentCheckIn).filter(StudentCheckIn.tenant_id == tenant_id)
    if student_ids:
        query = query.filter(StudentCheckIn.student_id.in_(student_ids))
    return query.order_by(StudentCheckIn.checked_at.desc()).all()

def create_check_in(db: Session, obj_in: StudentCheckInCreate, tenant_id: UUID) -> StudentCheckIn:
    db_obj = StudentCheckIn(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj
