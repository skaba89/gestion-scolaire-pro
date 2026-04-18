import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user, require_permission

router = APIRouter()
logger = logging.getLogger(__name__)


class AssessmentCreate(BaseModel):
    subject_id: str
    term_id: Optional[str] = None
    name: str
    type: str  # Maps to assessment_type in DB
    date: str
    max_score: float
    weight: Optional[float] = None
    description: Optional[str] = None
    class_id: Optional[str] = None


class AssessmentUpdate(BaseModel):
    subject_id: Optional[str] = None
    term_id: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    date: Optional[str] = None
    max_score: Optional[float] = None
    weight: Optional[float] = None
    description: Optional[str] = None
    class_id: Optional[str] = None


@router.get("/")
def get_assessments(
    classId: Optional[str] = None,
    subjectId: Optional[str] = None,
    termId: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """List assessments with optional filters by subject or term."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return {"items": []}

    query_str = """
        SELECT a.id, a.tenant_id, a.subject_id, a.term_id, a.academic_year_id,
               a.name, a.assessment_type, a.date, a.max_score, a.created_at, a.updated_at,
               s.name as subject_name, s.code as subject_code,
               t.name as term_name
        FROM assessments a
        LEFT JOIN subjects s ON a.subject_id = s.id
        LEFT JOIN terms t ON a.term_id = t.id
        WHERE a.tenant_id = :tenant_id
    """
    params = {"tenant_id": tenant_id}

    if subjectId:
        query_str += " AND a.subject_id = :subject_id"
        params["subject_id"] = subjectId

    if termId:
        query_str += " AND a.term_id = :term_id"
        params["term_id"] = termId

    if classId:
        query_str += " AND a.class_id = :class_id"
        params["class_id"] = classId

    query_str += " ORDER BY a.date DESC"

    try:
        results = db.execute(text(query_str), params).mappings().all()
    except Exception as e:
        logger.error("Error fetching assessments: %s", e)
        return {"items": []}

    formatted_results = []
    for r in results:
        formatted_results.append({
            "id": str(r["id"]),
            "tenant_id": str(r["tenant_id"]) if r["tenant_id"] else None,
            "subject_id": str(r["subject_id"]) if r["subject_id"] else None,
            "term_id": str(r["term_id"]) if r["term_id"] else None,
            "academic_year_id": str(r["academic_year_id"]) if r.get("academic_year_id") else None,
            "name": r["name"],
            "type": r.get("assessment_type"),
            "date": r["date"].isoformat() if r.get("date") and hasattr(r.get("date"), 'isoformat') else str(r.get("date")) if r.get("date") else None,
            "max_score": float(r["max_score"]) if r.get("max_score") else None,
            "subjects": {"name": r.get("subject_name"), "code": r.get("subject_code")},
            "terms": {"name": r.get("term_name")},
        })
    return {"items": formatted_results}


@router.post("/")
def create_assessment(
    assessment: AssessmentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Create a new assessment."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")

    # Build INSERT dynamically based on provided fields
    columns = ["id", "tenant_id", "subject_id", "name", "assessment_type", "date", "max_score", "created_at", "updated_at"]
    values = ["gen_random_uuid()", ":tenant_id", ":subject_id", ":name", ":type", ":date", ":max_score", "NOW()", "NOW()"]
    params = {
        "tenant_id": tenant_id,
        "subject_id": assessment.subject_id,
        "name": assessment.name,
        "type": assessment.type,
        "date": assessment.date,
        "max_score": assessment.max_score,
    }

    if assessment.term_id:
        columns.append("term_id")
        values.append(":term_id")
        params["term_id"] = assessment.term_id

    if assessment.weight is not None:
        columns.append("weight")
        values.append(":weight")
        params["weight"] = assessment.weight

    returning = ", ".join(columns)
    query_str = f"""
        INSERT INTO assessments ({", ".join(columns)})
        VALUES ({", ".join(values)})
        RETURNING {returning}
    """

    try:
        result = db.execute(text(query_str), params).mappings().first()
        db.commit()
        if result:
            return {
                "id": str(result["id"]),
                "tenant_id": str(result["tenant_id"]),
                "subject_id": str(result["subject_id"]),
                "term_id": str(result["term_id"]) if result.get("term_id") else None,
                "name": result["name"],
                "type": result.get("assessment_type"),
                "date": result["date"].isoformat() if hasattr(result.get("date", None), "isoformat") else str(result.get("date")),
                "max_score": float(result["max_score"]) if result.get("max_score") else None,
                "weight": float(result["weight"]) if result.get("weight") else None,
            }
        raise HTTPException(status_code=500, detail="Failed to create assessment")
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error creating assessment: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.delete("/{id}/")
def delete_assessment(
    id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete an assessment."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")

    try:
        query = text("DELETE FROM assessments WHERE id = :id AND tenant_id = :tenant_id")
        result = db.execute(query, {"id": str(id), "tenant_id": tenant_id})
        db.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Assessment not found")
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error deleting assessment: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to delete resource. Please try again.")


@router.put("/{id}/")
def update_assessment(
    id: UUID,
    assessment: AssessmentUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update an assessment."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")

    sets = []
    params = {"id": str(id), "tenant_id": tenant_id}

    field_map = {
        "subject_id": assessment.subject_id,
        "term_id": assessment.term_id,
        "name": assessment.name,
        "assessment_type": assessment.type,
        "date": assessment.date,
        "max_score": assessment.max_score,
        "weight": assessment.weight,
        "description": assessment.description,
        "class_id": assessment.class_id,
    }

    for col, val in field_map.items():
        if val is not None:
            sets.append(f"{col} = :{col}")
            params[col] = val

    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")

    sets.append("updated_at = NOW()")
    query_str = f"""
        UPDATE assessments SET {', '.join(sets)}
        WHERE id = :id AND tenant_id = :tenant_id
        RETURNING id, tenant_id, subject_id, term_id, academic_year_id,
                  name, assessment_type, date, max_score, weight, description, created_at, updated_at
    """

    try:
        result = db.execute(text(query_str), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Assessment not found")
        db.commit()
        return {
            "id": str(result["id"]),
            "tenant_id": str(result["tenant_id"]),
            "subject_id": str(result["subject_id"]) if result.get("subject_id") else None,
            "term_id": str(result["term_id"]) if result.get("term_id") else None,
            "academic_year_id": str(result["academic_year_id"]) if result.get("academic_year_id") else None,
            "name": result["name"],
            "type": result.get("assessment_type"),
            "date": result["date"].isoformat() if hasattr(result.get("date", None), "isoformat") else str(result.get("date")),
            "max_score": float(result["max_score"]) if result.get("max_score") else None,
            "weight": float(result["weight"]) if result.get("weight") else None,
            "description": result.get("description"),
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating assessment: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")
