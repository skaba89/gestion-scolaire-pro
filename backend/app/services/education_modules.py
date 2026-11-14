"""Atomic configuration and fail-closed module decisions; no school-data deletion."""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.education_catalog import AVAILABLE_MODULES, CORE_MODULES, proposed_profile, resolve_modules, InvalidModuleConfiguration
from app.models.education_configuration import EducationConfiguration
from app.models.tenant import Tenant


def current_configuration(db: Session, tenant: Tenant) -> tuple[EducationConfiguration | None, frozenset[str]]:
    if tenant.education_modules_configured is not True:
        return None, AVAILABLE_MODULES  # unchanged legacy access; not profile auto-activation
    configuration = db.query(EducationConfiguration).filter(EducationConfiguration.tenant_id == tenant.id).first()
    if configuration is None:
        raise HTTPException(status_code=503, detail="Configuration des modules indisponible")
    try:
        enabled = resolve_modules(configuration.profile_id, configuration.overrides)
    except (InvalidModuleConfiguration, TypeError, AttributeError):
        raise HTTPException(status_code=503, detail="Configuration des modules invalide ; contactez l'administration")
    return configuration, enabled


def configuration_payload(db: Session, tenant: Tenant) -> dict:
    config, enabled = current_configuration(db, tenant)
    return {"tenant_id": str(tenant.id), "revision": config.revision if config else 0,
            "mode": "configured" if config else "legacy", "profile_id": config.profile_id if config else proposed_profile(tenant.type),
            "overrides": config.overrides if config else {}, "enabled_modules": sorted(enabled),
            "scope": "institution", "cycle_policy_available": False}


def initialize_new_tenant(db: Session, tenant: Tenant, actor_id: str) -> None:
    """Called only during creation, in the new tenant's RLS context/transaction."""
    profile = proposed_profile(tenant.type)
    db.add(EducationConfiguration(tenant_id=tenant.id, profile_id=profile, overrides={}, revision=1))
    tenant.education_modules_configured = True
    record_configuration_audit(db, user_id=actor_id, tenant_id=str(tenant.id), action="INITIALIZE_EDUCATION_MODULES",
              resource_type="EDUCATION_CONFIGURATION", resource_id=str(tenant.id),
              details={"profile_id": profile, "revision": 1})


def require_enabled_module(db: Session, tenant: Tenant, module_id: str) -> None:
    if module_id in CORE_MODULES:
        return
    _, enabled = current_configuration(db, tenant)
    if module_id not in enabled:
        raise HTTPException(status_code=403, detail=f"Module désactivé pour cet établissement : {module_id}")


def require_tenant_module(db: Session, tenant_id, module_id: str) -> None:
    """For already-resolved public/device/worker tenants, outside JWT auth."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Établissement introuvable")
    if tenant.education_modules_configured is True:
        from app.core.tenant_resolution import enter_tenant_context_or_404
        enter_tenant_context_or_404(db, tenant.id)
        require_enabled_module(db, tenant, module_id)


def record_configuration_audit(db: Session, *, user_id: str, tenant_id: str, action: str,
                               resource_type: str, resource_id: str, details: dict) -> None:
    """Configuration changes cannot commit without their existing AuditLog row."""
    from sqlalchemy.exc import SQLAlchemyError
    from app.models.audit_log import AuditLog
    db.add(AuditLog(user_id=str(user_id), tenant_id=tenant_id, action=action,
                    resource_type=resource_type, resource_id=str(resource_id), details=details, severity="INFO"))
    try:
        db.flush()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Audit indisponible ; configuration inchangée")
