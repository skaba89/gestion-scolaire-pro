"""History-safe administration of regular and retake LMD sessions."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.cycle_scope import class_scope_clause, scoped_class_ids
from app.core.database import get_db
from app.core.security import require_permission
from app.core.tenant_refs import ensure_refs_in_tenant
from app.core.tenant_resolution import resolve_current_tenant_id
from app.models import Assessment, ExamSession
from app.schemas.academic import ExamSessionCreate, ExamSessionUpdate
from app.services.education_modules import record_configuration_audit

router = APIRouter()


def _tenant_id(request: Request, user: dict, db: Session) -> str:
    value = resolve_current_tenant_id(request, user, db)
    if not value:
        raise HTTPException(status_code=400, detail="Contexte établissement requis")
    return str(value)


def _payload(db: Session, session: ExamSession, assessment_count: int | None = None) -> dict:
    if assessment_count is None:
        assessment_count = db.query(func.count(Assessment.id)).filter(
            Assessment.tenant_id == session.tenant_id,
            Assessment.exam_session_id == session.id,
        ).scalar()
    return {
        "id": session.id, "tenant_id": session.tenant_id, "semester_id": session.semester_id,
        "code": session.code, "name": session.name, "session_type": session.session_type,
        "sequence": session.sequence, "starts_on": session.starts_on, "ends_on": session.ends_on,
        "status": session.status, "selection_policy": session.selection_policy,
        "revision": session.revision, "assessment_count": int(assessment_count or 0),
        "created_at": session.created_at, "updated_at": session.updated_at,
    }


@router.get("/")
def list_exam_sessions(
    request: Request,
    semester_id: UUID | None = None,
    session_type: Literal["REGULAR", "RETAKE"] | None = Query(default=None),
    db: Session = Depends(get_db),
    user: dict = Depends(require_permission("settings:read")),
):
    tid = _tenant_id(request, user, db)
    query = db.query(ExamSession).filter(ExamSession.tenant_id == tid)
    if semester_id:
        query = query.filter(ExamSession.semester_id == semester_id)
    if session_type:
        query = query.filter(ExamSession.session_type == session_type)
    sessions = query.order_by(ExamSession.semester_id, ExamSession.sequence, ExamSession.starts_on).all()
    counts_query = db.query(Assessment.exam_session_id, func.count(Assessment.id)).filter(
        Assessment.tenant_id == tid, Assessment.exam_session_id.is_not(None),
    )
    scope_class_ids = scoped_class_ids(db, tid, user)
    if scope_class_ids is not None:
        # Périmètre par cycle (B2c-1) : les sessions sont de la structure (semestre), visibles
        # en lecture ; le nombre d'évaluations ne compte que celles des classes du compte
        # (jamais un effectif d'établissement). Écritures : refusées (DENY, décision Q4).
        counts_query = counts_query.filter(class_scope_clause(Assessment.class_id, scope_class_ids))
    counts = dict(counts_query.group_by(Assessment.exam_session_id).all())
    return [_payload(db, item, counts.get(item.id, 0)) for item in sessions]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_exam_session(
    body: ExamSessionCreate, request: Request, db: Session = Depends(get_db),
    user: dict = Depends(require_permission("settings:write")),
):
    tid = _tenant_id(request, user, db)
    ensure_refs_in_tenant(db, tid, ("semesters", body.semester_id))
    if body.ends_on < body.starts_on:
        raise HTTPException(status_code=422, detail="La date de fin doit suivre la date de début")
    values = body.model_dump()
    values["code"] = body.code.strip().upper()
    values["name"] = body.name.strip()
    if not values["code"] or not values["name"]:
        raise HTTPException(status_code=422, detail="Le code et le nom sont obligatoires")
    session = ExamSession(tenant_id=tid, status="DRAFT", **values)
    db.add(session)
    try:
        db.flush()
        record_configuration_audit(
            db, user_id=user["id"], tenant_id=tid, action="CREATE_EXAM_SESSION",
            resource_type="EXAM_SESSION", resource_id=str(session.id),
            details={"code": session.code, "semester_id": str(session.semester_id),
                     "session_type": session.session_type, "status": session.status},
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ce code de session existe déjà")
    db.refresh(session)
    return _payload(db, session)


@router.patch("/{session_id}/")
def update_exam_session(
    session_id: UUID, body: ExamSessionUpdate, request: Request,
    db: Session = Depends(get_db),
    user: dict = Depends(require_permission("settings:write")),
):
    tid = _tenant_id(request, user, db)
    session = db.query(ExamSession).filter(
        ExamSession.id == session_id, ExamSession.tenant_id == tid,
    ).with_for_update().populate_existing().first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session d'examen introuvable")
    if session.revision != body.expected_revision:
        db.rollback()
        raise HTTPException(status_code=409, detail="Session modifiée ; rechargez avant de continuer")

    values = body.model_dump(exclude_unset=True, exclude={"expected_revision"})
    next_status = values.pop("status", None)
    if session.status == "CLOSED":
        raise HTTPException(status_code=409, detail="Une session clôturée est immuable")
    if session.status == "OPEN" and (values or next_status != "CLOSED"):
        raise HTTPException(status_code=409, detail="Une session ouverte peut uniquement être clôturée")
    if session.status == "DRAFT" and next_status not in (None, "OPEN"):
        raise HTTPException(status_code=409, detail="La session doit être ouverte avant sa clôture")

    if values.get("semester_id"):
        ensure_refs_in_tenant(db, tid, ("semesters", values["semester_id"]))
    has_assessments = db.query(Assessment.id).filter(
        Assessment.tenant_id == tid, Assessment.exam_session_id == session.id,
    ).first() is not None
    if has_assessments and ({"semester_id", "session_type"} & set(values)):
        raise HTTPException(status_code=409, detail="Le semestre et le type sont figés après rattachement d'une évaluation")

    starts_on = values.get("starts_on", session.starts_on)
    ends_on = values.get("ends_on", session.ends_on)
    if ends_on < starts_on:
        raise HTTPException(status_code=422, detail="La date de fin doit suivre la date de début")
    if "code" in values:
        values["code"] = values["code"].strip().upper()
    if "name" in values:
        values["name"] = values["name"].strip()
    if ("code" in values and not values["code"]) or ("name" in values and not values["name"]):
        raise HTTPException(status_code=422, detail="Le code et le nom sont obligatoires")
    if not values and next_status is None:
        raise HTTPException(status_code=400, detail="Aucune modification demandée")

    previous_status, previous_revision = session.status, session.revision
    for key, value in values.items():
        setattr(session, key, value)
    if next_status:
        session.status = next_status
    session.revision += 1
    try:
        record_configuration_audit(
            db, user_id=user["id"], tenant_id=tid, action="UPDATE_EXAM_SESSION",
            resource_type="EXAM_SESSION", resource_id=str(session.id),
            details={"previous_revision": previous_revision, "revision": session.revision,
                     "previous_status": previous_status, "status": session.status,
                     "fields": sorted([*values, *(("status",) if next_status else ())]),
                     "history_preserved": True},
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ce code de session existe déjà")
    db.refresh(session)
    return _payload(db, session)
