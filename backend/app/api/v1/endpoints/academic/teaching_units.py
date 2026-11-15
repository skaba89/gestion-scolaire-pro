"""Tenant-isolated LMD teaching units (UE); existing subjects are ECUEs."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.core.tenant_refs import ensure_refs_in_tenant
from app.core.tenant_resolution import resolve_current_tenant_id
from app.models import Subject, TeachingUnit
from app.schemas.academic import TeachingUnitCreate, TeachingUnitUpdate
from app.services.education_modules import record_configuration_audit

router = APIRouter()


def _tenant_id(request: Request, user: dict, db: Session) -> str:
    value = resolve_current_tenant_id(request, user, db)
    if not value:
        raise HTTPException(status_code=400, detail="Contexte établissement requis")
    return str(value)


def _payload(db: Session, unit: TeachingUnit, summary=None) -> dict:
    count, assigned = summary or db.query(
        func.count(Subject.id), func.coalesce(func.sum(Subject.ects), 0.0),
    ).filter(Subject.tenant_id == unit.tenant_id, Subject.teaching_unit_id == unit.id).one()
    assigned = float(assigned or 0)
    return {
        "id": unit.id, "tenant_id": unit.tenant_id, "semester_id": unit.semester_id,
        "code": unit.code, "name": unit.name, "ects": unit.ects,
        "is_active": unit.is_active, "revision": unit.revision,
        "subject_count": int(count), "assigned_ects": assigned,
        "ects_consistent": int(count) > 0 and abs(assigned - float(unit.ects)) < 0.000001,
        "created_at": unit.created_at, "updated_at": unit.updated_at,
    }


@router.get("/")
def list_teaching_units(request: Request, db: Session = Depends(get_db),
                        user: dict = Depends(require_permission("settings:read"))):
    tid = _tenant_id(request, user, db)
    units = db.query(TeachingUnit).filter(TeachingUnit.tenant_id == tid).order_by(
        TeachingUnit.semester_id, TeachingUnit.code,
    ).all()
    summaries = {
        unit_id: (count, assigned)
        for unit_id, count, assigned in db.query(
            Subject.teaching_unit_id, func.count(Subject.id), func.coalesce(func.sum(Subject.ects), 0.0),
        ).filter(
            Subject.tenant_id == tid, Subject.teaching_unit_id.is_not(None),
        ).group_by(Subject.teaching_unit_id).all()
    }
    return [_payload(db, unit, summaries.get(unit.id, (0, 0.0))) for unit in units]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_teaching_unit(body: TeachingUnitCreate, request: Request, db: Session = Depends(get_db),
                         user: dict = Depends(require_permission("subjects:write"))):
    tid = _tenant_id(request, user, db)
    if body.ects < 0:
        raise HTTPException(status_code=422, detail="Les crédits ECTS ne peuvent pas être négatifs")
    ensure_refs_in_tenant(db, tid, ("semesters", body.semester_id))
    values = body.model_dump()
    values["code"] = body.code.strip().upper()
    values["name"] = body.name.strip()
    if not values["code"] or not values["name"]:
        raise HTTPException(status_code=422, detail="Le code et le nom sont obligatoires")
    unit = TeachingUnit(tenant_id=tid, **values)
    db.add(unit)
    try:
        db.flush()
        record_configuration_audit(
            db, user_id=user["id"], tenant_id=tid, action="CREATE_TEACHING_UNIT",
            resource_type="TEACHING_UNIT", resource_id=str(unit.id),
            details={"code": unit.code, "semester_id": str(unit.semester_id), "ects": unit.ects},
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ce code d'unité d'enseignement existe déjà")
    db.refresh(unit)
    return _payload(db, unit)


@router.patch("/{unit_id}/")
def update_teaching_unit(unit_id: UUID, body: TeachingUnitUpdate, request: Request,
                         db: Session = Depends(get_db),
                         user: dict = Depends(require_permission("subjects:write"))):
    tid = _tenant_id(request, user, db)
    unit = db.query(TeachingUnit).filter(
        TeachingUnit.id == unit_id, TeachingUnit.tenant_id == tid,
    ).with_for_update().populate_existing().first()
    if unit is None:
        raise HTTPException(status_code=404, detail="Unité d'enseignement introuvable")
    if unit.revision != body.expected_revision:
        db.rollback()
        raise HTTPException(status_code=409, detail="Unité modifiée ; rechargez avant de continuer")
    values = body.model_dump(exclude_unset=True, exclude={"expected_revision"})
    if values.get("ects", unit.ects) < 0:
        raise HTTPException(status_code=422, detail="Les crédits ECTS ne peuvent pas être négatifs")
    semester_id = values.get("semester_id")
    if semester_id:
        ensure_refs_in_tenant(db, tid, ("semesters", semester_id))
        mismatch = db.query(Subject.id).filter(
            Subject.tenant_id == tid, Subject.teaching_unit_id == unit.id,
            or_(Subject.semester_id.is_(None), Subject.semester_id != semester_id),
        ).first()
        if mismatch:
            raise HTTPException(status_code=409, detail="Réaffectez les ECUE avant de changer le semestre de l'UE")
    if "code" in values:
        values["code"] = values["code"].strip().upper()
    if "name" in values:
        values["name"] = values["name"].strip()
    if ("code" in values and not values["code"]) or ("name" in values and not values["name"]):
        raise HTTPException(status_code=422, detail="Le code et le nom sont obligatoires")
    previous_revision = unit.revision
    for key, value in values.items():
        setattr(unit, key, value)
    unit.revision += 1
    try:
        record_configuration_audit(
            db, user_id=user["id"], tenant_id=tid, action="UPDATE_TEACHING_UNIT",
            resource_type="TEACHING_UNIT", resource_id=str(unit.id),
            details={"previous_revision": previous_revision, "revision": unit.revision,
                     "fields": sorted(values), "history_preserved": True},
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ce code d'unité d'enseignement existe déjà")
    db.refresh(unit)
    return _payload(db, unit)
