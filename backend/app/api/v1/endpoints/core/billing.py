"""
Stripe Billing — SchoolFlow Pro
================================
Endpoints:
  POST /billing/checkout/           — crée une session Stripe Checkout
  POST /billing/webhook/            — reçoit les événements Stripe (no auth)
  POST /billing/portal/             — crée une session Customer Portal
  GET  /billing/subscription/       — statut abonnement du tenant courant
  POST /billing/cancel/             — annule l'abonnement (fin de période)

Plans:
  starter   — gratuit, 30 jours d'essai Pro inclus
  pro       — ~29 $/mois (configurable via STRIPE_PRICE_PRO)
  enterprise— ~99 $/mois (configurable via STRIPE_PRICE_ENTERPRISE)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Helpers ─────────────────────────────────────────────────────────────────

PLAN_PRICE_MAP: dict[str, str] = {
    "starter": settings.STRIPE_PRICE_STARTER,
    "pro": settings.STRIPE_PRICE_PRO,
    "enterprise": settings.STRIPE_PRICE_ENTERPRISE,
}


def _get_stripe():
    """Import stripe lazily — only fails if the package is missing."""
    try:
        import stripe as _stripe
        _stripe.api_key = settings.STRIPE_SECRET_KEY
        return _stripe
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Le module Stripe n'est pas installé sur ce serveur."
        )


def _require_stripe_configured():
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="La facturation Stripe n'est pas configurée sur ce serveur. Contactez l'administrateur."
        )


def _get_tenant(db: Session, tenant_id: str) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Établissement introuvable.")
    return tenant


def _ensure_stripe_customer(stripe, tenant: Tenant, db: Session) -> str:
    """Return existing Stripe customer ID or create a new one."""
    if tenant.stripe_customer_id:
        return tenant.stripe_customer_id

    customer = stripe.Customer.create(
        email=tenant.billing_email or tenant.email or "",
        name=tenant.name,
        metadata={"tenant_id": str(tenant.id), "slug": tenant.slug},
    )
    tenant.stripe_customer_id = customer["id"]
    db.commit()
    logger.info("Created Stripe customer %s for tenant %s", customer["id"], tenant.id)
    return customer["id"]


# ─── Schemas ─────────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan: str                       # "pro" | "enterprise"
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None
    billing_email: Optional[str] = None


class PortalRequest(BaseModel):
    return_url: Optional[str] = None


# ─── Endpoints ───────────────────────────────────────────────────────────────

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

    # Calculer si l'essai est encore valide
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
        "stripe_configured": bool(settings.STRIPE_SECRET_KEY),
    }


@router.post("/checkout/")
async def create_checkout_session(
    body: CheckoutRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée une session Stripe Checkout et retourne l'URL de paiement."""
    _require_stripe_configured()

    roles = current_user.get("roles", [])
    if not any(r in roles for r in ("SUPER_ADMIN", "TENANT_ADMIN")):
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")

    plan = body.plan.lower()
    if plan not in ("pro", "enterprise"):
        raise HTTPException(status_code=400, detail="Plan invalide. Choisissez 'pro' ou 'enterprise'.")

    price_id = PLAN_PRICE_MAP.get(plan, "")
    if not price_id:
        raise HTTPException(
            status_code=503,
            detail=f"Le prix Stripe pour le plan '{plan}' n'est pas configuré. Contactez l'administrateur."
        )

    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Aucun établissement associé à ce compte.")

    tenant = _get_tenant(db, str(tenant_id))

    # Mettre à jour l'email de facturation si fourni
    if body.billing_email:
        tenant.billing_email = body.billing_email
        db.commit()

    stripe = _get_stripe()
    customer_id = _ensure_stripe_customer(stripe, tenant, db)

    base_url = body.success_url or f"{settings.FRONTEND_URL}"
    success_url = f"{base_url}/billing?session_id={{CHECKOUT_SESSION_ID}}&status=success"
    cancel_url = body.cancel_url or f"{settings.FRONTEND_URL}/billing?status=canceled"

    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"tenant_id": str(tenant_id), "plan": plan},
            subscription_data={
                "metadata": {"tenant_id": str(tenant_id), "plan": plan},
            },
            allow_promotion_codes=True,
            billing_address_collection="auto",
        )
        logger.info("Checkout session created for tenant %s (plan=%s)", tenant_id, plan)
        return {"checkout_url": session["url"], "session_id": session["id"]}
    except Exception as exc:
        logger.error("Stripe checkout error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Erreur Stripe : {exc}")


