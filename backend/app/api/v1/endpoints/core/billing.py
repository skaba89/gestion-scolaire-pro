"""
Billing local — SchoolFlow Pro
==============================
Monétisation SANS Stripe (décision produit du 15/07/2026) : les abonnements
SaaS se règlent par les rails de paiement locaux — Mobile Money (Orange
Money, MTN MoMo), virement bancaire ou enregistrement manuel — puis sont
validés par un SUPER_ADMIN après rapprochement.

Endpoints:
  GET  /billing/subscription/              — statut abonnement du tenant courant
  GET  /billing/plans/                     — plans actifs souscriptibles
  POST /billing/subscribe/                 — TENANT_ADMIN : demande d'abonnement
  POST /billing/cancel/                    — TENANT_ADMIN : annulation fin de période
  GET  /billing/requests/                  — SUPER_ADMIN : demandes en attente
  POST /billing/requests/{id}/confirm/     — SUPER_ADMIN : paiement reçu → activation
  POST /billing/requests/{id}/reject/      — SUPER_ADMIN : rejet de la demande

Flux nominal :
  1. Le TENANT_ADMIN choisit un plan et un moyen de paiement → une
     TenantSubscription `pending_payment` est créée et les instructions de
     paiement (numéro Mobile Money, coordonnées bancaires) sont renvoyées.
  2. L'établissement paie et communique la référence de transaction.
  3. Le SUPER_ADMIN rapproche le paiement puis confirme : l'abonnement passe
     `active`, le tenant est mis à jour et les quotas du plan sont appliqués
     (enforcement automatique par le QuotaMiddleware existant).
Chaque transition est journalisée dans billing_events (journal idempotent).
"""
from __future__ import annotations

import logging
import os
import uuid as _uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.saas import BillingEvent, SubscriptionPlan, TenantSubscription
from app.models.tenant import Tenant
from app.utils.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()

PAYMENT_METHODS = ("orange_money", "mtn_momo", "bank_transfer", "manual")
BILLING_CYCLES = ("monthly", "yearly")


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _require_roles(current_user: dict, *roles: str) -> None:
    if not any(r in current_user.get("roles", []) for r in roles):
        raise HTTPException(status_code=403, detail="Accès refusé.")


def _get_tenant(db: Session, tenant_id: str) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Établissement introuvable.")
    return tenant


def _payment_instructions(method: str) -> dict:
    """Payment rails are configured per deployment through environment vars."""
    instructions = {
        "orange_money": os.getenv("BILLING_ORANGE_MONEY_NUMBER", ""),
        "mtn_momo": os.getenv("BILLING_MTN_MOMO_NUMBER", ""),
        "bank_transfer": os.getenv("BILLING_BANK_DETAILS", ""),
        "manual": os.getenv("BILLING_CONTACT", ""),
    }
    detail = instructions.get(method, "")
    return {
        "method": method,
        "detail": detail or "Contactez l'équipe SchoolFlow Pro pour finaliser le paiement.",
        "note": (
            "Effectuez le paiement puis conservez la référence de transaction : "
            "elle sera vérifiée avant l'activation de votre abonnement."
        ),
    }


def _record_billing_event(
    db: Session,
    *,
    tenant_id: str,
    provider: str,
    event_type: str,
    payload: dict,
    status: str = "processed",
) -> None:
    db.add(BillingEvent(
        tenant_id=tenant_id,
        provider=provider,
        event_id=f"local:{_uuid.uuid4()}",
        event_type=event_type,
        status=status,
        payload=payload,
        processed_at=_now(),
    ))


def _apply_plan_quotas(tenant: Tenant, plan: SubscriptionPlan) -> None:
    """Copy plan limits into tenant.settings so QuotaMiddleware enforces them."""
    settings_dict = dict(tenant.settings or {})
    quotas = dict(settings_dict.get("quotas") or {})
    if plan.max_students is not None:
        quotas["max_students"] = plan.max_students
    else:
        quotas.pop("max_students", None)
    if plan.max_storage_gb is not None:
        quotas["max_storage_mb"] = plan.max_storage_gb * 1024
    else:
        quotas.pop("max_storage_mb", None)
    settings_dict["quotas"] = quotas
    tenant.settings = settings_dict  # reassign to trigger JSON change detection


