from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter()

@router.get("/")
def list_surveys(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
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
    tenant_id = current_user["tenant_id"]
    rows = db.execute(text("""
        SELECT * FROM survey_questions 
        WHERE survey_id = :sid AND tenant_id = :tid
        ORDER BY order_index
    """), {"sid": str(survey_id), "tid": tenant_id}).mappings().all()
    return rows

@router.get("/response-counts/")
def get_survey_response_counts(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    rows = db.execute(text("""
        SELECT survey_id, COUNT(*) as count
        FROM survey_responses
        WHERE tenant_id = :tid
        GROUP BY survey_id
    """), {"tid": tenant_id}).mappings().all()
    return {str(r["survey_id"]): r["count"] for r in rows}

@router.post("/")
def create_survey(survey_data: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tenant_id = current_user["tenant_id"]
    user_id = current_user["id"]
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
    tenant_id = current_user["tenant_id"]
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
    tenant_id = current_user["tenant_id"]
    db.execute(text("DELETE FROM surveys WHERE id = :sid AND tenant_id = :tid"), {"sid": str(survey_id), "tid": tenant_id})
    db.commit()
    return {"status": "ok"}
