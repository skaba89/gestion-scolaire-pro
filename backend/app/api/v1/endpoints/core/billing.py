"""Backward-compatible billing endpoints.

This module keeps the existing /billing API surface available while the Phase 4
normalized SaaS tables are introduced. Payment-provider specific write flows can
be expanded in a dedicated PR without breaking existing frontend reads.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.tenant import Tenant

router = APIRouter()


class CheckoutRequest(BaseModel):
    plan: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None
    billing_email: Optional[str] = None


class PortalRequest(BaseModel):
    return_url: Optional[str] = None


def _get_tenant(db: Session, tenant_id: str) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Établissement introuvable.")
    return tenant


def _require_admin(current_user: dict) -> None:
    roles = current_user.get("roles", [])
    if not any(role in roles for role in ("SUPER_ADMIN", "TENANT_ADMIN")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Réservé aux administrateurs.")


@router.get("/subscription/")
async def get_subscription(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return {"plan": "enterprise", "status": "active", "is_super_admin": True}

    tenant = _get_tenant(db, str(tenant_id))
    trial_active = False
    trial_ends_at = None
    if tenant.trial_ends_at:
        trial_ends_at = tenant.trial_ends_at.isoformat()
        trial_active = tenant.trial_ends_at > datetime.now(timezone.utc).replace(tzinfo=None)

    return {
        "plan": tenant.subscription_plan or "starter",
        "status": tenant.subscription_status or "trialing",
        "stripe_customer_id": tenant.stripe_customer_id,
        "stripe_subscription_id": tenant.stripe_subscription_id,
        "trial_active": trial_active,
        "trial_ends_at": trial_ends_at,
        "billing_email": tenant.billing_email or tenant.email,
    }


@router.post("/checkout/")
async def create_checkout_session(
    body: CheckoutRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Aucun établissement associé à ce compte.")

    tenant = _get_tenant(db, str(tenant_id))
    if body.billing_email:
        tenant.billing_email = body.billing_email
        db.commit()

    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="La facturation en ligne n'est pas configurée. Les informations d'abonnement restent consultables.",
        )

    raise HTTPException(
        status_code=501,
        detail="Le flux checkout sera traité dans le module SaaS billing avancé.",
    )


@router.post("/portal/")
async def create_portal_session(
    body: PortalRequest,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Portail de facturation non configuré.")
    raise HTTPException(status_code=501, detail="Portail de facturation à finaliser dans le module SaaS billing avancé.")


@router.post("/cancel/")
async def cancel_subscription(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Aucun établissement associé à ce compte.")

    tenant = _get_tenant(db, str(tenant_id))
    tenant.subscription_status = "canceled"
    tenant.subscription_plan = "starter"
    tenant.stripe_subscription_id = None
    db.commit()
    return {"message": "Abonnement marqué comme annulé."}
