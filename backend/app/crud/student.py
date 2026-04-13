"""CRUD operations for Student model"""
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_
from uuid import UUID

from app.models.student import Student, StudentStatus
from app.schemas.student import StudentCreate, StudentUpdate


def get_student(db: Session, student_id: UUID, tenant_id: UUID) -> Optional[Student]:
    """Get a student by ID"""
    return db.query(Student).filter(
        Student.id == student_id,
        Student.tenant_id == tenant_id
    ).first()


def get_student_by_registration(db: Session, registration_number: str, tenant_id: UUID) -> Optional[Student]:
    """Get a student by registration number"""
    return db.query(Student).filter(
        Student.registration_number == registration_number,
        Student.tenant_id == tenant_id
    ).first()


def get_students(
    db: Session,
    tenant_id: UUID,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    status: Optional[StudentStatus] = None,
    level: Optional[str] = None,
    class_name: Optional[str] = None,
) -> tuple[list[Student], int]:
    """Get students with pagination and filters"""
    query = db.query(Student).filter(Student.tenant_id == tenant_id)
    
    # Apply filters
    if search:
        search = search.replace('%', r'\%').replace('_', r'\_')
        search_filter = or_(
            Student.first_name.ilike(f"%{search}%"),
            Student.last_name.ilike(f"%{search}%"),
            Student.registration_number.ilike(f"%{search}%"),
            Student.email.ilike(f"%{search}%")
        )
        query = query.filter(search_filter)
    
    if status:
        query = query.filter(Student.status == status)
    
    if level:
        query = query.filter(Student.level == level)
    
    if class_name:
        query = query.filter(Student.class_name == class_name)
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    students = query.order_by(Student.created_at.desc()).offset(skip).limit(limit).all()
    
    return students, total


def create_student(db: Session, student: StudentCreate, tenant_id: UUID) -> Student:
    """Create a new student"""
    db_student = Student(
        **student.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    return db_student


def update_student(
    db: Session,
    student_id: UUID,
    student_update: StudentUpdate,
    tenant_id: UUID
) -> Optional[Student]:
    """Update a student"""
    db_student = get_student(db, student_id, tenant_id)
    if not db_student:
        return None
    
    # Update only provided fields
    update_data = student_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_student, field, value)
    
    db.commit()
    db.refresh(db_student)
    return db_student


def delete_student(db: Session, student_id: UUID, tenant_id: UUID) -> bool:
    """Delete a student"""
    db_student = get_student(db, student_id, tenant_id)
    if not db_student:
        return False
    
    db.delete(db_student)
    db.commit()
    return True
