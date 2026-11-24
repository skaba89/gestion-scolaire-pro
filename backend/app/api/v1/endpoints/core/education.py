"""Tenant-owned education module and pedagogical-cycle configuration."""
import re
from typing import Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.education_catalog import (
    InvalidModuleConfiguration,
    catalog_payload,
    resolve_modules,
    validate_institution_type,
)
from app.core.cycle_pages import page_policies
from app.core.cycle_scope import (
    CYCLE_POLICY_AVAILABLE, RESTRICTABLE_ROLES, UNRESTRICTED_ROLES, can_be_cycle_restricted, is_cycle_restricted,
)
from app.core.security import get_current_user, require_permission
from app.core.tenant_resolution import resolve_current_tenant_id, enter_tenant_context_or_404
from app.models import EducationConfiguration, EducationCycle, Level, StaffCycleAssignment, Tenant, User, UserRole
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


class StaffCycleChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Optimistic concurrency: the set the administrator saw before editing.
    expected_cycle_ids: List[UUID] = Field(default_factory=list, max_length=100)
    cycle_ids: List[UUID] = Field(default_factory=list, max_length=100)


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
        # Lot B3 : le filtrage par cycle est appliqué côté serveur et les écrans sont adaptés.
        "cycle_policy_available": CYCLE_POLICY_AVAILABLE,
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


@router.get("/my-scope/")
def get_my_scope(request: Request, db: Session = Depends(get_db),
                 user: dict = Depends(get_current_user)):
    """Lot B3 : périmètre du compte connecté, pour adapter menus et écrans.

    ``restricted`` faux : rien n'est masqué (``pages`` vaut ``null``). Vrai : ``cycles`` liste ses
    cycles et ``pages`` dit, écran par écran, s'il lui est accessible — accès **déduit** du
    classement des routes côté serveur (``app/core/cycle_pages.py``). Information de présentation :
    chaque appel d'API reste contrôlé par le serveur."""
    tenant_id = resolve_current_tenant_id(request, user, db)
    if not is_cycle_restricted(user):
        return {"restricted": False, "cycles": [], "pages": None,
                "cycle_policy_available": CYCLE_POLICY_AVAILABLE}
    cycle_ids = [UUID(str(c)) for c in user["_cycle_ids"]]
    cycles = (
        db.query(EducationCycle)
        .filter(EducationCycle.tenant_id == tenant_id, EducationCycle.id.in_(cycle_ids))
        .order_by(EducationCycle.order_index, EducationCycle.name)
        .all()
    ) if cycle_ids else []
    return {
        "restricted": True,
        "cycles": [{"id": str(c.id), "code": c.code, "name": c.name} for c in cycles],
        "pages": page_policies(),
        "cycle_policy_available": CYCLE_POLICY_AVAILABLE,
    }


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


def _staff_payload(user: User, roles: List[str], cycle_ids) -> dict:
    return {
        "user_id": str(user.id),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "is_active": bool(user.is_active),
        "roles": sorted(roles),
        "restrictable": can_be_cycle_restricted(roles),
        "cycle_ids": sorted(str(value) for value in cycle_ids),
    }


@router.get("/staff-cycles/")
def list_staff_cycles(request: Request, db: Session = Depends(get_db),
                      user: dict = Depends(require_permission("settings:read")),
                      skip: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=500)):
    """Personnel restreignable (ou déjà restreint) et ses cycles autorisés.

    Réservé à l'administration : la liste expose noms et e-mails du personnel,
    que ``settings:read`` (détenu par les enseignants) ne doit pas révéler."""
    _manager(user)
    tenant = _tenant(request, db, user)
    assignments: Dict[str, List[str]] = {}
    for user_id, cycle_id in (
        db.query(StaffCycleAssignment.user_id, StaffCycleAssignment.cycle_id)
        .filter(StaffCycleAssignment.tenant_id == tenant.id)
        .all()
    ):
        assignments.setdefault(str(user_id), []).append(str(cycle_id))
    # Filter in SQL: a school's user_roles is dominated by students/parents.
    # Stale rows of a since-promoted administrator stay listed so they can be cleared.
    restrictable_ids = {str(user_id) for (user_id,) in (
        db.query(UserRole.user_id)
        .filter(UserRole.tenant_id == tenant.id, UserRole.role.in_(RESTRICTABLE_ROLES))
        .distinct()
        .all()
    )}
    eligible = sorted(restrictable_ids | set(assignments))
    eligible_uuids = [UUID(uid) for uid in eligible]
    roles_by_user: Dict[str, List[str]] = {}
    if eligible_uuids:
        for user_id, role in (
            db.query(UserRole.user_id, UserRole.role)
            .filter(UserRole.tenant_id == tenant.id, UserRole.user_id.in_(eligible_uuids))
            .all()
        ):
            roles_by_user.setdefault(str(user_id), []).append(role)
    users = {
        str(row.id): row for row in db.query(User).filter(
            User.tenant_id == tenant.id,
            User.id.in_(eligible_uuids),
        ).all()
    } if eligible_uuids else {}
    ordered = sorted(
        users.values(),
        key=lambda row: ((row.last_name or "").lower(), (row.first_name or "").lower(), row.email or ""),
    )
    page = ordered[skip:skip + limit]
    return {
        "items": [_staff_payload(row, roles_by_user.get(str(row.id), []), assignments.get(str(row.id), []))
                  for row in page],
        "total": len(ordered),
        "skip": skip,
        "limit": limit,
        "restrictable_roles": sorted(RESTRICTABLE_ROLES),
        "unrestricted_roles": sorted(UNRESTRICTED_ROLES),
        # Lot B3 : les restrictions enregistrées sont appliquées (B2a–B2e, portail, écrans).
        "cycle_policy_available": CYCLE_POLICY_AVAILABLE,
    }