@router.post("/portal/")
async def create_portal_session(
    body: PortalRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée une session Stripe Customer Portal (gérer factures, annulation…)."""
    _require_stripe_configured()

    roles = current_user.get("roles", [])
    if not any(r in roles for r in ("SUPER_ADMIN", "TENANT_ADMIN")):
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")

    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Aucun établissement associé à ce compte.")

    tenant = _get_tenant(db, str(tenant_id))
    if not tenant.stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="Aucun compte de facturation trouvé. Souscrivez d'abord à un plan payant."
        )

    stripe = _get_stripe()
    return_url = body.return_url or f"{settings.FRONTEND_URL}/billing"

    try:
        session = stripe.billing_portal.Session.create(
            customer=tenant.stripe_customer_id,
            return_url=return_url,
        )
        return {"portal_url": session["url"]}
    except Exception as exc:
        logger.error("Stripe portal error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Erreur Stripe : {exc}")


@router.post("/cancel/")
async def cancel_subscription(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Annule l'abonnement à la fin de la période en cours."""
    _require_stripe_configured()

    roles = current_user.get("roles", [])
    if not any(r in roles for r in ("SUPER_ADMIN", "TENANT_ADMIN")):
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")

    tenant_id = current_user.get("tenant_id")
    tenant = _get_tenant(db, str(tenant_id))

    if not tenant.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="Aucun abonnement actif à annuler.")

    stripe = _get_stripe()
    try:
        stripe.Subscription.modify(
            tenant.stripe_subscription_id,
            cancel_at_period_end=True,
        )
        logger.info("Subscription %s set to cancel at period end (tenant %s)",
                    tenant.stripe_subscription_id, tenant_id)
        return {"message": "Votre abonnement sera annulé à la fin de la période en cours."}
    except Exception as exc:
        logger.error("Stripe cancel error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Erreur Stripe : {exc}")


# ─── Stripe Webhook ──────────────────────────────────────────────────────────
# IMPORTANT : cet endpoint NE doit PAS avoir de dépendance auth.
# La vérification se fait via la signature Stripe (stripe-signature header).

@router.post("/webhook/", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
    db: Session = Depends(get_db),
):
    """Receive and process Stripe webhook events."""
    if not settings.STRIPE_WEBHOOK_SECRET:
        logger.warning("STRIPE_WEBHOOK_SECRET not set — webhook rejected")
        raise HTTPException(status_code=400, detail="Webhook secret not configured.")

    payload = await request.body()
    stripe = _get_stripe()

    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        logger.warning("Invalid Stripe webhook signature")
        raise HTTPException(status_code=400, detail="Invalid signature.")
    except Exception as exc:
        logger.error("Webhook parsing error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))

    event_type = event["type"]
    data = event["data"]["object"]
    logger.info("Stripe webhook received: %s", event_type)

    # ── Checkout completed → souscription créée ───────────────────────────────
    if event_type == "checkout.session.completed":
        tenant_id = data.get("metadata", {}).get("tenant_id")
        plan = data.get("metadata", {}).get("plan", "pro")
        subscription_id = data.get("subscription")
        if tenant_id:
            _handle_subscription_activated(db, tenant_id, subscription_id, plan, "active")

    # ── Abonnement créé ou mis à jour ─────────────────────────────────────────
    elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
        tenant_id = data.get("metadata", {}).get("tenant_id")
        plan = data.get("metadata", {}).get("plan")
        sub_status = data.get("status", "active")
        sub_id = data.get("id")

        # Si metadata manquante, retrouver le tenant via customer_id
        if not tenant_id:
            customer_id = data.get("customer")
            tenant = db.query(Tenant).filter(
                Tenant.stripe_customer_id == customer_id
            ).first()
            if tenant:
                tenant_id = str(tenant.id)

        if tenant_id:
            _handle_subscription_updated(db, tenant_id, sub_id, plan, sub_status)

    # ── Abonnement annulé / expiré ────────────────────────────────────────────
    elif event_type == "customer.subscription.deleted":
        customer_id = data.get("customer")
        tenant = db.query(Tenant).filter(
            Tenant.stripe_customer_id == customer_id
        ).first()
        if tenant:
            tenant.subscription_status = "canceled"
            tenant.subscription_plan = "starter"
            tenant.stripe_subscription_id = None
            db.commit()
            logger.info("Subscription canceled for tenant %s", tenant.id)

    # ── Paiement échoué ───────────────────────────────────────────────────────
    elif event_type == "invoice.payment_failed":
        customer_id = data.get("customer")
        tenant = db.query(Tenant).filter(
            Tenant.stripe_customer_id == customer_id
        ).first()
        if tenant:
            tenant.subscription_status = "past_due"
            db.commit()
            logger.warning("Payment failed for tenant %s", tenant.id if tenant else "unknown")

    # ── Paiement réussi ───────────────────────────────────────────────────────
    elif event_type == "invoice.payment_succeeded":
        customer_id = data.get("customer")
        tenant = db.query(Tenant).filter(
            Tenant.stripe_customer_id == customer_id
        ).first()
        if tenant and tenant.subscription_status == "past_due":
            tenant.subscription_status = "active"
            db.commit()

    return {"received": True}


# ─── Webhook helpers ──────────────────────────────────────────────────────────

def _handle_subscription_activated(
    db: Session, tenant_id: str, subscription_id: Optional[str], plan: str, status: str
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        logger.warning("Webhook: tenant %s not found", tenant_id)
        return
    tenant.stripe_subscription_id = subscription_id
    tenant.subscription_plan = plan
    tenant.subscription_status = status
    tenant.trial_ends_at = None
    db.commit()
    logger.info("Tenant %s upgraded to %s (status=%s)", tenant_id, plan, status)


def _handle_subscription_updated(
    db: Session, tenant_id: str, sub_id: Optional[str], plan: Optional[str], sub_status: str
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        return
    if sub_id:
        tenant.stripe_subscription_id = sub_id
    if plan:
        tenant.subscription_plan = plan
    tenant.subscription_status = sub_status
    db.commit()
    logger.info("Tenant %s subscription updated: plan=%s status=%s", tenant_id, plan, sub_status)
