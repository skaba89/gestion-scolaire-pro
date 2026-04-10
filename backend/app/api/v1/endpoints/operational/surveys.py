import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime, timezone
import json

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit

router = APIRouter()
logger = logging.getLogger(__name__)


# --- Schemas ---

class QuestionCreate(BaseModel):
    question_text: str
    question_type: str = "TEXT"
    options: Optional[List[str]] = None
    is_required: bool = True
    order_index: Optional[int] = None


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[List[str]] = None
    is_required: Optional[bool] = None
    order_index: Optional[int] = None


class SubmitResponse(BaseModel):
    responses: List[Dict[str, Any]]


# --- Existing endpoints ---

@router.get("/")
def list_surveys(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    rows = db.execute(text("""
        SELECT s.*, p.first_name, p.last_name
        FROM surveys s
        LEFT JOIN profiles p ON p.id = s.created_by
        WHERE s.tenant_id = :tid
        ORDER BY s.created_at DESC
    """), {"tid": tenant_id}).mappings().all()
    return rows


@router.get("/{survey_id}/questions/")
def list_survey_questions(survey_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return []
    rows = db.execute(text("""
        SELECT * FROM survey_questions
        WHERE survey_id = :sid AND tenant_id = :tid
        ORDER BY order_index
    """), {"sid": str(survey_id), "tid": tenant_id}).mappings().all()
    return rows


@router.get("/response-counts/")
def get_survey_response_counts(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return {}
    rows = db.execute(text("""
        SELECT survey_id, COUNT(*) as count
        FROM survey_responses
        WHERE tenant_id = :tid
        GROUP BY survey_id
    """), {"tid": tenant_id}).mappings().all()
    return {str(r["survey_id"]): r["count"] for r in rows}


@router.post("/")
def create_survey(survey_data: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not survey_data.get("title"):
        raise HTTPException(status_code=400, detail="Title is required")
    survey_id = db.execute(text("""
        INSERT INTO surveys (tenant_id, title, description, target_audience, is_anonymous, is_active, starts_at, ends_at, created_by, created_at)
        VALUES (:tid, :title, :desc, :audience, :anon, :active, :starts, :ends, :uid, NOW())
        RETURNING id
    """), {
        "tid": tenant_id, "title": survey_data["title"], "desc": survey_data.get("description"),
        "audience": survey_data.get("target_audience", "ALL"), "anon": survey_data.get("is_anonymous", False),
        "active": survey_data.get("is_active", True), "starts": survey_data.get("starts_at"),
        "ends": survey_data.get("ends_at"), "uid": user_id
    }).scalar()
    db.commit()
    return {"id": str(survey_id)}


@router.patch("/{survey_id}/")
def update_survey(survey_id: UUID, survey_data: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    db.execute(text("""
        UPDATE surveys SET
            title = :title, description = :desc, target_audience = :audience,
            is_anonymous = :anon, is_active = :active, starts_at = :starts, ends_at = :ends
        WHERE id = :sid AND tenant_id = :tid
    """), {
        "sid": str(survey_id), "tid": tenant_id,
        "title": survey_data["title"], "desc": survey_data.get("description"),
        "audience": survey_data.get("target_audience", "ALL"), "anon": survey_data.get("is_anonymous", False),
        "active": survey_data.get("is_active", True), "starts": survey_data.get("starts_at"),
        "ends": survey_data.get("ends_at")
    })
    db.commit()
    return {"status": "ok"}


@router.delete("/{survey_id}/")
def delete_survey(survey_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    db.execute(text("DELETE FROM surveys WHERE id = :sid AND tenant_id = :tid"), {"sid": str(survey_id), "tid": tenant_id})
    db.commit()
    return {"status": "ok"}


# --- Question CRUD ---

@router.post("/{survey_id}/questions/", status_code=status.HTTP_201_CREATED)
def add_survey_question(
    survey_id: UUID,
    question: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Add a question to a survey."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        # Get next order_index if not provided
        if question.order_index is None:
            max_order = db.execute(text("""
                SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
                FROM survey_questions WHERE survey_id = :sid AND tenant_id = :tid
            """), {"sid": str(survey_id), "tid": tenant_id}).scalar()
            question.order_index = max_order

        result = db.execute(text("""
            INSERT INTO survey_questions (id, tenant_id, survey_id, question_text, question_type,
                                         options, is_required, order_index, created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :sid, :qtext, :qtype, :opts::jsonb, :req, :order, NOW(), NOW())
            RETURNING id, tenant_id, survey_id, question_text, question_type, options, is_required, order_index, created_at, updated_at
        """), {
            "tid": tenant_id, "sid": str(survey_id),
            "qtext": question.question_text, "qtype": question.question_type,
            "opts": json.dumps(question.options) if question.options else None,
            "req": question.is_required, "order": question.order_index,
        }).mappings().first()

        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="ADD_SURVEY_QUESTION", resource_type="SURVEY_QUESTION",
                  resource_id=str(result["id"]))
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        logger.error("Error adding survey question: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.put("/{survey_id}/questions/{qid}/")
def update_survey_question(
    survey_id: UUID,
    qid: UUID,
    question: QuestionUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a survey question."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        sets = []
        params = {"qid": str(qid), "sid": str(survey_id), "tid": tenant_id}
        if question.question_text is not None:
            sets.append("question_text = :qtext")
            params["qtext"] = question.question_text
        if question.question_type is not None:
            sets.append("question_type = :qtype")
            params["qtype"] = question.question_type
        if question.options is not None:
            sets.append("options = :opts::jsonb")
            params["opts"] = json.dumps(question.options)
        if question.is_required is not None:
            sets.append("is_required = :req")
            params["req"] = question.is_required
        if question.order_index is not None:
            sets.append("order_index = :order")
            params["order"] = question.order_index
        if not sets:
            raise HTTPException(status_code=400, detail="No fields to update")
        sets.append("updated_at = NOW()")
        query_str = f"""
            UPDATE survey_questions SET {', '.join(sets)}
            WHERE id = :qid AND survey_id = :sid AND tenant_id = :tid
            RETURNING id, tenant_id, survey_id, question_text, question_type, options, is_required, order_index, created_at, updated_at
        """
        result = db.execute(text(query_str), params).mappings().first()
        if not result:
            raise HTTPException(status_code=404, detail="Question not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_SURVEY_QUESTION", resource_type="SURVEY_QUESTION",
                  resource_id=str(qid))
        db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating survey question: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


@router.delete("/{survey_id}/questions/{qid}/")
def delete_survey_question(
    survey_id: UUID,
    qid: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a survey question."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        result = db.execute(text("""
            DELETE FROM survey_questions WHERE id = :qid AND survey_id = :sid AND tenant_id = :tid
        """), {"qid": str(qid), "sid": str(survey_id), "tid": tenant_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Question not found")
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_SURVEY_QUESTION", resource_type="SURVEY_QUESTION",
                  resource_id=str(qid))
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error deleting survey question: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to delete resource. Please try again.")


# --- Response Submission ---

@router.post("/{survey_id}/submit/", status_code=status.HTTP_201_CREATED)
def submit_survey_response(
    survey_id: UUID,
    submission: SubmitResponse,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Submit responses to a survey."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    try:
        # Check survey is active
        survey = db.execute(text("""
            SELECT id, is_active FROM surveys WHERE id = :sid AND tenant_id = :tid
        """), {"sid": str(survey_id), "tid": tenant_id}).mappings().first()
        if not survey:
            raise HTTPException(status_code=404, detail="Survey not found")
        if not survey["is_active"]:
            raise HTTPException(status_code=400, detail="Survey is not active")

        response_id = str(UUID())
        submitted_at = datetime.now(timezone.utc).isoformat()

        for resp in submission.responses:
            db.execute(text("""
                INSERT INTO survey_responses (id, tenant_id, survey_id, question_id, response_text, submitted_by, submitted_at)
                VALUES (gen_random_uuid(), :tid, :sid, :qid, :resp, :uid, :now)
            """), {
                "tid": tenant_id, "sid": str(survey_id),
                "qid": resp.get("question_id"),
                "resp": resp.get("response") if not isinstance(resp.get("response"), (list, dict)) else json.dumps(resp.get("response")),
                "uid": current_user.get("id"),
                "now": submitted_at,
            })

        db.commit()
        return {"id": response_id, "submitted_at": submitted_at, "status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error submitting survey response: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")


# --- Survey Results ---

@router.get("/{survey_id}/results/")
def get_survey_results(
    survey_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get aggregated results for a survey."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return {"questions": [], "total_responses": 0}
    try:
        survey = db.execute(text("""
            SELECT id, title, is_anonymous FROM surveys WHERE id = :sid AND tenant_id = :tid
        """), {"sid": str(survey_id), "tid": tenant_id}).mappings().first()
        if not survey:
            raise HTTPException(status_code=404, detail="Survey not found")

        # Get questions
        questions = [dict(r) for r in db.execute(text("""
            SELECT * FROM survey_questions WHERE survey_id = :sid AND tenant_id = :tid ORDER BY order_index
        """), {"sid": str(survey_id), "tid": tenant_id}).mappings().all()]

        # Get response counts per question
        response_counts = {}
        count_rows = db.execute(text("""
            SELECT question_id, COUNT(*) as count
            FROM survey_responses WHERE survey_id = :sid AND tenant_id = :tid
            GROUP BY question_id
        """), {"sid": str(survey_id), "tid": tenant_id}).mappings().all()
        for cr in count_rows:
            response_counts[str(cr["question_id"])] = cr["count"]

        # Get individual responses for each question
        results = []
        for q in questions:
            qid = str(q["id"])
            responses = [dict(r) for r in db.execute(text("""
                SELECT response_text FROM survey_responses
                WHERE survey_id = :sid AND question_id = :qid AND tenant_id = :tid
            """), {"sid": str(survey_id), "qid": qid, "tid": tenant_id}).mappings().all()]

            # Parse options for choice-type questions
            options = q.get("options")
            if isinstance(options, str):
                try:
                    options = json.loads(options)
                except Exception:
                    options = None

            result_entry = {
                "question_id": qid,
                "question_text": q["question_text"],
                "question_type": q["question_type"],
                "options": options,
                "response_count": response_counts.get(qid, 0),
                "responses": [r["response_text"] for r in responses],
            }

            # Calculate distribution for choice/rating questions
            if options and q["question_type"] in ("SINGLE_CHOICE", "MULTIPLE_CHOICE", "RATING"):
                distribution = {}
                for r in responses:
                    val = r["response_text"]
                    if val:
                        distribution[val] = distribution.get(val, 0) + 1
                result_entry["distribution"] = distribution

            results.append(result_entry)

        total = db.execute(text("""
            SELECT COUNT(DISTINCT submitted_by) as total
            FROM survey_responses WHERE survey_id = :sid AND tenant_id = :tid
        """), {"sid": str(survey_id), "tid": tenant_id}).scalar() or 0

        return {"survey_id": str(survey_id), "title": survey["title"], "is_anonymous": survey["is_anonymous"],
                "total_responses": total, "questions": results}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error fetching survey results: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")