@router.put("/staff-cycles/{user_id}/")
async def assign_staff_cycles(user_id: UUID, body: StaffCycleChoice, request: Request,
                              db: Session = Depends(get_db),
                              user: dict = Depends(require_permission("settings:write"))):
    """Remplace les cycles autorisés d'un compte du personnel (liste vide = aucune restriction)."""
    from app.api.v1.endpoints.core.auth import blacklist_all_user_tokens

    _manager(user)
    tenant = _tenant(request, db, user)
    # Serialises concurrent edits of the same account's restrictions.
    target = (
        db.query(User)
        .filter(User.id == user_id, User.tenant_id == tenant.id)
        .with_for_update()
        .first()
    )
    if target is None:
        db.rollback()
        raise HTTPException(status_code=404, detail="Utilisateur introuvable dans cet établissement")
    roles = [role for (role,) in db.query(UserRole.role).filter(
        UserRole.tenant_id == tenant.id, UserRole.user_id == target.id,
    ).all()]
    requested = set(body.cycle_ids)
    if requested and not can_be_cycle_restricted(roles):
        db.rollback()
        raise HTTPException(
            status_code=422,
            detail="Seuls directeur, chef de département, secrétariat, personnel et comptabilité "
                   "peuvent être limités à des cycles ; l'administration de l'établissement ne l'est jamais",
        )
    current_rows = (
        db.query(StaffCycleAssignment)
        .filter(StaffCycleAssignment.tenant_id == tenant.id, StaffCycleAssignment.user_id == target.id)
        .all()
    )
    current = {row.cycle_id for row in current_rows}
    if set(body.expected_cycle_ids) != current:
        db.rollback()
        raise HTTPException(status_code=409, detail="Affectations modifiées ; rechargez avant de continuer")
    cycles = {
        cycle.id: cycle for cycle in db.query(EducationCycle).filter(
            EducationCycle.tenant_id == tenant.id, EducationCycle.id.in_(requested),
        ).all()
    } if requested else {}
    if set(cycles) != requested:
        db.rollback()
        raise HTTPException(status_code=422, detail="Un ou plusieurs cycles sont inconnus dans cet établissement")
    added, removed = requested - current, current - requested
    if any(not cycles[cycle_id].is_active for cycle_id in added):
        db.rollback()
        raise HTTPException(status_code=409, detail="Un cycle archivé ne peut pas être attribué")
    if not added and not removed:
        db.rollback()
        return _staff_payload(target, roles, current)
    for row in current_rows:
        if row.cycle_id in removed:
            db.delete(row)
    for cycle_id in added:
        db.add(StaffCycleAssignment(tenant_id=tenant.id, user_id=target.id, cycle_id=cycle_id, assigned_by=user["id"]))
    record_configuration_audit(
        db, user_id=user["id"], tenant_id=str(tenant.id), action="ASSIGN_STAFF_CYCLES",
        resource_type="USER", resource_id=str(target.id),
        details={"previous_cycle_ids": sorted(str(value) for value in current),
                 "cycle_ids": sorted(str(value) for value in requested),
                 "restricted": bool(requested)},
    )
    db.commit()
    # The account's offline caches and open sessions reflect the old scope:
    # force a fresh login, as for any other change of access.
    await blacklist_all_user_tokens(str(target.id))
    return _staff_payload(target, roles, requested)
