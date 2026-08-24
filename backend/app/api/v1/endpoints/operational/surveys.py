import logging
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from typing import Dict, List
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.utils.audit import log_audit
from app.crud import survey as crud_survey
from app.schemas.survey import (
    SurveyCreate, SurveyUpdate, SurveyOut,
    SurveyQuestionCreate, SurveyQuestionUpdate, SurveyQuestionOut,
    SurveyResponseSubmit,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _require_tenant(request: Request, current_user: dict, db: Session) -> UUID:
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant context")
    return tenant_id


# --- Surveys CRUD ---

@router.get("/", response_model=List[SurveyOut])
def list_surveys(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        return []
    return crud_survey.get_surveys(db, tenant_id, page=page, page_size=page_size)


@router.get("/response-counts/", response_model=Dict[str, int])
def get_survey_response_counts(
    request: Request, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user),
):
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        return {}
    return crud_survey.get_response_counts(db, tenant_id)


@router.get("/{survey_id}/questions/", response_model=List[SurveyQuestionOut])
def list_survey_questions(
    request: Request, survey_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user),
):
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    if not tenant_id:
        return []
    return crud_survey.get_questions(db, survey_id, tenant_id)


@router.post("/", response_model=SurveyOut, status_code=status.HTTP_201_CREATED)
def create_survey(
    request: Request,
    survey: SurveyCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = _require_tenant(request, current_user, db)
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        db_obj = crud_survey.create_survey(db, survey, tenant_id, created_by=user_id)
        log_audit(db, user_id=user_id, tenant_id=tenant_id,
                  action="CREATE_SURVEY", resource_type="SURVEY", resource_id=str(db_obj.id))
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception as e:
        db.rollback()
        logger.error("Error creating survey: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.patch("/{survey_id}/", response_model=SurveyOut)
def update_survey(
    request: Request,
    survey_id: UUID,
    survey: SurveyUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = _require_tenant(request, current_user, db)
    try:
        db_obj = crud_survey.get_survey(db, survey_id, tenant_id)
        if not db_obj:
            raise HTTPException(status_code=404, detail="Survey not found")
        db_obj = crud_survey.update_survey(db, db_obj, survey)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_SURVEY", resource_type="SURVEY", resource_id=str(survey_id))
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating survey: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


@router.delete("/{survey_id}/")
def delete_survey(
    request: Request, survey_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user),
):
    tenant_id = _require_tenant(request, current_user, db)
    try:
        db_obj = crud_survey.get_survey(db, survey_id, tenant_id)
        if not db_obj:
            raise HTTPException(status_code=404, detail="Survey not found")
        crud_survey.delete_survey(db, db_obj)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_SURVEY", resource_type="SURVEY", resource_id=str(survey_id))
        db.commit()
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error deleting survey: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to delete resource. Please try again.")


# --- Question CRUD ---

@router.post("/{survey_id}/questions/", response_model=SurveyQuestionOut, status_code=status.HTTP_201_CREATED)
def add_survey_question(
    request: Request,
    survey_id: UUID,
    question: SurveyQuestionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Add a question to a survey."""
    tenant_id = _require_tenant(request, current_user, db)
    if not crud_survey.get_survey(db, survey_id, tenant_id):
        raise HTTPException(status_code=404, detail="Survey not found")
    try:
        db_obj = crud_survey.add_question(db, survey_id, question, tenant_id)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="ADD_SURVEY_QUESTION", resource_type="SURVEY_QUESTION",
                  resource_id=str(db_obj.id))
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception as e:
        db.rollback()
        logger.error("Error adding survey question: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create resource. Please check your input and try again.")


@router.put("/{survey_id}/questions/{qid}/", response_model=SurveyQuestionOut)
def update_survey_question(
    request: Request,
    survey_id: UUID,
    qid: UUID,
    question: SurveyQuestionUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Update a survey question."""
    tenant_id = _require_tenant(request, current_user, db)
    if not question.model_dump(exclude_unset=True):
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        db_obj = crud_survey.get_question(db, survey_id, qid, tenant_id)
        if not db_obj:
            raise HTTPException(status_code=404, detail="Question not found")
        db_obj = crud_survey.update_question(db, db_obj, question)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="UPDATE_SURVEY_QUESTION", resource_type="SURVEY_QUESTION", resource_id=str(qid))
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error updating survey question: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to update resource. Please check your input and try again.")


@router.delete("/{survey_id}/questions/{qid}/")
def delete_survey_question(
    request: Request, survey_id: UUID, qid: UUID, db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """Delete a survey question."""
    tenant_id = _require_tenant(request, current_user, db)
    try:
        db_obj = crud_survey.get_question(db, survey_id, qid, tenant_id)
        if not db_obj:
            raise HTTPException(status_code=404, detail="Question not found")
        crud_survey.delete_question(db, db_obj)
        log_audit(db, user_id=current_user.get("id"), tenant_id=tenant_id,
                  action="DELETE_SURVEY_QUESTION", resource_type="SURVEY_QUESTION", resource_id=str(qid))
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
    request: Request,
    survey_id: UUID,
    submission: SurveyResponseSubmit,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Submit responses to a survey.

    BUG RÉEL CORRIGÉ en migrant vers l'ORM : cet endpoint appelait
    `UUID()` sans argument (TypeError systématique) et, même sans ce
    bug, tentait d'insérer des colonnes qui n'existent pas sur la vraie
    table survey_responses (question_id/response_text/submitted_by —
    la vraie table n'a que respondent_id + response_data JSONB, un blob
    par session de réponse). Soumettre une réponse n'a donc
    probablement jamais fonctionné. Voir crud/survey.py::add_survey_response
    et alembic/versions/20260823_0001_adopt_surveys_tables.py.
    """
    tenant_id = _require_tenant(request, current_user, db)
    try:
        survey = crud_survey.get_survey(db, survey_id, tenant_id)
        if not survey:
            raise HTTPException(status_code=404, detail="Survey not found")
        if not survey.is_active:
            raise HTTPException(status_code=400, detail="Survey is not active")

        db_obj = crud_survey.add_survey_response(
            db, survey, submission, tenant_id, respondent_id=current_user.get("id"),
        )
        db.commit()
        return {"id": str(db_obj.id), "submitted_at": db_obj.created_at.isoformat(), "status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Error submitting survey response: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Operation failed. Please try again.")


# --- Survey Results ---

@router.get("/{survey_id}/results/")
def get_survey_results(
    request: Request,
    survey_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """Get aggregated results for a survey.

    Réécrit pour lire response_data (JSONB, un blob par soumission)
    plutôt que des colonnes question_id/response_text qui n'ont jamais
    existé sur la vraie table — voir submit_survey_response ci-dessus.
    """
    tenant_id = _require_tenant(request, current_user, db)
    survey = crud_survey.get_survey(db, survey_id, tenant_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    questions = crud_survey.get_questions(db, survey_id, tenant_id)
    responses = crud_survey.get_responses(db, survey_id, tenant_id)

    results = []
    for q in questions:
        qid = str(q.id)
        answers = [r.response_data.get(qid) for r in responses if qid in r.response_data]

        result_entry = {
            "question_id": qid,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "options": q.options,
            "response_count": len(answers),
            "responses": answers,
        }

        if q.options and q.question_type in ("SINGLE_CHOICE", "MULTIPLE_CHOICE", "RATING"):
            distribution: Dict[str, int] = dict(Counter(a for a in answers if a))
            result_entry["distribution"] = distribution

        results.append(result_entry)

    respondent_ids = {str(r.respondent_id) for r in responses if r.respondent_id}
    # Sondages anonymes : jamais de respondent_id, donc pas de dédoublonnage
    # possible par personne — compter chaque soumission comme une réponse.
    total = len(responses) if survey.is_anonymous else (len(respondent_ids) or len(responses))

    return {
        "survey_id": str(survey_id), "title": survey.title, "is_anonymous": survey.is_anonymous,
        "total_responses": total, "questions": results,
    }
