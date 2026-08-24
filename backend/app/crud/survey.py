from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.survey import Survey, SurveyQuestion, SurveyResponse
from app.schemas.survey import (
    SurveyCreate, SurveyUpdate,
    SurveyQuestionCreate, SurveyQuestionUpdate,
    SurveyResponseSubmit,
)


# --- Surveys ---

def get_surveys(db: Session, tenant_id: UUID, page: int = 1, page_size: int = 200) -> List[Survey]:
    return (
        db.query(Survey)
        .filter(Survey.tenant_id == tenant_id)
        .order_by(Survey.created_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
        .all()
    )


def get_survey(db: Session, survey_id: UUID, tenant_id: UUID) -> Optional[Survey]:
    return db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == tenant_id).first()


def create_survey(db: Session, obj_in: SurveyCreate, tenant_id: UUID, created_by: Optional[UUID]) -> Survey:
    db_obj = Survey(**obj_in.model_dump(), tenant_id=tenant_id, created_by=created_by)
    db.add(db_obj)
    db.flush()
    return db_obj


def update_survey(db: Session, db_obj: Survey, obj_in: SurveyUpdate) -> Survey:
    for field, value in obj_in.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)
    db.flush()
    return db_obj


def delete_survey(db: Session, db_obj: Survey) -> None:
    db.query(SurveyResponse).filter(SurveyResponse.survey_id == db_obj.id).delete()
    db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == db_obj.id).delete()
    db.delete(db_obj)
    db.flush()


def get_response_counts(db: Session, tenant_id: UUID) -> Dict[str, int]:
    rows = (
        db.query(SurveyResponse.survey_id, func.count(SurveyResponse.id))
        .filter(SurveyResponse.tenant_id == tenant_id)
        .group_by(SurveyResponse.survey_id)
        .all()
    )
    return {str(survey_id): count for survey_id, count in rows}


# --- Questions ---

def get_questions(db: Session, survey_id: UUID, tenant_id: UUID) -> List[SurveyQuestion]:
    return (
        db.query(SurveyQuestion)
        .filter(SurveyQuestion.survey_id == survey_id, SurveyQuestion.tenant_id == tenant_id)
        .order_by(SurveyQuestion.order_index)
        .all()
    )


def get_question(db: Session, survey_id: UUID, question_id: UUID, tenant_id: UUID) -> Optional[SurveyQuestion]:
    return (
        db.query(SurveyQuestion)
        .filter(
            SurveyQuestion.id == question_id,
            SurveyQuestion.survey_id == survey_id,
            SurveyQuestion.tenant_id == tenant_id,
        )
        .first()
    )


def add_question(db: Session, survey_id: UUID, obj_in: SurveyQuestionCreate, tenant_id: UUID) -> SurveyQuestion:
    order_index = obj_in.order_index
    if order_index is None:
        max_order = (
            db.query(func.max(SurveyQuestion.order_index))
            .filter(SurveyQuestion.survey_id == survey_id, SurveyQuestion.tenant_id == tenant_id)
            .scalar()
        )
        order_index = (max_order + 1) if max_order is not None else 0

    db_obj = SurveyQuestion(
        tenant_id=tenant_id,
        survey_id=survey_id,
        question_text=obj_in.question_text,
        question_type=obj_in.question_type,
        options=obj_in.options,
        is_required=obj_in.is_required,
        order_index=order_index,
    )
    db.add(db_obj)
    db.flush()
    return db_obj


def update_question(db: Session, db_obj: SurveyQuestion, obj_in: SurveyQuestionUpdate) -> SurveyQuestion:
    for field, value in obj_in.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)
    db.flush()
    return db_obj


def delete_question(db: Session, db_obj: SurveyQuestion) -> None:
    db.delete(db_obj)
    db.flush()


# --- Responses ---
#
# BUG RÉEL CORRIGÉ (voir alembic/versions/20260823_0001_adopt_surveys_tables.py) :
# l'ancien code assumait une ligne survey_responses par QUESTION
# (question_id/response_text/submitted_by/submitted_at), alors que la
# vraie table n'a jamais eu que respondent_id + response_data JSONB — un
# blob unique par session de réponse. En plus de ça, `UUID()` sans
# argument levait un TypeError systématique avant même d'atteindre
# l'INSERT. Soumettre une réponse n'a donc jamais pu fonctionner.

def add_survey_response(
    db: Session, survey: Survey, obj_in: SurveyResponseSubmit, tenant_id: UUID, respondent_id: Optional[UUID],
) -> SurveyResponse:
    response_data = {answer.question_id: answer.response for answer in obj_in.responses}
    db_obj = SurveyResponse(
        tenant_id=tenant_id,
        survey_id=survey.id,
        # Un sondage anonyme ne doit jamais enregistrer qui a répondu,
        # même si l'appelant est authentifié.
        respondent_id=None if survey.is_anonymous else respondent_id,
        response_data=response_data,
    )
    db.add(db_obj)
    db.flush()
    return db_obj


def get_responses(db: Session, survey_id: UUID, tenant_id: UUID) -> List[SurveyResponse]:
    return (
        db.query(SurveyResponse)
        .filter(SurveyResponse.survey_id == survey_id, SurveyResponse.tenant_id == tenant_id)
        .all()
    )
