from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter()

@router.get("/dashboard/")
def get_teacher_dashboard(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve all aggregated metrics for the Teacher Dashboard."""
    teacher_id = current_user.get("id")
    tenant_id = current_user.get("tenant_id")
    
    if not teacher_id or not tenant_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # 1. Classes and Subjects (Assignments)
    assignments = [dict(r) for r in db.execute(text("""
        SELECT ta.id, ta.class_id, ta.subject_id,
               c.id as class_id, c.name as class_name,
               s.id as subject_id, s.name as subject_name
        FROM teacher_assignments ta
        LEFT JOIN classrooms c ON ta.class_id = c.id
        LEFT JOIN subjects s ON ta.subject_id = s.id
        WHERE ta.teacher_id = :teacher_id AND ta.tenant_id = :tenant_id
    """), {"teacher_id": teacher_id, "tenant_id": tenant_id}).mappings().all()]

    formatted_assignments = []
    for a in assignments:
        formatted_assignments.append({
            "id": str(a["id"]),
            "class_id": str(a["class_id"]) if a["class_id"] else None,
            "subject_id": str(a["subject_id"]) if a["subject_id"] else None,
            "classrooms": {"id": str(a["class_id"]), "name": a["class_name"]} if a["class_id"] else None,
            "subjects": {"id": str(a["subject_id"]), "name": a["subject_name"]} if a["subject_id"] else None
        })

    # 2. Schedule
    schedule = [dict(r) for r in db.execute(text("""
        SELECT sh.id, sh.day_of_week, sh.start_time, sh.end_time,
               s.id as subject_id, s.name as subject_name,
               c.id as class_id, c.name as class_name
        FROM schedule sh
        LEFT JOIN subjects s ON sh.subject_id = s.id
        LEFT JOIN classrooms c ON sh.class_id = c.id
        WHERE sh.teacher_id = :teacher_id AND sh.tenant_id = :tenant_id
        ORDER BY sh.day_of_week, sh.start_time
    """), {"teacher_id": teacher_id, "tenant_id": tenant_id}).mappings().all()]
    
    formatted_schedule = []
    for s in schedule:
        formatted_schedule.append({
            "id": str(s["id"]),
            "day_of_week": int(s["day_of_week"]),
            "start_time": s["start_time"],
            "end_time": s["end_time"],
            "subjects": {"id": str(s["subject_id"]), "name": s["subject_name"]} if s["subject_id"] else None,
            "classrooms": {"id": str(s["class_id"]), "name": s["class_name"]} if s["class_id"] else None,
        })

    # 3. Assessments created by this teacher
    assessments = [dict(r) for r in db.execute(text("""
        SELECT a.id, a.name, a.max_score, a.type, a.date, a.class_id,
               s.name as subject_name
        FROM assessments a
        LEFT JOIN subjects s ON a.subject_id = s.id
        WHERE a.teacher_id = :teacher_id AND a.tenant_id = :tenant_id
        ORDER BY a.created_at DESC LIMIT 5
    """), {"teacher_id": teacher_id, "tenant_id": tenant_id}).mappings().all()]
    
    formatted_assessments = []
    for a in assessments:
        formatted_assessments.append({
            "id": str(a["id"]),
            "name": a["name"],
            "max_score": float(a["max_score"]) if a["max_score"] else None,
            "type": a["type"],
            "date": a["date"].isoformat() if a["date"] and isinstance(a["date"], datetime) else a["date"],
            "class_id": str(a["class_id"]) if a["class_id"] else None,
            "subjects": {"name": a["subject_name"]} if a["subject_name"] else None
        })

    return {
        "assignments": formatted_assignments,
        "schedule": formatted_schedule,
        "assessments": formatted_assessments
    }
