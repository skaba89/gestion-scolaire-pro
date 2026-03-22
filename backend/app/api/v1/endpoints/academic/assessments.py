from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter()

class AssessmentCreate(BaseModel):
    subject_id: str
    term_id: str
    name: str
    type: str  # Maps to assessment_type in DB
    date: str
    max_score: float
    class_id: Optional[str] = None  # Frontend sends this but DB might not have it
    weight: Optional[float] = None
    description: Optional[str] = None

@router.get("/")
def get_assessments(
    classId: Optional[str] = None,
    subjectId: Optional[str] = None,
    termId: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    tenant_id = current_user.get("tenant_id")
    # Quick fix: using raw sql for assessments relation to subjects, classes, terms
    query_str = """
        SELECT a.*, 
               s.name as subject_name, s.code as subject_code,
               c.name as class_name,
               t.name as term_name
        FROM assessments a
        LEFT JOIN subjects s ON a.subject_id = s.id
        LEFT JOIN terms t ON a.term_id = t.id
        WHERE a.tenant_id = :tenant_id
    """
    params = {"tenant_id": tenant_id}
    
    if termId:
        query_str += " AND a.term_id = :term_id"
        params["term_id"] = termId
        
    query_str += " ORDER BY a.date DESC"
    
    results = db.execute(text(query_str), params).mappings().all()
    
    formatted_results = []
    for r in results:
        formatted_results.append({
            "id": r["id"],
            "tenant_id": r["tenant_id"],
            "class_id": r["class_id"],
            "subject_id": r["subject_id"],
            "term_id": r["term_id"],
            "name": r["name"],
            "type": r.get("assessment_type"),
            "date": r.get("date").isoformat() if r.get("date") and hasattr(r.get("date"), 'isoformat') else r.get("date"),
            "max_score": r.get("max_score"),
            "subjects": {"name": r.get("subject_name"), "code": r.get("subject_code")},
            "terms": {"name": r.get("term_name")},
        })
    return {"items": formatted_results}

@router.post("/")
def create_assessment(
    assessment: AssessmentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    tenant_id = current_user.get("tenant_id")
    query = text("""
        INSERT INTO assessments (id, tenant_id, subject_id, term_id, name, assessment_type, date, max_score, created_at, updated_at)
        VALUES (gen_random_uuid(), :tenant_id, :subject_id, :term_id, :name, :type, :date, :max_score, NOW(), NOW())
        RETURNING id, tenant_id, subject_id, term_id, name, assessment_type, date, max_score
    """)
    try:
        result = db.execute(query, {
            "tenant_id": tenant_id,
            "subject_id": assessment.subject_id,
            "term_id": assessment.term_id,
            "name": assessment.name,
            "type": assessment.type,
            "date": assessment.date,
            "max_score": assessment.max_score
        }).mappings().first()
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{id}/")
def delete_assessment(
    id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    tenant_id = current_user.get("tenant_id")
    query = text("DELETE FROM assessments WHERE id = :id AND tenant_id = :tenant_id")
    db.execute(query, {"id": str(id), "tenant_id": tenant_id})
    db.commit()
    return {"status": "success"}

