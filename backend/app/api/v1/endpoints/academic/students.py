"""Student endpoints"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from uuid import UUID
import math

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.crud import student as crud_student
from app.schemas.student import Student, StudentCreate, StudentUpdate, StudentList
from app.models.student import StudentStatus

router = APIRouter()


@router.get("/", response_model=StudentList)
def list_students(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("students:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[StudentStatus] = None,
    level: Optional[str] = None,
    class_name: Optional[str] = None,
):
    """
    List students with pagination and filters
    
    Permissions: students:read
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return StudentList(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
            pages=1,
        )

    skip = (page - 1) * page_size
    students, total = crud_student.get_students(
        db=db,
        tenant_id=tenant_id,
        skip=skip,
        limit=page_size,
        search=search,
        status=status,
        level=level,
        class_name=class_name,
    )
    
    pages = math.ceil(total / page_size) if total > 0 else 1
    
    return StudentList(
        items=students,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )

from sqlalchemy import text
from fastapi.responses import JSONResponse
from datetime import datetime

@router.get("/dashboard/")
def get_student_dashboard(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve metrics for the Student Dashboard."""
    user_id = current_user.get("id")
    tenant_id = current_user.get("tenant_id")
    if not user_id or not tenant_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    student_res = db.execute(text("""
        SELECT * FROM students 
        WHERE email = :email AND tenant_id = :tenant_id
        LIMIT 1
    """), {"email": current_user.get("email"), "tenant_id": tenant_id}).mappings().first()
    
    if not student_res:
         raise HTTPException(status_code=404, detail="Student profile not found")
         
    student_id = str(student_res["id"])
    
    enrollment = db.execute(text("""
        SELECT e.*, c.name as class_name, l.name as level_name
        FROM enrollments e
        LEFT JOIN classrooms c ON e.class_id = c.id
        LEFT JOIN levels l ON e.level_id = l.id
        WHERE e.student_id = :student_id AND e.status = 'active'
        LIMIT 1
    """), {"student_id": student_id}).mappings().first()
    
    class_id = str(enrollment["class_id"]) if enrollment and enrollment["class_id"] else None

    # Grades
    grades = [dict(r) for r in db.execute(text("""
        SELECT g.id, g.score, g.created_at, a.name as assessment_name, a.max_score, s.name as subject_name
        FROM grades g
        JOIN assessments a ON g.assessment_id = a.id
        LEFT JOIN subjects s ON a.subject_id = s.id
        WHERE g.student_id = :student_id AND g.score IS NOT NULL
        ORDER BY g.created_at DESC LIMIT 15
    """), {"student_id": student_id}).mappings().all()]
    
    formatted_grades = []
    for g in grades:
         formatted_grades.append({
             "id": g["id"], "score": g["score"], "created_at": g["created_at"].isoformat() if g["created_at"] else None,
             "assessments": { "max_score": g["max_score"], "name": g["assessment_name"], "subjects": {"name": g["subject_name"]} }
         })

    # Homework (assignments)
    homework = []
    if class_id:
        homework = [dict(r) for r in db.execute(text("""
            SELECT h.*, s.name as subject_name
            FROM homework h
            LEFT JOIN subjects s ON h.subject_id = s.id
            WHERE h.class_id = :class_id AND h.due_date >= CURRENT_DATE
            ORDER BY h.due_date ASC LIMIT 5
        """), {"class_id": class_id}).mappings().all()]
        
    for h in homework:
        if isinstance(h.get("due_date"), datetime): h["due_date"] = h["due_date"].isoformat()

    # Schedule
    schedule = []
    if class_id:
        schedule = [dict(r) for r in db.execute(text("""
            SELECT sh.*, s.name as subject_name, p.first_name as teacher_first, p.last_name as teacher_last
            FROM schedule sh
            LEFT JOIN subjects s ON sh.subject_id = s.id
            LEFT JOIN users p ON sh.teacher_id = p.id
            WHERE sh.class_id = :class_id
        """), {"class_id": class_id}).mappings().all()]

    # Checkins
    checkins = [dict(r) for r in db.execute(text("""
        SELECT * FROM student_check_ins
        WHERE student_id = :student_id
        ORDER BY checked_at DESC LIMIT 10
    """), {"student_id": student_id}).mappings().all()]
    for c in checkins:
        if isinstance(c.get("checked_at"), datetime): c["checked_at"] = c["checked_at"].isoformat()

    def secure_dict(d):
        if not d: return None
        res = dict(d)
        for k, v in res.items():
             if isinstance(v, datetime): res[k] = v.isoformat()
        return res

    return {
        "student": secure_dict(student_res),
        "enrollment": secure_dict(enrollment),
        "grades": formatted_grades,
        "homework": homework,
        "schedule": schedule,
        "checkInHistory": checkins,
        "submissions": []
    }

@router.get("/{student_id}/", response_model=Student)
def get_student(
    student_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("students:read")),
):
    """
    Get student by ID
    
    Permissions: students:read
    """
    student = crud_student.get_student(db, student_id, current_user.get("tenant_id"))
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    return student


@router.post("/", response_model=Student, status_code=status.HTTP_201_CREATED)
def create_student(
    student: StudentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("students:write")),
):
    """
    Create a new student
    
    Permissions: students:write
    """
    # Check if registration number already exists
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    existing = crud_student.get_student_by_registration(
        db, student.registration_number, tenant_id
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration number already exists"
        )
    
    return crud_student.create_student(db, student, tenant_id)


@router.put("/{student_id}/", response_model=Student)
def update_student(
    student_id: UUID,
    student_update: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("students:write")),
):
    """
    Update a student
    
    Permissions: students:write
    """
    updated_student = crud_student.update_student(
        db, student_id, student_update, current_user.get("tenant_id")
    )
    if not updated_student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    return updated_student


@router.delete("/{student_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_student(
    student_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("students:write")),
):
    """
    Delete a student
    
    Permissions: students:write
    """
    success = crud_student.delete_student(db, student_id, current_user.get("tenant_id"))
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    return None
