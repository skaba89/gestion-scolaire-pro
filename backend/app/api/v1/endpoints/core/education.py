"""Tenant-owned education module and pedagogical-cycle configuration."""
import re
from typing import Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.education_catalog import (
    InvalidModuleConfiguration,
    catalog_payload,
    resolve_modules,
    validate_institution_type,
)
from app.core.security import get_current_user, require_permission
from app.core.tenant_resolution import resolve_current_tenant_id, enter_tenant_context_or_404
from app.models import EducationConfiguration, EducationCycle, Level, Tenant
from app.services.education_modules import configuration_payload, current_configuration, record_configuration_audit

router = APIRouter()


class ConfigurationChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile_id: str
    overrides: Dict[str, StrictBool] = Field(default_factory=dict)
    expected_revision: int = Field(ge=0, strict=True)


class CycleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    institution_type: str
    period_type: str
    order_index: int = Field(default=0, ge=0, le=10_000)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        value = value.strip().upper()
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]*", value):
            raise ValueError("Le code accepte uniquement A-Z, 0-9, _ et -")
        return value

    @field_validator("name", "institution_type", "period_type")
    @classmethod
    def strip_value(cls, value: str) -> str:
        return value.strip()


class CycleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1, strict=True)
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    institution_type: Optional[str] = None
    period_type: Optional[str] = None
    order_index: Optional[int] = Field(default=None, ge=0, le=10_000)
    is_active: Optional[StrictBool] = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: Optional[str]) -> Optional[str]:
        return CycleCreate.normalize_code(value) if value is not None else None

    @field_validator("name", "institution_type", "period_type")
    @classmethod
    def strip_value(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else None


class CycleLevelAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1, strict=True)
    level_ids: List[UUID] = Field(default_factory=list, max_length=500)


def _tenant(request: Request, db: Session, user: dict, *, lock: bool = False) -> Tenant:
    tid = resolve_current_tenant_id(request, user, db)
    query = db.query(Tenant).filter(Tenant.id == tid)
    tenant = (query.with_for_update().populate_existing() if lock else query).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Établissement introuvable")
    enter_tenant_context_or_404(db, tenant.id)
    return tenant


def _manager(user: dict) -> None:
    if not set(user.get("roles") or []) & {"SUPER_ADMIN", "TENANT_ADMIN"}:
        raise HTTPException(status_code=403, detail="Configuration réservée à l'administrateur de l'établissement")


def _choice(body: ConfigurationChoice):
    try:
        return resolve_modules(body.profile_id, body.overrides)
    except InvalidModuleConfiguration as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _validate_cycle_values(institution_type: str, period_type: str) -> None:
    try:
        validate_institution_type(institution_type)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if institution_type == "mixed":
        raise HTTPException(status_code=422, detail="Un cycle doit avoir un type concret, pas le profil mixte")
    if period_type not in {"TRIMESTER", "SEMESTER", "CUSTOM"}:
        raise HTTPException(status_code=422, detail="Périodicité invalide : TRIMESTER, SEMESTER ou CUSTOM")


def _cycle_payload(db: Session, cycle: EducationCycle) -> dict:
    level_ids = [str(value) for (value,) in (
        db.query(Level.id)
        .filter(Level.tenant_id == cycle.tenant_id, Level.cycle_id == cycle.id)
        .order_by(Level.order_index, Level.name)
        .all()
    )]
    return {
        "id": str(cycle.id),
        "tenant_id": str(cycle.tenant_id),
        "code": cycle.code,
        "name": cycle.name,
        "institution_type": cycle.institution_type,
        "period_type": cycle.period_type,
        "order_index": cycle.order_index,
        "is_active": cycle.is_active,
        "revision": cycle.revision,
        "level_ids": level_ids,
        "created_at": cycle.created_at,
        "updated_at": cycle.updated_at,
        # Resource-level cycle permissions are a later, separately verified
        # layer. Never imply they exist merely because cycle metadata exists.
        "cycle_policy_available": False,
    }


