"""Enterprise SaaS endpoints for Phase 4.

These endpoints expose quota usage, plan catalog, domain mapping and tenant
branding. They are intentionally additive and do not break existing billing or
platform endpoints.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.saas import SubscriptionPlan, TenantDomain
from app.models.tenant import Tenant
from app.services.saas_quota_service import SaaSQuotaService

router = APIRouter()


def _require_platform_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if "SUPER_ADMIN" not in current_user.get("roles", []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès réservé au SUPER_ADMIN.")
    return current_user


def _require_tenant_admin(current_user: dict = Depends(get_current_user)) -> dict:
    roles = current_user.get("roles", [])
    if not any(role in roles for role in ("SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès réservé aux administrateurs du tenant.")
    return current_user


def _current_tenant(db: Session, current_user: dict) -> Tenant:
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Aucun tenant associé au compte courant.")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant introuvable.")
    return tenant


class BrandingUpdate(BaseModel):
    public_name: Optional[str] = Field(None, max_length=255)
    logo_url: Optional[str] = Field(None, max_length=500)
    favicon_url: Optional[str] = Field(None, max_length=500)
    primary_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    email_from_name: Optional[str] = Field(None, max_length=255)
    pdf_footer: Optional[str] = Field(None, max_length=500)


class DomainCreate(BaseModel):
    domain: str = Field(..., min_length=3, max_length=255)
    domain_type: str = Field("custom", pattern="^(custom|subdomain)$")
    is_primary: bool = False


@router.get("/plans/")
async def list_plans(db: Session = Depends(get_db)):
    plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.sort_order).all()
    return [
        {
            "id": str(plan.id),
            "name": plan.name,
            "slug": plan.slug,
            "description": plan.description,
            "currency": plan.currency,
            "price_monthly": plan.price_monthly,
            "price_yearly": plan.price_yearly,
            "limits": {
                "max_students": plan.max_students,
                "max_users": plan.max_users,
                "max_storage_gb": plan.max_storage_gb,
                "max_ai_requests": plan.max_ai_requests,
                "max_exports_per_day": plan.max_exports_per_day,
                "max_campuses": plan.max_campuses,
            },
            "features": plan.features or {},
        }
        for plan in plans
    ]


@router.get("/usage/me/")
async def get_my_tenant_usage(
    recalculate: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: dict = Depends(_require_tenant_admin),
):
    tenant = _current_tenant(db, current_user)
    return SaaSQuotaService(db).get_usage_report(tenant, recalculate=recalculate)


@router.get("/usage/tenants/{tenant_id}/")
async def get_tenant_usage_as_platform(
    tenant_id: str,
    recalculate: bool = Query(True),
    db: Session = Depends(get_db),
    _admin: dict = Depends(_require_platform_admin),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant introuvable.")
    return SaaSQuotaService(db).get_usage_report(tenant, recalculate=recalculate)


@router.get("/branding/me/")
async def get_my_branding(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant = _current_tenant(db, current_user)
    settings = tenant.settings or {}
    branding = settings.get("branding", {})
    return {
        "tenant_id": str(tenant.id),
        "public_name": branding.get("public_name") or tenant.name,
        "logo_url": branding.get("logo_url"),
        "favicon_url": branding.get("favicon_url"),
        "primary_color": branding.get("primary_color") or "#0b2e58",
        "secondary_color": branding.get("secondary_color") or "#f5c542",
        "email_from_name": branding.get("email_from_name") or tenant.name,
        "pdf_footer": branding.get("pdf_footer"),
    }


@router.patch("/branding/me/")
async def update_my_branding(
    body: BrandingUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(_require_tenant_admin),
):
    tenant = _current_tenant(db, current_user)
    settings = dict(tenant.settings or {})
    branding = dict(settings.get("branding", {}))
    for key, value in body.model_dump(exclude_unset=True).items():
        branding[key] = value
    settings["branding"] = branding
    tenant.settings = settings
    db.commit()
    return await get_my_branding(db=db, current_user=current_user)


@router.get("/domains/me/")
async def list_my_domains(
    db: Session = Depends(get_db),
    current_user: dict = Depends(_require_tenant_admin),
):
    tenant = _current_tenant(db, current_user)
    domains = db.query(TenantDomain).filter(TenantDomain.tenant_id == tenant.id).order_by(TenantDomain.created_at.desc()).all()
    return [
        {
            "id": str(domain.id),
            "domain": domain.domain,
            "domain_type": domain.domain_type,
            "is_primary": domain.is_primary,
            "is_verified": domain.is_verified,
            "verification_token": domain.verification_token,
            "verified_at": domain.verified_at.isoformat() if domain.verified_at else None,
        }
        for domain in domains
    ]


@router.post("/domains/me/", status_code=201)
async def create_my_domain(
    body: DomainCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(_require_tenant_admin),
):
    tenant = _current_tenant(db, current_user)
    normalized = body.domain.strip().lower().replace("https://", "").replace("http://", "").strip("/")
    existing = db.query(TenantDomain).filter(TenantDomain.domain == normalized).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ce domaine est déjà associé à un tenant.")

    if body.is_primary:
        db.query(TenantDomain).filter(TenantDomain.tenant_id == tenant.id).update({"is_primary": False})

    domain = TenantDomain(
        tenant_id=tenant.id,
        domain=normalized,
        domain_type=body.domain_type,
        is_primary=body.is_primary,
        verification_token=f"schoolflow-verify-{secrets.token_urlsafe(24)}",
    )
    db.add(domain)
    db.commit()
    db.refresh(domain)
    return {
        "id": str(domain.id),
        "domain": domain.domain,
        "verification_token": domain.verification_token,
        "dns_instruction": f"Créer un TXT record sur {domain.domain} avec la valeur {domain.verification_token}",
    }


@router.post("/domains/{domain_id}/mark-verified/", include_in_schema=False)
async def mark_domain_verified_platform_only(
    domain_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(_require_platform_admin),
):
    domain = db.query(TenantDomain).filter(TenantDomain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domaine introuvable.")
    domain.is_verified = True
    domain.verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"verified": True, "domain": domain.domain}
