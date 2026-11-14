"""Preview and atomically apply a tenant's functional-module policy."""
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.education_catalog import catalog_payload, resolve_modules, InvalidModuleConfiguration
from app.core.security import get_current_user, require_permission
from app.core.tenant_resolution import resolve_current_tenant_id, enter_tenant_context_or_404
from app.models import EducationConfiguration, Tenant
from app.services.education_modules import configuration_payload, current_configuration, record_configuration_audit

router = APIRouter()


class ConfigurationChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile_id: str
    overrides: Dict[str, StrictBool] = Field(default_factory=dict)
    expected_revision: int = Field(ge=0, strict=True)


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
