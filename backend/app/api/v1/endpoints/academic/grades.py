"""Grade endpoints"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from uuid import UUID
import math

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.crud import grade as crud_grade
from app.schemas.grade import Grade, GradeCreate, GradeUpdate, GradeList

router = APIRouter()


@router.get("/", response_model=GradeList)
def list_grades(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    student_id: Optional[UUID] = None,
    subject: Optional[str] = None,
    academic_year: Optional[str] = None,
):
    """
    List grades with pagination and filters
    
    Permissions: grades:read
    """
    skip = (page - 1) * page_size
    grades, total = crud_grade.get_grades(
        db=db,
        tenant_id=current_user["tenant_id"],
        skip=skip,
        limit=page_size,
        student_id=student_id,
        subject=subject,
        academic_year=academic_year,
    )
    
    pages = math.ceil(total / page_size) if total > 0 else 1
    
    return GradeList(
        items=grades,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/student/{student_id}/average/")
def get_student_average(
    student_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
    academic_year: Optional[str] = None,
    semester: Optional[int] = Query(None, ge=1, le=2),
):
    """
    Get student's average grades
    
    Permissions: grades:read
    """
    return crud_grade.get_student_average(
        db=db,
        student_id=student_id,
        tenant_id=current_user["tenant_id"],
        academic_year=academic_year,
        semester=semester,
    )


@router.get("/{grade_id}/", response_model=Grade)
def get_grade(
    grade_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
):
    """
    Get grade by ID
    
    Permissions: grades:read
    """
    grade = crud_grade.get_grade(db, grade_id, current_user["tenant_id"])
    if not grade:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grade not found"
        )
    return grade


@router.post("/", response_model=Grade, status_code=status.HTTP_201_CREATED)
def create_grade(
    grade: GradeCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:write")),
):
    """
    Create a new grade
    
    Permissions: grades:write
    """
    return crud_grade.create_grade(db, grade, current_user["tenant_id"])


@router.put("/{grade_id}/", response_model=Grade)
def update_grade(
    grade_id: UUID,
    grade_update: GradeUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:write")),
):
    """
    Update a grade
    
    Permissions: grades:write
    """
    updated_grade = crud_grade.update_grade(
        db, grade_id, grade_update, current_user["tenant_id"]
    )
    if not updated_grade:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grade not found"
        )
    return updated_grade


@router.delete("/{grade_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_grade(
    grade_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:write")),
):
    """
    Delete a grade
    
    Permissions: grades:write
    """
    success = crud_grade.delete_grade(db, grade_id, current_user["tenant_id"])
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grade not found"
        )
    return None
