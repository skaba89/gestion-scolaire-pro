from typing import List, Optional
from sqlalchemy.orm import Session
from uuid import UUID

from app.models import ParentStudent, Student, User, UserRole
from app.schemas.parents import ParentStudentCreate

def get_parent_children(db: Session, parent_id: UUID, tenant_id: UUID) -> List[ParentStudent]:
    return db.query(ParentStudent).filter(
        ParentStudent.parent_id == parent_id,
        ParentStudent.tenant_id == tenant_id
    ).all()

def create_parent_student_link(db: Session, obj_in: ParentStudentCreate, tenant_id: UUID) -> ParentStudent:
    parent_exists = db.query(User).join(
        UserRole,
        (UserRole.user_id == User.id) & (UserRole.tenant_id == User.tenant_id),
    ).filter(
        User.id == obj_in.parent_id,
        User.tenant_id == tenant_id,
        UserRole.role == "PARENT",
    ).first()
    if not parent_exists:
        raise ValueError("Parent account not found in this tenant")

    student_exists = db.query(Student).filter(
        Student.id == obj_in.student_id,
        Student.tenant_id == tenant_id,
    ).first()
    if not student_exists:
        raise ValueError("Student not found in this tenant")

    existing = db.query(ParentStudent).filter(
        ParentStudent.parent_id == obj_in.parent_id,
        ParentStudent.student_id == obj_in.student_id,
        ParentStudent.tenant_id == tenant_id,
    ).first()
    if existing:
        raise ValueError("Parent is already linked to this student")

    db_obj = ParentStudent(
        **obj_in.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_obj)
    db.flush()
    db.refresh(db_obj)
    return db_obj

def get_student_parents(db: Session, student_id: UUID, tenant_id: UUID) -> List[ParentStudent]:
    return db.query(ParentStudent).filter(
        ParentStudent.student_id == student_id,
        ParentStudent.tenant_id == tenant_id
    ).all()