def _plan_to_dict(plan: SubscriptionPlan) -> dict:
    return {
        "id": str(plan.id),
        "slug": plan.slug,
        "name": plan.name,
        "description": plan.description,
        "currency": plan.currency,
        "price_monthly": plan.price_monthly,
        "price_yearly": plan.price_yearly,
        "max_students": plan.max_students,
        "max_users": plan.max_users,
        "max_storage_gb": plan.max_storage_gb,
        "max_campuses": plan.max_campuses,
        "features": plan.features or {},
    }


def _subscription_to_dict(sub: TenantSubscription) -> dict:
    return {
        "id": str(sub.id),
        "tenant_id": str(sub.tenant_id),
        "plan_id": str(sub.plan_id) if sub.plan_id else None,
        "plan_slug": sub.plan.slug if sub.plan else None,
        "status": sub.status,
        "billing_cycle": sub.billing_cycle,
        "payment_provider": sub.payment_provider,
        "provider_reference": sub.provider_reference,
        "started_at": sub.started_at.isoformat() if sub.started_at else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "canceled_at": sub.canceled_at.isoformat() if sub.canceled_at else None,
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
    }


# ─── Schemas ─────────────────────────────────────────────────────────────────

class SubscribeRequest(BaseModel):
    plan_slug: str
    billing_cycle: str = "monthly"
    payment_method: str = "orange_money"
    payment_reference: Optional[str] = Field(None, max_length=255)
    billing_email: Optional[str] = None


class ConfirmRequest(BaseModel):
    payment_reference: Optional[str] = Field(None, max_length=255)
    note: Optional[str] = Field(None, max_length=1000)


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)


# ─── Endpoints tenant ────────────────────────────────────────────────────────

