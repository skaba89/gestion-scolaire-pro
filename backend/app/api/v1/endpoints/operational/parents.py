from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.parents import ParentStudent
from app.crud import parents as crud_parents

router = APIRouter()

@router.get("/children/", response_model=List[ParentStudent])
def read_parent_children(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Retrieve all children associated with the current parent user."""
    return crud_parents.get_parent_children(db, parent_id=current_user.get("id"), tenant_id=current_user.get("tenant_id"))

@router.get("/students/{student_id}/parents/", response_model=List[ParentStudent])
def read_student_parents(
    student_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Retrieve all parents associated with a specific student."""
    return crud_parents.get_student_parents(db, student_id=student_id, tenant_id=current_user.get("tenant_id"))

from sqlalchemy import text
from fastapi.responses import JSONResponse
from datetime import datetime

@router.get("/dashboard/")
def get_parent_dashboard(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve all aggregated metrics for the Parent Dashboard."""
    parent_id = current_user.get("id")
    tenant_id = current_user.get("tenant_id")
    if not parent_id or not tenant_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Fetch children IDs for this parent
    children_res = db.execute(text("""
        SELECT student_id, students.first_name, students.last_name, students.registration_number, students.photo_url
        FROM parent_students
        JOIN students ON parent_students.student_id = students.id
        WHERE parent_id = :parent_id AND parent_students.tenant_id = :tenant_id
    """), {"parent_id": parent_id, "tenant_id": tenant_id}).fetchall()
    
    children_list = [dict(r._mapping) for r in children_res]
    student_ids = [str(c["student_id"]) for c in children_list]
    
    if not student_ids:
        return {
            "children": [], "unpaidInvoices": [], "upcomingEvents": [], 
            "recentGrades": [], "attendanceAlerts": [], "latestScans": [], 
            "notifications": [], "unreadMessagesCount": 0
        }
        
    student_ids_tuple = tuple(student_ids) if len(student_ids) > 1 else f"('{student_ids[0]}')"
    
    # Unpaid Invoices
    query_invoices = text(f"""
        SELECT * FROM invoices 
        WHERE student_id IN {student_ids_tuple} AND status IN ('PENDING', 'PARTIAL', 'OVERDUE')
        AND tenant_id = :tenant_id
    """)
    unpaid_invoices = [dict(r._mapping) for r in db.execute(query_invoices, {"tenant_id": tenant_id}).fetchall()]

    # Recent Grades
    query_grades = text(f"""
        SELECT g.id, g.score, g.created_at, 
               a.name as assessment_name, a.max_score, 
               s.name as subject_name,
               st.first_name, st.last_name
        FROM grades g
        JOIN assessments a ON g.assessment_id = a.id
        LEFT JOIN subjects s ON a.subject_id = s.id
        JOIN students st ON g.student_id = st.id
        WHERE g.student_id IN {student_ids_tuple} AND g.score IS NOT NULL
        AND g.tenant_id = :tenant_id
        ORDER BY g.created_at DESC LIMIT 5
    """)
    recent_grades = [dict(r._mapping) for r in db.execute(query_grades, {"tenant_id": tenant_id}).fetchall()]
    
    # Format grades to match frontend expectation
    formatted_grades = []
    for g in recent_grades:
         formatted_grades.append({
             "id": g["id"], "score": g["score"], "created_at": g["created_at"],
             "assessments": { "max_score": g["max_score"], "name": g["assessment_name"], "subjects": {"name": g["subject_name"]} },
             "students": {"first_name": g["first_name"], "last_name": g["last_name"]}
         })

    # Attendance Alerts
    query_attendance = text(f"""
        SELECT a.id, a.date, a.status, st.first_name, st.last_name
        FROM attendance a
        JOIN students st ON a.student_id = st.id
        WHERE a.student_id IN {student_ids_tuple} AND a.status IN ('ABSENT', 'LATE')
        AND a.tenant_id = :tenant_id
        ORDER BY a.date DESC LIMIT 5
    """)
    attendance_alerts = []
    for a in db.execute(query_attendance, {"tenant_id": tenant_id}).fetchall():
        row = dict(a._mapping)
        attendance_alerts.append({
            "id": row["id"], "date": row["date"].isoformat() if row["date"] else None, "status": row["status"],
            "students": {"first_name": row["first_name"], "last_name": row["last_name"]}
        })

    # Upcoming Events
    today = datetime.now().date().isoformat()
    upcoming_events = [dict(r._mapping) for r in db.execute(text("""
        SELECT * FROM school_events 
        WHERE tenant_id = :tenant_id AND start_date >= :today
        ORDER BY start_date ASC LIMIT 5
    """), {"tenant_id": tenant_id, "today": today}).fetchall()]
    
    # Notifications
    notifications = [dict(r._mapping) for r in db.execute(text("""
        SELECT * FROM notifications 
        WHERE user_id = :parent_id AND is_read = false
        ORDER BY created_at DESC LIMIT 5
    """), {"parent_id": parent_id}).fetchall()]

    # Student Check-ins / Scans
    scans = [dict(r._mapping) for r in db.execute(text(f"""
        SELECT c.*, st.first_name, st.last_name
        FROM student_check_ins c
        JOIN students st ON c.student_id = st.id
        WHERE c.student_id IN {student_ids_tuple}
        AND c.tenant_id = :tenant_id
        ORDER BY c.checked_at DESC LIMIT 10
    """), {"tenant_id": tenant_id}).fetchall()]
    
    formatted_scans = []
    for s in scans:
        formatted_scans.append({
            "id": s["id"], "check_in_type": s["check_in_type"], "checked_at": s["checked_at"].isoformat() if s["checked_at"] else None,
            "students": {"first_name": s["first_name"], "last_name": s["last_name"]}
        })

    # Clean lists of dates for JSON response
    def clean_row(row):
        for k, v in row.items():
            if isinstance(v, datetime): row[k] = v.isoformat()
        return row

    return {
        "children": children_list,
        "unpaidInvoices": [clean_row(inv) for inv in unpaid_invoices],
        "upcomingEvents": [clean_row(ev) for ev in upcoming_events],
        "recentGrades": formatted_grades,
        "attendanceAlerts": attendance_alerts,
        "latestScans": formatted_scans,
        "notifications": [clean_row(n) for n in notifications],
        "unreadMessagesCount": 0  # To be implemented with robust chat module
    }

