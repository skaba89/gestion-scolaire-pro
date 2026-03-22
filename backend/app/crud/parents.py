from typing import List, Optional
from sqlalchemy.orm import Session
from uuid import UUID

from app.models import ParentStudent, Student
from app.schemas.parents import ParentStudentCreate

def get_parent_children(db: Session, parent_id: UUID, tenant_id: UUID) -> List[ParentStudent]:
    return db.query(ParentStudent).filter(
        ParentStudent.parent_id == parent_id,
        ParentStudent.tenant_id == tenant_id
    ).all()

def create_parent_student_link(db: Session, obj_in: ParentStudentCreate, tenant_id: UUID) -> ParentStudent:
    db_obj = ParentStudent(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def get_student_parents(db: Session, student_id: UUID, tenant_id: UUID) -> List[ParentStudent]:
    return db.query(ParentStudent).filter(
        ParentStudent.student_id == student_id,
        ParentStudent.tenant_id == tenant_id
    ).all()