@router.get("/subscription/")
async def get_subscription(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retourne l'état d'abonnement du tenant courant."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        # SUPER_ADMIN n'a pas de tenant
        return {"plan": "enterprise", "status": "active", "is_super_admin": True}

    tenant = _get_tenant(db, str(tenant_id))

    trial_active = False
    trial_ends_at = None
    if tenant.trial_ends_at:
        trial_ends_at = tenant.trial_ends_at.isoformat()
        trial_active = tenant.trial_ends_at > _now()

    latest = (
        db.query(TenantSubscription)
        .filter(TenantSubscription.tenant_id == str(tenant_id))
        .order_by(TenantSubscription.created_at.desc())
        .first()
    )

    return {
        "plan": tenant.subscription_plan or "starter",
        "status": tenant.subscription_status or "trialing",
        "trial_active": trial_active,
        "trial_ends_at": trial_ends_at,
        "billing_email": tenant.billing_email or tenant.email,
        "payment_methods": list(PAYMENT_METHODS),
        "latest_request": _subscription_to_dict(latest) if latest else None,
    }


@router.get("/plans/")
async def list_billing_plans(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Plans actifs souscriptibles, triés pour l'affichage."""
    plans = (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.is_active.is_(True))
        .order_by(SubscriptionPlan.sort_order)
        .all()
    )
    return {"items": [_plan_to_dict(p) for p in plans]}


@router.post("/subscribe/", status_code=201)
async def request_subscription(
    body: SubscribeRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Demande d'abonnement payé par un rail local (Mobile Money, virement…)."""
    _require_roles(current_user, "TENANT_ADMIN", "SUPER_ADMIN")

    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Aucun établissement associé à ce compte.")

    if body.billing_cycle not in BILLING_CYCLES:
        raise HTTPException(status_code=400, detail="Cycle de facturation invalide (monthly ou yearly).")
    if body.payment_method not in PAYMENT_METHODS:
        raise HTTPException(
            status_code=400,
            detail=f"Moyen de paiement invalide. Choix : {', '.join(PAYMENT_METHODS)}.",
        )

    plan = (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.slug == body.plan_slug.lower(), SubscriptionPlan.is_active.is_(True))
        .first()
    )
    if not plan:
        raise HTTPException(status_code=400, detail="Plan invalide ou inactif.")

    tenant = _get_tenant(db, str(tenant_id))

    pending = (
        db.query(TenantSubscription)
        .filter(
            TenantSubscription.tenant_id == str(tenant_id),
            TenantSubscription.status == "pending_payment",
        )
        .first()
    )
    if pending:
        raise HTTPException(
            status_code=409,
            detail="Une demande d'abonnement est déjà en attente de validation.",
        )

    if body.billing_email:
        tenant.billing_email = body.billing_email

    subscription = TenantSubscription(
        tenant_id=str(tenant_id),
        plan_id=str(plan.id),
        status="pending_payment",
        billing_cycle=body.billing_cycle,
        payment_provider=body.payment_method,
        provider_reference=body.payment_reference,
    )
    db.add(subscription)
    _record_billing_event(
        db,
        tenant_id=str(tenant_id),
        provider=body.payment_method,
        event_type="subscription.requested",
        payload={
            "plan_slug": plan.slug,
            "billing_cycle": body.billing_cycle,
            "payment_reference": body.payment_reference,
            "requested_by": current_user.get("id"),
        },
    )
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=str(tenant_id),
        action="SUBSCRIPTION_REQUESTED",
        resource_type="SUBSCRIPTION",
        details={"plan": plan.slug, "cycle": body.billing_cycle, "method": body.payment_method},
    )
    db.commit()
    db.refresh(subscription)

    amount = plan.price_yearly if body.billing_cycle == "yearly" else plan.price_monthly
    logger.info(
        "Subscription requested: tenant=%s plan=%s cycle=%s method=%s",
        tenant_id, plan.slug, body.billing_cycle, body.payment_method,
    )
    return {
        "request": _subscription_to_dict(subscription),
        "amount_due": amount,
        "currency": plan.currency,
        "payment_instructions": _payment_instructions(body.payment_method),
        "message": (
            "Demande enregistrée. Votre abonnement sera activé après vérification "
            "du paiement par l'équipe SchoolFlow Pro."
        ),
    }


@router.post("/cancel/")
async def cancel_subscription(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Annule l'abonnement actif à la fin de la période en cours."""
    _require_roles(current_user, "TENANT_ADMIN", "SUPER_ADMIN")

    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Aucun établissement associé à ce compte.")

    subscription = (
        db.query(TenantSubscription)
        .filter(
            TenantSubscription.tenant_id == str(tenant_id),
            TenantSubscription.status == "active",
        )
        .order_by(TenantSubscription.created_at.desc())
        .first()
    )
    if not subscription:
        raise HTTPException(status_code=400, detail="Aucun abonnement actif à annuler.")

    subscription.canceled_at = _now()
    _record_billing_event(
        db,
        tenant_id=str(tenant_id),
        provider=subscription.payment_provider,
        event_type="subscription.cancel_requested",
        payload={"subscription_id": str(subscription.id), "by": current_user.get("id")},
    )
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=str(tenant_id),
        action="SUBSCRIPTION_CANCELED",
        resource_type="SUBSCRIPTION",
        resource_id=str(subscription.id),
    )
    db.commit()

    period_end = (
        subscription.current_period_end.isoformat()
        if subscription.current_period_end else None
    )
    return {
        "message": "Votre abonnement sera arrêté à la fin de la période en cours.",
        "current_period_end": period_end,
    }


# ─── Endpoints plateforme (SUPER_ADMIN) ──────────────────────────────────────

