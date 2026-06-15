"""Backward-compatible platform SaaS metrics endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_role import UserRole

router = APIRouter()

PLAN_MONTHLY_USD: dict[str, float] = {"starter": 0.0, "pro": 29.0, "enterprise": 99.0}


def _require_super_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if "SUPER_ADMIN" not in current_user.get("roles", []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès réservé aux super-administrateurs.")
    return current_user


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("/saas-metrics/")
async def get_saas_metrics(
    db: Session = Depends(get_db),
    _admin: dict = Depends(_require_super_admin),
):
    tenants: list[Tenant] = db.query(Tenant).filter(Tenant.is_active == True).all()
    now = _now_utc()

    by_plan = {"starter": 0, "pro": 0, "enterprise": 0}
    by_status = {"active": 0, "trialing": 0, "past_due": 0, "canceled": 0, "unpaid": 0, "other": 0}
    mrr = 0.0
    trial_count = 0
    active_paid_count = 0
    expired_trials = 0
    new_7d = new_30d = new_90d = 0

    for tenant in tenants:
        plan = (tenant.subscription_plan or "starter").lower()
        sub_status = (tenant.subscription_status or "trialing").lower()
        by_plan[plan if plan in by_plan else "starter"] += 1
        by_status[sub_status if sub_status in by_status else "other"] += 1

        if sub_status == "trialing":
            if tenant.trial_ends_at is None or tenant.trial_ends_at > now:
                trial_count += 1
            else:
                expired_trials += 1

        if sub_status == "active" and plan in PLAN_MONTHLY_USD:
            mrr += PLAN_MONTHLY_USD[plan]
            if plan != "starter":
                active_paid_count += 1

        if tenant.created_at:
            age = (now - tenant.created_at).days
            if age <= 7:
                new_7d += 1
            if age <= 30:
                new_30d += 1
            if age <= 90:
                new_90d += 1

    denominator = active_paid_count + expired_trials
    conversion_rate = round(active_paid_count / denominator * 100, 1) if denominator else 0.0

    top_countries_dict: dict[str, int] = {}
    for tenant in tenants:
        country = tenant.country or "??"
        top_countries_dict[country] = top_countries_dict.get(country, 0) + 1

    top_countries = sorted(
        [{"country": country, "count": count} for country, count in top_countries_dict.items()],
        key=lambda item: item["count"],
        reverse=True,
    )[:10]

    return {
        "total_tenants": len(tenants),
        "active_tenants": by_status["active"],
        "trialing_tenants": trial_count,
        "expired_trials": expired_trials,
        "past_due_tenants": by_status["past_due"],
        "canceled_tenants": by_status["canceled"],
        "mrr_usd": round(mrr, 2),
        "arr_usd": round(mrr * 12, 2),
        "conversion_rate_pct": conversion_rate,
        "by_plan": by_plan,
        "by_status": by_status,
        "new_tenants_7d": new_7d,
        "new_tenants_30d": new_30d,
        "new_tenants_90d": new_90d,
        "signups_trend": [],
        "revenue_trend": [],
        "top_countries": top_countries,
        "past_due_list": [
            {
                "id": str(t.id),
                "name": t.name,
                "slug": t.slug,
                "plan": t.subscription_plan,
                "since": t.updated_at.isoformat() if t.updated_at else None,
            }
            for t in tenants
            if (t.subscription_status or "").lower() == "past_due"
        ][:20],
        "generated_at": now.isoformat(),
    }


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
    query = db.query(Tenant)
    if search:
        like = f"%{search}%"
        query = query.filter((Tenant.name.ilike(like)) | (Tenant.slug.ilike(like)) | (Tenant.email.ilike(like)))
    if plan:
        query = query.filter(Tenant.subscription_plan == plan.lower())
    if sub_status:
        query = query.filter(Tenant.subscription_status == sub_status.lower())

    total = query.count()
    tenants = query.order_by(Tenant.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for tenant in tenants:
        user_count = db.query(func.count(User.id)).filter(User.tenant_id == tenant.id).scalar() or 0
        items.append({
            "id": str(tenant.id),
            "name": tenant.name,
            "slug": tenant.slug,
            "type": tenant.type,
            "country": tenant.country,
            "email": tenant.email,
            "is_active": tenant.is_active,
            "subscription_plan": tenant.subscription_plan or "starter",
            "subscription_status": tenant.subscription_status or "trialing",
            "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
            "stripe_customer_id": tenant.stripe_customer_id,
            "stripe_subscription_id": tenant.stripe_subscription_id,
            "user_count": user_count,
            "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
        })

    return {"total": total, "page": page, "page_size": page_size, "pages": max(1, (total + page_size - 1) // page_size), "items": items}


@router.post("/tenants/{tenant_id}/impersonate/")
async def impersonate_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    current_admin: dict = Depends(_require_super_admin),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant introuvable.")

    admin_user = (
        db.query(User)
        .join(UserRole, UserRole.user_id == User.id)
        .filter(UserRole.role == "TENANT_ADMIN", User.tenant_id == tenant_id, User.is_active == True)
        .first()
    )
    if not admin_user:
        raise HTTPException(status_code=404, detail="Aucun TENANT_ADMIN actif trouvé pour cet établissement.")

    token = create_access_token(
        data={
            "sub": str(admin_user.id),
            "roles": ["TENANT_ADMIN"],
            "tenant_id": str(tenant_id),
            "impersonated_by": current_admin["id"],
        }
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 900,
        "tenant_slug": tenant.slug,
        "tenant_name": tenant.name,
        "user_email": admin_user.email,
        "warning": "Ce token doit être utilisé uniquement pour le support autorisé.",
    }