def _locked_cycle(db: Session, tenant: Tenant, cycle_id: UUID) -> EducationCycle:
    cycle = (
        db.query(EducationCycle)
        .filter(EducationCycle.tenant_id == tenant.id, EducationCycle.id == cycle_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if cycle is None:
        raise HTTPException(status_code=404, detail="Cycle introuvable")
    return cycle


@router.get("/catalog/")
def read_catalog(user: dict = Depends(get_current_user)):
    return catalog_payload()


@router.get("/configuration/")
def read_configuration(request: Request, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    return configuration_payload(db, _tenant(request, db, user))


@router.post("/preview/")
def preview_configuration(body: ConfigurationChoice, request: Request, db: Session = Depends(get_db),
                          user: dict = Depends(require_permission("settings:write"))):
    _manager(user)
    enabled = _choice(body)
    tenant = _tenant(request, db, user)
    current = configuration_payload(db, tenant)
    if body.expected_revision != current["revision"]:
        raise HTTPException(status_code=409, detail="Configuration modifiée ; rechargez avant de continuer")
    previous = set(current["enabled_modules"])
    return {**current, "profile_id": body.profile_id, "overrides": body.overrides,
            "enabled_modules": sorted(enabled), "added": sorted(enabled - previous),
            "removed": sorted(previous - enabled), "preserves_history": True}


@router.put("/configuration/")
def write_configuration(body: ConfigurationChoice, request: Request, db: Session = Depends(get_db),
                        user: dict = Depends(require_permission("settings:write"))):
    _manager(user)
    enabled = _choice(body)
    # Lock even for the first policy: concurrent first writes cannot both win.
    tenant = _tenant(request, db, user, lock=True)
    config, previous = current_configuration(db, tenant)
    revision = config.revision if config else 0
    if body.expected_revision != revision:
        db.rollback()
        raise HTTPException(status_code=409, detail="Configuration modifiée ; rechargez avant de continuer")
    if config is None:
        config = EducationConfiguration(tenant_id=tenant.id, profile_id=body.profile_id, overrides={}, revision=0)
        db.add(config)
    config.profile_id = body.profile_id
    config.overrides = dict(body.overrides)
    config.revision = revision + 1
    tenant.education_modules_configured = True
    tenant.type = body.profile_id
    record_configuration_audit(db, user_id=user["id"], tenant_id=str(tenant.id), action="CONFIGURE_EDUCATION_MODULES",
              resource_type="EDUCATION_CONFIGURATION", resource_id=str(tenant.id),
              details={"previous_revision": revision, "revision": config.revision,
                       "profile_id": body.profile_id, "added": sorted(enabled - previous), "removed": sorted(previous - enabled)})
    db.commit()
    return configuration_payload(db, tenant)


@router.get("/cycles/")
def list_cycles(request: Request, db: Session = Depends(get_db),
                user: dict = Depends(require_permission("settings:read"))):
    tenant = _tenant(request, db, user)
    cycles = (
        db.query(EducationCycle)
        .filter(EducationCycle.tenant_id == tenant.id)
        .order_by(EducationCycle.order_index, EducationCycle.name)
        .all()
    )
    return [_cycle_payload(db, cycle) for cycle in cycles]


@router.post("/cycles/", status_code=201)
def create_cycle(body: CycleCreate, request: Request, db: Session = Depends(get_db),
                 user: dict = Depends(require_permission("settings:write"))):
    _manager(user)
    _validate_cycle_values(body.institution_type, body.period_type)
    tenant = _tenant(request, db, user, lock=True)
    duplicate = db.query(EducationCycle.id).filter(
        EducationCycle.tenant_id == tenant.id,
        EducationCycle.code == body.code,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Ce code de cycle existe déjà")
    cycle = EducationCycle(tenant_id=tenant.id, **body.model_dump(), revision=1)
    db.add(cycle)
    db.flush()
    record_configuration_audit(
        db, user_id=user["id"], tenant_id=str(tenant.id), action="CREATE_EDUCATION_CYCLE",
        resource_type="EDUCATION_CYCLE", resource_id=str(cycle.id),
        details={"code": cycle.code, "institution_type": cycle.institution_type,
                 "period_type": cycle.period_type, "revision": 1},
    )
    db.commit()
    db.refresh(cycle)
    return _cycle_payload(db, cycle)


@router.patch("/cycles/{cycle_id}/")
def update_cycle(cycle_id: UUID, body: CycleUpdate, request: Request, db: Session = Depends(get_db),
                 user: dict = Depends(require_permission("settings:write"))):
    _manager(user)
    tenant = _tenant(request, db, user)
    cycle = _locked_cycle(db, tenant, cycle_id)
    if cycle.revision != body.expected_revision:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cycle modifié ; rechargez avant de continuer")
    values = body.model_dump(exclude_unset=True, exclude={"expected_revision"})
    institution_type = values.get("institution_type", cycle.institution_type)
    period_type = values.get("period_type", cycle.period_type)
    _validate_cycle_values(institution_type, period_type)
    if "code" in values and values["code"] != cycle.code:
        duplicate = db.query(EducationCycle.id).filter(
            EducationCycle.tenant_id == tenant.id,
            EducationCycle.code == values["code"],
            EducationCycle.id != cycle.id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="Ce code de cycle existe déjà")
    previous_revision = cycle.revision
    for key, value in values.items():
        setattr(cycle, key, value)
    cycle.revision += 1
    record_configuration_audit(
        db, user_id=user["id"], tenant_id=str(tenant.id), action="UPDATE_EDUCATION_CYCLE",
        resource_type="EDUCATION_CYCLE", resource_id=str(cycle.id),
        details={"previous_revision": previous_revision, "revision": cycle.revision,
                 "fields": sorted(values), "history_preserved": True},
    )
    db.commit()
    db.refresh(cycle)
    return _cycle_payload(db, cycle)


@router.put("/cycles/{cycle_id}/levels/")
def assign_cycle_levels(cycle_id: UUID, body: CycleLevelAssignment, request: Request,
                        db: Session = Depends(get_db),
                        user: dict = Depends(require_permission("settings:write"))):
    _manager(user)
    tenant = _tenant(request, db, user)
    cycle = _locked_cycle(db, tenant, cycle_id)
    if cycle.revision != body.expected_revision:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cycle modifié ; rechargez avant de continuer")
    if not cycle.is_active:
        db.rollback()
        raise HTTPException(status_code=409, detail="Réactivez le cycle avant de modifier ses niveaux")
    requested = set(body.level_ids)
    levels = (
        db.query(Level)
        .filter(Level.tenant_id == tenant.id, Level.id.in_(requested))
        .with_for_update()
        .all()
    ) if requested else []
    found = {level.id for level in levels}
    if found != requested:
        db.rollback()
        raise HTTPException(status_code=422, detail="Un ou plusieurs niveaux sont inconnus dans cet établissement")
    conflicts = [level for level in levels if level.cycle_id not in {None, cycle.id}]
    if conflicts:
        db.rollback()
        raise HTTPException(status_code=409, detail="Un niveau appartient déjà à un autre cycle")
    previous = {
        level.id for level in db.query(Level).filter(
            Level.tenant_id == tenant.id, Level.cycle_id == cycle.id,
        ).with_for_update().all()
    }
    for level in levels:
        level.cycle_id = cycle.id
    if previous - requested:
        db.query(Level).filter(
            Level.tenant_id == tenant.id,
            Level.cycle_id == cycle.id,
            Level.id.in_(previous - requested),
        ).update({Level.cycle_id: None}, synchronize_session=False)
    previous_revision = cycle.revision
    cycle.revision += 1
    record_configuration_audit(
        db, user_id=user["id"], tenant_id=str(tenant.id), action="ASSIGN_EDUCATION_CYCLE_LEVELS",
        resource_type="EDUCATION_CYCLE", resource_id=str(cycle.id),
        details={"previous_revision": previous_revision, "revision": cycle.revision,
                 "assigned": sorted(str(value) for value in requested),
                 "removed": sorted(str(value) for value in previous - requested),
                 "history_preserved": True},
    )
    db.commit()
    db.refresh(cycle)
    return _cycle_payload(db, cycle)
