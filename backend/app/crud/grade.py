"""CRUD operations for Grade model"""
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from uuid import UUID

from app.models.grade import Grade
from app.schemas.grade import GradeCreate, GradeUpdate


def get_grade(db: Session, grade_id: UUID, tenant_id: UUID) -> Optional[Grade]:
    """Get a grade by ID"""
    return db.query(Grade).filter(
        Grade.id == grade_id,
        Grade.tenant_id == tenant_id
    ).first()


def get_grades(
    db: Session,
    tenant_id: UUID,
    skip: int = 0,
    limit: int = 100,
    student_id: Optional[UUID] = None,
    subject: Optional[str] = None,
    academic_year: Optional[str] = None,
) -> tuple[list[Grade], int]:
    """Get grades with pagination and filters"""
    query = db.query(Grade).filter(Grade.tenant_id == tenant_id)
    
    if student_id:
        query = query.filter(Grade.student_id == student_id)
    
    if subject:
        query = query.filter(Grade.subject == subject)
    
    if academic_year:
        query = query.filter(Grade.academic_year == academic_year)
    
    total = query.count()
    grades = query.order_by(Grade.exam_date.desc()).offset(skip).limit(limit).all()
    
    return grades, total


def get_student_average(
    db: Session,
    student_id: UUID,
    tenant_id: UUID,
    academic_year: Optional[str] = None,
    semester: Optional[int] = None,
) -> dict:
    """Calculate student's average grades"""
    query = db.query(
        func.avg(Grade.score).label('average'),
        func.count(Grade.id).label('count')
    ).filter(
        Grade.student_id == student_id,
        Grade.tenant_id == tenant_id
    )
    
    if academic_year:
        query = query.filter(Grade.academic_year == academic_year)
    
    if semester:
        query = query.filter(Grade.semester == semester)
    
    result = query.first()
    
    return {
        'average': float(result.average) if result.average else 0.0,
        'count': result.count or 0
    }


def create_grade(db: Session, grade: GradeCreate, tenant_id: UUID) -> Grade:
    """Create a new grade"""
    db_grade = Grade(
        **grade.model_dump(),
        tenant_id=tenant_id
    )
    db.add(db_grade)
    db.commit()
    db.refresh(db_grade)
    return db_grade


def update_grade(
    db: Session,
    grade_id: UUID,
    grade_update: GradeUpdate,
    tenant_id: UUID
) -> Optional[Grade]:
    """Update a grade"""
    db_grade = get_grade(db, grade_id, tenant_id)
    if not db_grade:
        return None
    
    update_data = grade_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_grade, field, value)
    
    db.commit()
    db.refresh(db_grade)
    return db_grade


def delete_grade(db: Session, grade_id: UUID, tenant_id: UUID) -> bool:
    """Delete a grade"""
    db_grade = get_grade(db, grade_id, tenant_id)
    if not db_grade:
        return False
    
    db.delete(db_grade)
    db.commit()
    return True
