"""
Platform / SaaS metrics — SUPER_ADMIN only
==========================================
GET  /platform/saas-metrics/     — MRR, tenants stats, trials, churn
GET  /platform/tenants/          — paginated tenant list with billing info
POST /platform/tenants/{id}/impersonate/  — get a short-lived token for a tenant
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, case, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_role import UserRole

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── SUPER_ADMIN guard ────────────────────────────────────────────────────────

def _require_super_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if "SUPER_ADMIN" not in current_user.get("roles", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux super-administrateurs de la plateforme.",
        )
    return current_user


# ─── Pricing constants (MRR calculation) ──────────────────────────────────────

PLAN_MONTHLY_USD: dict[str, float] = {
    "starter": 0.0,
    "pro": 29.0,
    "enterprise": 99.0,
}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _is_trial_valid(tenant: Tenant) -> bool:
    if tenant.subscription_status != "trialing":
        return False
    if tenant.trial_ends_at is None:
        return True
    return tenant.trial_ends_at > _now_utc()


# ─── SaaS Metrics ─────────────────────────────────────────────────────────────

@router.get("/saas-metrics/")
async def get_saas_metrics(
    db: Session = Depends(get_db),
    _admin: dict = Depends(_require_super_admin),
):
    """
    Tableau de bord SaaS pour le SUPER_ADMIN.

    Retourne :
    - MRR (Monthly Recurring Revenue) estimé en USD
    - Nombre de tenants par plan et statut
    - Nouveaux inscrits (7j, 30j, 90j)
    - Taux de conversion trial → payant
    - Tenants en retard de paiement (past_due)
    - Données pour le graphique d'évolution (30 derniers jours)
    """
    tenants: list[Tenant] = db.query(Tenant).filter(Tenant.is_active == True).all()

    now = _now_utc()

    # ── Counters ─────────────────────────────────────────────────────────────
    total = len(tenants)
    by_plan: dict[str, int] = {"starter": 0, "pro": 0, "enterprise": 0}
    by_status: dict[str, int] = {"active": 0, "trialing": 0, "past_due": 0, "canceled": 0, "unpaid": 0, "other": 0}
    mrr = 0.0
    trial_count = 0
    active_paid_count = 0
    expired_trials = 0

    new_7d = new_30d = new_90d = 0

    for t in tenants:
        plan = (t.subscription_plan or "starter").lower()
        sub_status = (t.subscription_status or "trialing").lower()

        # plan bucket
        if plan in by_plan:
            by_plan[plan] += 1
        else:
            by_plan["starter"] += 1

        # status bucket
        if sub_status in by_status:
            by_status[sub_status] += 1
        else:
            by_status["other"] += 1

        # trial validity
        if sub_status == "trialing":
            if _is_trial_valid(t):
                trial_count += 1
            else:
                expired_trials += 1

        # MRR (only active paid)
        if sub_status == "active" and plan in PLAN_MONTHLY_USD:
            mrr += PLAN_MONTHLY_USD[plan]
            if plan != "starter":
                active_paid_count += 1

        # Recent signups
        if t.created_at:
            age = (now - t.created_at).days
            if age <= 7:
                new_7d += 1
            if age <= 30:
                new_30d += 1
            if age <= 90:
                new_90d += 1

    # Conversion rate: paid active / (paid active + expired trials)
    denominator = active_paid_count + expired_trials
    conversion_rate = round(active_paid_count / denominator * 100, 1) if denominator else 0.0

    # ── Sign-up trend (last 30 days, daily counts) ────────────────────────────
    signups_trend: list[dict] = []
    try:
        rows = db.execute(
            text("""
                SELECT
                    DATE(created_at) AS day,
                    COUNT(*) AS count
                FROM tenants
                WHERE created_at >= NOW() - INTERVAL '30 days'
                  AND is_active = true
                GROUP BY day
                ORDER BY day
            """)
        ).fetchall()
        signups_trend = [{"date": str(r.day), "count": r.count} for r in rows]
    except Exception:
        # SQLite fallback
        try:
            rows = db.execute(
                text("""
                    SELECT
                        DATE(created_at) AS day,
                        COUNT(*) AS count
                    FROM tenants
                    WHERE created_at >= DATE('now', '-30 days')
                      AND is_active = 1
                    GROUP BY day
                    ORDER BY day
                """)
            ).fetchall()
            signups_trend = [{"date": str(r.day), "count": r.count} for r in rows]
        except Exception:
            signups_trend = []

    # ── Revenue trend (last 6 months, estimated MRR per month) ───────────────
    # Simple heuristic: count active-paid tenants per plan per month
    revenue_trend: list[dict] = []
    try:
        rows = db.execute(
            text("""
                SELECT
                    TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
                    subscription_plan,
                    COUNT(*) AS count
                FROM tenants
                WHERE subscription_status = 'active'
                  AND subscription_plan IN ('pro', 'enterprise')
                  AND created_at >= NOW() - INTERVAL '6 months'
                GROUP BY month, subscription_plan
                ORDER BY month
            """)
        ).fetchall()
        # Aggregate by month
        month_mrr: dict[str, float] = {}
        for r in rows:
            month = r.month
            plan_price = PLAN_MONTHLY_USD.get(r.subscription_plan or "starter", 0.0)
            month_mrr[month] = month_mrr.get(month, 0.0) + plan_price * r.count
        revenue_trend = [{"month": m, "mrr": round(v, 2)} for m, v in sorted(month_mrr.items())]
    except Exception:
        revenue_trend = []

    # ── Top countries ─────────────────────────────────────────────────────────
    country_counts: dict[str, int] = {}
    for t in tenants:
        c = t.country or "??"
        country_counts[c] = country_counts.get(c, 0) + 1
    top_countries = sorted(
        [{"country": k, "count": v} for k, v in country_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    # ── Past due tenants ──────────────────────────────────────────────────────
    past_due_tenants = [
        {
            "id": str(t.id),
            "name": t.name,
            "slug": t.slug,
            "plan": t.subscription_plan,
            "since": t.updated_at.isoformat() if t.updated_at else None,
        }
        for t in tenants
        if (t.subscription_status or "").lower() == "past_due"
    ][:20]

    return {
        # ── Summary KPIs
        "total_tenants": total,
        "active_tenants": by_status["active"],
        "trialing_tenants": trial_count,
        "expired_trials": expired_trials,
        "past_due_tenants": by_status["past_due"],
        "canceled_tenants": by_status["canceled"],
        "mrr_usd": round(mrr, 2),
        "arr_usd": round(mrr * 12, 2),
        "conversion_rate_pct": conversion_rate,
        # ── Plan distribution
        "by_plan": by_plan,
        "by_status": by_status,
        # ── Growth
        "new_tenants_7d": new_7d,
        "new_tenants_30d": new_30d,
        "new_tenants_90d": new_90d,
        # ── Trends
        "signups_trend": signups_trend,
        "revenue_trend": revenue_trend,
        "top_countries": top_countries,
        # ── Alerts
        "past_due_list": past_due_tenants,
        "generated_at": now.isoformat(),
    }


# ─── Tenant List with billing ─────────────────────────────────────────────────

@router.get("/tenants/")
async def list_platform_tenants(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
    sub_status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _admin: dict = Depends(_require_super_admin),
):
    """Liste paginée de tous les tenants avec info de facturation (SUPER_ADMIN)."""
    query = db.query(Tenant)

    if search:
        like = f"%{search}%"
        query = query.filter(
            (Tenant.name.ilike(like)) | (Tenant.slug.ilike(like)) | (Tenant.email.ilike(like))
        )

    if plan:
        query = query.filter(Tenant.subscription_plan == plan.lower())

    if sub_status:
        query = query.filter(Tenant.subscription_status == sub_status.lower())

    total = query.count()
    tenants = query.order_by(Tenant.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for t in tenants:
        # Count users for this tenant
        user_count = db.query(func.count(User.id)).filter(User.tenant_id == t.id).scalar() or 0
        items.append({
            "id": str(t.id),
            "name": t.name,
            "slug": t.slug,
            "type": t.type,
            "country": t.country,
            "email": t.email,
            "is_active": t.is_active,
            "subscription_plan": t.subscription_plan or "starter",
            "subscription_status": t.subscription_status or "trialing",
            "trial_ends_at": t.trial_ends_at.isoformat() if t.trial_ends_at else None,
            "stripe_customer_id": t.stripe_customer_id,
            "stripe_subscription_id": t.stripe_subscription_id,
            "user_count": user_count,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
        "items": items,
    }


# ─── Impersonate tenant (short-lived token) ──────────────────────────────────

@router.post("/tenants/{tenant_id}/impersonate/")
async def impersonate_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    current_admin: dict = Depends(_require_super_admin),
):
    """
    Génère un token d'accès court (15 min) pour accéder au dashboard d'un tenant
    en tant que TENANT_ADMIN, sans connaître son mot de passe.

    Utile pour le support client et le debugging.
    L'action est auditée.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant introuvable.")

    # Find the TENANT_ADMIN user for this tenant
    admin_user = (
        db.query(User)
        .join(UserRole, UserRole.user_id == User.id)
        .filter(
            UserRole.role == "TENANT_ADMIN",
            User.tenant_id == tenant_id,
            User.is_active == True,
        )
        .first()
    )

    if not admin_user:
        raise HTTPException(
            status_code=404,
            detail="Aucun TENANT_ADMIN actif trouvé pour cet établissement.",
        )

    from app.core.security import create_access_token

    token = create_access_token(
        data={
            "sub": str(admin_user.id),
            "roles": ["TENANT_ADMIN"],
            "tenant_id": str(tenant_id),
            "impersonated_by": current_admin["id"],
        },
        expires_delta=timedelta(minutes=15),
    )

    logger.warning(
        "IMPERSONATION: super_admin=%s impersonated tenant=%s (admin_user=%s)",
        current_admin["id"],
        tenant_id,
        admin_user.id,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 900,
        "tenant_slug": tenant.slug,
        "tenant_name": tenant.name,
        "user_email": admin_user.email,
        "warning": "Ce token expire dans 15 minutes. Cette action est auditée.",
    }
