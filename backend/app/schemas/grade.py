"""Grade schemas for request/response validation"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, UUID4, model_validator


# Base schema — aligned with the Grade SQLAlchemy model
class GradeBase(BaseModel):
    student_id: UUID4
    subject_id: Optional[UUID4] = None
    assessment_id: Optional[UUID4] = None
    score: float = Field(..., ge=0)
    max_score: float = Field(default=20.0, gt=0)
    coefficient: float = Field(default=1.0, gt=0)
    comments: Optional[str] = Field(None, max_length=500)

    # BUSINESS-RULE FIX (institutional-readiness audit, 2026-09): score and
    # max_score were each bounded independently (score >= 0, max_score > 0)
    # but never against each other — a score of 95 with max_score=20 was
    # silently accepted, producing a >100% grade that corrupts every
    # average/transcript calculation downstream.
    @model_validator(mode="after")
    def _score_within_max(self):
        if self.score > self.max_score:
            raise ValueError(
                f"Le score ({self.score}) ne peut pas dépasser le barème ({self.max_score})"
            )
        return self


# Schema for creating a grade
class GradeCreate(GradeBase):
    pass


# Schema for updating a grade
class GradeUpdate(BaseModel):
    student_id: Optional[UUID4] = None
    subject_id: Optional[UUID4] = None
    assessment_id: Optional[UUID4] = None
    score: Optional[float] = Field(None, ge=0)
    max_score: Optional[float] = Field(None, gt=0)
    coefficient: Optional[float] = Field(None, gt=0)
    comments: Optional[str] = Field(None, max_length=500)

    # Same cross-field rule as GradeBase, applied only when both fields are
    # present in this partial update — a lone score/max_score update is
    # still checked against the existing DB row by crud.update_grade().
    @model_validator(mode="after")
    def _score_within_max(self):
        if self.score is not None and self.max_score is not None and self.score > self.max_score:
            raise ValueError(
                f"Le score ({self.score}) ne peut pas dépasser le barème ({self.max_score})"
            )
        return self


# Schema for grade in database (response)
class Grade(BaseModel):
    id: UUID4
    tenant_id: UUID4
    student_id: UUID4
    subject_id: Optional[UUID4] = None
    assessment_id: Optional[UUID4] = None
    score: float
    max_score: float
    coefficient: float
    comments: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Computed fields
    percentage: float = 0.0
    weighted_score: float = 0.0

    class Config:
        from_attributes = True


# Schema for list response
class GradeList(BaseModel):
    items: list[Grade]
    total: int
    page: int
    page_size: int
    pages: int