@router.get("/requests/")
async def list_pending_requests(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Demandes d'abonnement en attente de rapprochement."""
    _require_roles(current_user, "SUPER_ADMIN")

    pending = (
        db.query(TenantSubscription)
        .filter(TenantSubscription.status == "pending_payment")
        .order_by(TenantSubscription.created_at.asc())
        .all()
    )
    items = []
    for sub in pending:
        data = _subscription_to_dict(sub)
        data["tenant_name"] = sub.tenant.name if sub.tenant else None
        data["tenant_slug"] = sub.tenant.slug if sub.tenant else None
        items.append(data)
    return {"items": items, "total": len(items)}


@router.post("/requests/{subscription_id}/confirm/")
async def confirm_subscription_payment(
    subscription_id: str,
    body: ConfirmRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Paiement vérifié → activation de l'abonnement et des quotas du plan."""
    _require_roles(current_user, "SUPER_ADMIN")

    subscription = (
        db.query(TenantSubscription)
        .filter(TenantSubscription.id == subscription_id)
        .first()
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    if subscription.status != "pending_payment":
        raise HTTPException(status_code=409, detail=f"Demande déjà traitée (statut : {subscription.status}).")

    plan = subscription.plan
    if not plan:
        raise HTTPException(status_code=409, detail="Le plan associé à cette demande n'existe plus.")

    now = _now()
    period_days = 365 if subscription.billing_cycle == "yearly" else 30
    subscription.status = "active"
    subscription.started_at = now
    subscription.current_period_start = now
    subscription.current_period_end = now + timedelta(days=period_days)
    if body.payment_reference:
        subscription.provider_reference = body.payment_reference
    subscription.provider_status = "confirmed"

    tenant = _get_tenant(db, str(subscription.tenant_id))
    tenant.subscription_plan = plan.slug
    tenant.subscription_status = "active"
    tenant.trial_ends_at = None
    _apply_plan_quotas(tenant, plan)

    _record_billing_event(
        db,
        tenant_id=str(subscription.tenant_id),
        provider=subscription.payment_provider,
        event_type="subscription.payment_confirmed",
        payload={
            "subscription_id": str(subscription.id),
            "plan_slug": plan.slug,
            "payment_reference": subscription.provider_reference,
            "note": body.note,
            "confirmed_by": current_user.get("id"),
        },
    )
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=str(subscription.tenant_id),
        action="SUBSCRIPTION_ACTIVATED",
        resource_type="SUBSCRIPTION",
        resource_id=str(subscription.id),
        details={"plan": plan.slug, "cycle": subscription.billing_cycle},
    )
    db.commit()

    logger.info(
        "Subscription %s confirmed for tenant %s (plan=%s)",
        subscription.id, subscription.tenant_id, plan.slug,
    )
    return {
        "subscription": _subscription_to_dict(subscription),
        "message": f"Abonnement {plan.name} activé jusqu'au {subscription.current_period_end.date().isoformat()}.",
    }


@router.post("/requests/{subscription_id}/reject/")
async def reject_subscription_request(
    subscription_id: str,
    body: RejectRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rejet d'une demande (paiement introuvable, montant incorrect…)."""
    _require_roles(current_user, "SUPER_ADMIN")

    subscription = (
        db.query(TenantSubscription)
        .filter(TenantSubscription.id == subscription_id)
        .first()
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    if subscription.status != "pending_payment":
        raise HTTPException(status_code=409, detail=f"Demande déjà traitée (statut : {subscription.status}).")

    subscription.status = "rejected"
    subscription.provider_status = "rejected"
    subscription.canceled_at = _now()

    _record_billing_event(
        db,
        tenant_id=str(subscription.tenant_id),
        provider=subscription.payment_provider,
        event_type="subscription.payment_rejected",
        payload={
            "subscription_id": str(subscription.id),
            "reason": body.reason,
            "rejected_by": current_user.get("id"),
        },
    )
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=str(subscription.tenant_id),
        action="SUBSCRIPTION_REJECTED",
        resource_type="SUBSCRIPTION",
        resource_id=str(subscription.id),
        details={"reason": body.reason},
    )
    db.commit()

    return {
        "subscription": _subscription_to_dict(subscription),
        "message": "Demande rejetée. L'établissement garde son plan actuel.",
    }
