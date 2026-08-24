from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel


class SurveyCreate(BaseModel):
    title: str
    description: Optional[str] = None
    target_audience: str = "ALL"
    is_anonymous: bool = False
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class SurveyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_audience: Optional[str] = None
    is_anonymous: Optional[bool] = None
    is_active: Optional[bool] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class SurveyOut(BaseModel):
    id: UUID
    tenant_id: UUID
    title: str
    description: Optional[str] = None
    target_audience: Optional[str] = None
    is_anonymous: bool
    is_active: bool
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SurveyQuestionCreate(BaseModel):
    question_text: str
    question_type: str = "TEXT"
    options: Optional[List[str]] = None
    is_required: bool = True
    order_index: Optional[int] = None


class SurveyQuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[List[str]] = None
    is_required: Optional[bool] = None
    order_index: Optional[int] = None


class SurveyQuestionOut(BaseModel):
    id: UUID
    tenant_id: UUID
    survey_id: UUID
    question_text: str
    question_type: str
    options: Optional[List[str]] = None
    order_index: int
    is_required: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SurveyAnswer(BaseModel):
    """One answered question within a submission — matches what the
    frontend already sends (see SubmitResponse.responses previously)."""
    question_id: str
    response: Any = None


class SurveyResponseSubmit(BaseModel):
    responses: List[SurveyAnswer]


class SurveyResponseOut(BaseModel):
    id: UUID
    tenant_id: UUID
    survey_id: UUID
    respondent_id: Optional[UUID] = None
    response_data: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True
