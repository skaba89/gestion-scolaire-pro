from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.tenant_resolution import resolve_current_tenant_id
from fastapi import Query
from app.crud import academic as crud
from app.models.associations import subject_levels, classroom_departments, class_subjects
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

from app.schemas.academic import (
    Room, RoomCreate,
    Classroom, ClassroomCreate, ClassroomUpdate,
    Enrollment, EnrollmentCreate,
    Program, ProgramCreate
)

router = APIRouter()

# --- Rooms ---
@router.get("/rooms/", response_model=List[Room])
def read_rooms(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud.get_rooms(db, tenant_id=str(resolve_current_tenant_id(request, current_user, db)))

@router.post("/rooms/", response_model=Room)
def create_room(
    obj_in: RoomCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud.create_room(db, obj_in=obj_in, tenant_id=str(resolve_current_tenant_id(request, current_user, db)))

# --- Programs ---
@router.get("/programs/", response_model=List[Program])
def read_programs(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud.get_programs(db, tenant_id=str(resolve_current_tenant_id(request, current_user, db)))

@router.post("/programs/", response_model=Program)
def create_program(
    obj_in: ProgramCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud.create_program(db, obj_in=obj_in, tenant_id=str(resolve_current_tenant_id(request, current_user, db)))

# --- Classrooms (Classes) ---
@router.get("/classrooms/", response_model=List[Classroom])
def read_classrooms(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud.get_classrooms(db, tenant_id=str(resolve_current_tenant_id(request, current_user, db)))

@router.post("/classrooms/", response_model=Classroom)
def create_classroom(
    obj_in: ClassroomCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud.create_classroom(db, obj_in=obj_in, tenant_id=str(resolve_current_tenant_id(request, current_user, db)))

# --- Enrollments ---
@router.get("/enrollments/", response_model=List[Enrollment])
def read_enrollments(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud.get_enrollments(db, tenant_id=str(resolve_current_tenant_id(request, current_user, db)))

@router.post("/enrollments/", response_model=Enrollment)
def create_enrollment(
    obj_in: EnrollmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return crud.create_enrollment(db, obj_in=obj_in, tenant_id=str(resolve_current_tenant_id(request, current_user, db)))

# --- Associations Helpers ---

@router.get("/all-subject-levels/")
def read_all_subject_levels(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    rows = db.execute(subject_levels.select().where(subject_levels.c.tenant_id == tenant_id)).fetchall()
    return [{"subject_id": str(r.subject_id), "level_id": str(r.level_id)} for r in rows]

@router.get("/classroom-departments/")
def read_classroom_departments(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    rows = db.execute(classroom_departments.select().where(classroom_departments.c.tenant_id == tenant_id)).fetchall()
    return [{"class_id": str(r.class_id), "department_id": str(r.department_id)} for r in rows]

@router.get("/classrooms/{class_id}/subjects/")
def read_classroom_subjects(
    class_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    rows = db.execute(class_subjects.select().where(
        (class_subjects.c.class_id == class_id) & (class_subjects.c.tenant_id == tenant_id)
    )).fetchall()
    return [str(r.subject_id) for r in rows]

@router.get("/classrooms/{class_id}/departments/")
def read_classroom_departments(
    class_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    rows = db.execute(classroom_departments.select().where(
        (classroom_departments.c.class_id == class_id) & (classroom_departments.c.tenant_id == tenant_id)
    )).fetchall()
    return [str(r.department_id) for r in rows]

@router.get("/rooms/count/")
def count_rooms(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    return db.execute(text("SELECT COUNT(*) FROM rooms WHERE tenant_id = :tenant_id"), {"tenant_id": tenant_id}).scalar() or 0

@router.get("/enrollments/counts/")
def read_enrollment_counts(
    request: Request,
    class_ids: List[UUID] = Query(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not class_ids:
        return {}
    rows = db.execute(text("""
        SELECT class_id, COUNT(*) as count 
        FROM enrollments 
        WHERE tenant_id = :tenant_id AND class_id = ANY(:class_ids) AND status = 'active'
        GROUP BY class_id
    """), {"tenant_id": tenant_id, "class_ids": class_ids}).fetchall()
    return {str(r.class_id): r.count for r in rows}

@router.post("/classrooms/{class_id}/subjects/{subject_id}/")
def assign_subject_to_classroom(
    class_id: UUID,
    subject_id: UUID,
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    db.execute(class_subjects.insert().values(
        tenant_id=tenant_id,
        class_id=class_id,
        subject_id=subject_id,
        is_optional=payload.get("is_optional", False),
        coefficient=payload.get("coefficient", 1.0)
    ))
    db.commit()
    return {"status": "success"}

@router.delete("/classrooms/{class_id}/subjects/{subject_id}/")
def remove_subject_from_classroom(
    class_id: UUID,
    subject_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    db.execute(class_subjects.delete().where(
        (class_subjects.c.class_id == class_id) & 
        (class_subjects.c.subject_id == subject_id) & 
        (class_subjects.c.tenant_id == tenant_id)
    ))
    db.commit()
    return {"status": "success"}
