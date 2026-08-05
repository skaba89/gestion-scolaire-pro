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

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, case, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.saas import SubscriptionPlan, TenantSubscription
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_role import UserRole

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

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

    # ── Local billing (abonnements payés par Mobile Money / virement) ────────
    # Le MRR réel vient des souscriptions actives × tarif du plan ; il peut
    # mélanger plusieurs devises (GNF, USD…) → agrégé par devise.
    active_subs = (
        db.query(TenantSubscription)
        .filter(TenantSubscription.status == "active")
        .all()
    )
    plans_by_id = {str(p.id): p for p in db.query(SubscriptionPlan).all()}

    mrr_by_currency: dict[str, float] = {}
    for sub in active_subs:
        sub_plan = plans_by_id.get(str(sub.plan_id)) if sub.plan_id else None
        if not sub_plan:
            continue
        monthly = (
            (sub_plan.price_yearly or 0.0) / 12
            if sub.billing_cycle == "yearly"
            else (sub_plan.price_monthly or 0.0)
        )
        currency = sub_plan.currency or "USD"
        mrr_by_currency[currency] = mrr_by_currency.get(currency, 0.0) + monthly

    pending_requests_count = (
        db.query(func.count(TenantSubscription.id))
        .filter(TenantSubscription.status == "pending_payment")
        .scalar()
        or 0
    )

    soon = now + timedelta(days=7)
    expiring_soon = []
    for sub in active_subs:
        if sub.current_period_end and now < sub.current_period_end <= soon:
            sub_tenant = db.query(Tenant).filter(Tenant.id == sub.tenant_id).first()
            sub_plan = plans_by_id.get(str(sub.plan_id)) if sub.plan_id else None
            expiring_soon.append({
                "tenant_name": sub_tenant.name if sub_tenant else None,
                "tenant_slug": sub_tenant.slug if sub_tenant else None,
                "plan": sub_plan.slug if sub_plan else None,
                "period_end": sub.current_period_end.isoformat(),
            })
    expiring_soon.sort(key=lambda x: x["period_end"])

    local_billing = {
        "active_subscriptions": len(active_subs),
        "pending_requests": int(pending_requests_count),
        "mrr_by_currency": [
            {"currency": c, "mrr": round(v, 0), "arr": round(v * 12, 0)}
            for c, v in sorted(mrr_by_currency.items())
        ],
        "expiring_soon": expiring_soon[:10],
    }

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
        # ── Billing local (Mobile Money / virement)
        "local_billing": local_billing,
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

    # SECURITY: Embed the impersonated admin's current token version, exactly
    # like /auth/login/ does. Without this the token defaults to tv=0, which
    # validate_token_version() now rejects as a "legacy" token for any admin
    # who has ever called logout-all — this would have broken impersonation
    # for every such tenant admin the moment the logout-all fix landed.
    impersonation_token_version = 0
    try:
        from app.core.cache import redis_client
        client = await redis_client.client
        version_str = await client.get(f"sfp:user_token_version:{admin_user.id}")
        if version_str:
            impersonation_token_version = int(version_str)
    except Exception:
        pass

    token = create_access_token(
        data={
            "sub": str(admin_user.id),
            "roles": ["TENANT_ADMIN"],
            "tenant_id": str(tenant_id),
            "impersonated_by": current_admin["id"],
            "tv": impersonation_token_version,
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


# ─── Activation manuelle d'abonnement (paiement hors ligne) ──────────────────
# En Guinée la majorité des écoles paient hors ligne (virement, espèces,
# mobile money). Le super-admin active l'abonnement après réception du paiement.

from pydantic import BaseModel, field_validator


class SubscriptionUpdate(BaseModel):
    plan: Optional[str] = None            # starter | pro | enterprise
    status: Optional[str] = None          # trialing | active | past_due | canceled
    expires_at: Optional[datetime] = None  # date d'expiration (trial_ends_at)

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, v):
        if v is not None and v.lower() not in {"starter", "pro", "enterprise"}:
            raise ValueError("Plan invalide. Valeurs : starter, pro, enterprise")
        return v.lower() if v else v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        allowed = {"trialing", "active", "past_due", "canceled"}
        if v is not None and v.lower() not in allowed:
            raise ValueError(f"Statut invalide. Valeurs : {', '.join(sorted(allowed))}")
        return v.lower() if v else v


@router.patch("/tenants/{tenant_id}/subscription/")
async def update_tenant_subscription(
    tenant_id: str,
    body: SubscriptionUpdate,
    db: Session = Depends(get_db),
    current_admin: dict = Depends(_require_super_admin),
):
    """Activation/mise à jour manuelle de l'abonnement d'un établissement.

    SUPER_ADMIN uniquement. Utilisé pour les paiements hors ligne
    (virement bancaire, espèces, mobile money). L'action est auditée.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant introuvable.")

    changes = {}
    if body.plan is not None:
        changes["plan"] = {"from": tenant.subscription_plan, "to": body.plan}
        tenant.subscription_plan = body.plan
    if body.status is not None:
        changes["status"] = {"from": tenant.subscription_status, "to": body.status}
        tenant.subscription_status = body.status
    if body.expires_at is not None:
        expires_naive = body.expires_at.replace(tzinfo=None)
        changes["expires_at"] = {
            "from": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
            "to": expires_naive.isoformat(),
        }
        tenant.trial_ends_at = expires_naive

    if not changes:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour.")

    db.commit()
    db.refresh(tenant)

    logger.warning(
        "SUBSCRIPTION UPDATE: super_admin=%s tenant=%s changes=%s",
        current_admin["id"], tenant_id, changes,
    )

    try:
        from app.utils.audit import log_audit
        log_audit(
            db,
            user_id=current_admin.get("id"),
            tenant_id=tenant_id,
            action="UPDATE_SUBSCRIPTION",
            resource_type="TENANT",
            resource_id=tenant_id,
            details=changes,
        )
        # log_audit() only flushes internally — the subscription change
        # itself was already committed above, so this second commit is
        # needed to actually persist the audit row.
        db.commit()
    except Exception as audit_err:
        logger.warning("Audit log failed for subscription update: %s", audit_err)

    return {
        "status": "ok",
        "tenant_id": str(tenant.id),
        "subscription_plan": tenant.subscription_plan,
        "subscription_status": tenant.subscription_status,
        "expires_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        "changes": changes,
    }


# ─── Tenant support health (Priorité 3 — commercialisation) ──────────────────
#
# GET /platform/tenants/{id}/health/ — SUPER_ADMIN/support only. Aggregates
# data that already exists (tenant_quota_usage via SaaSQuotaService, jobs,
# audit_logs) into one screen instead of building a new tracking table.
# Deliberately returns counts/timestamps/status only — never a student,
# parent, or teacher's name/email. tenant_id is never sent to Prometheus
# (see docs/TENANT_MONITORING.md) — this is a request-scoped SQL read, not
# a metrics-pipeline label.

@router.get("/tenants/{tenant_id}/health/")
async def get_tenant_health(
    tenant_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(_require_super_admin),
):
    """Support dashboard for one tenant: active status, quota usage,
    recent failed jobs, last import, last activity, global health status.

    No personal data (student/parent/teacher names, emails) is included —
    only counts, statuses and timestamps.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # ── Quota usage (reuses the existing SaaS quota engine — no new table) ──
    from app.services.saas_quota_service import SaaSQuotaService
    try:
        usage_report = SaaSQuotaService(db).get_usage_report(tenant, recalculate=True)
    except Exception as exc:
        logger.warning("Quota report failed for tenant %s: %s", tenant_id, exc)
        usage_report = None

    # ── Recent failed background jobs ───────────────────────────────────────
    from app.models.job import Job
    failed_jobs = (
        db.query(Job)
        .filter(Job.tenant_id == tenant_id, Job.status == "FAILED")
        .order_by(Job.created_at.desc())
        .limit(10)
        .all()
    )
    failed_jobs_payload = [
        {
            "id": str(j.id),
            "job_type": j.job_type,
            "error": (j.error or "")[:300] or None,
            "retry_count": j.retry_count,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "finished_at": j.finished_at.isoformat() if j.finished_at else None,
        }
        for j in failed_jobs
    ]

    # ── Last import (students/parents/teachers) ─────────────────────────────
    from app.models.audit_log import AuditLog
    last_import = (
        db.query(AuditLog)
        .filter(
            AuditLog.tenant_id == tenant_id,
            AuditLog.action.in_(["IMPORT_STUDENTS", "IMPORT_PARENTS", "IMPORT_TEACHERS"]),
        )
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    last_import_payload = None
    if last_import:
        last_import_payload = {
            "action": last_import.action,
            "created_at": last_import.created_at.isoformat() if last_import.created_at else None,
            # `details` on import audit logs is aggregate counts only
            # (created/skipped/total/filename) — never per-row personal data.
            "summary": last_import.details,
        }

    # ── Last activity (most recent audit log entry of any kind) ────────────
    last_activity_row = (
        db.query(AuditLog)
        .filter(AuditLog.tenant_id == tenant_id)
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    last_activity_at = last_activity_row.created_at.isoformat() if last_activity_row and last_activity_row.created_at else None

    # ── Last failed payment webhook ─────────────────────────────────────────
    # CinetPay/PayTech webhook handlers (app/api/v1/endpoints/operational/
    # parents.py) now persist one row per webhook call via
    # payment_webhook_events (was: logger.warning() only, not queryable —
    # see docs/ONLINE_PAYMENT_PILOT_CHECKLIST.md).
    from app.models.payment_webhook_event import PaymentWebhookEvent
    last_failed_webhook_row = (
        db.query(PaymentWebhookEvent)
        .filter(PaymentWebhookEvent.tenant_id == tenant_id, PaymentWebhookEvent.outcome == "rejected")
        .order_by(PaymentWebhookEvent.created_at.desc())
        .first()
    )
    last_failed_payment_webhook = None
    last_failed_payment_webhook_note = None
    if last_failed_webhook_row:
        last_failed_payment_webhook = {
            "gateway": last_failed_webhook_row.gateway,
            "reason": last_failed_webhook_row.reason,
            "created_at": last_failed_webhook_row.created_at.isoformat() if last_failed_webhook_row.created_at else None,
        }
    else:
        last_failed_payment_webhook_note = "Aucun échec de webhook enregistré pour cet établissement."

    # ── WhatsApp health (Phase 5 monitoring — notification_events) ──────────
    from app.models.notification_event import NotificationEvent
    whatsapp_failed_count = (
        db.query(NotificationEvent)
        .filter(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.channel == "whatsapp",
            NotificationEvent.status == "FAILED",
            NotificationEvent.created_at >= _now_utc() - timedelta(days=7),
        )
        .count()
    )
    # SENT/QUEUED past 6h with no webhook update since is a signal the
    # webhook subscription may be misconfigured for this tenant, not that
    # the messages themselves failed (see sync_whatsapp_statuses job).
    whatsapp_stuck_count = (
        db.query(NotificationEvent)
        .filter(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.channel == "whatsapp",
            NotificationEvent.status.in_(["SENT", "QUEUED"]),
            NotificationEvent.created_at < _now_utc() - timedelta(hours=6),
        )
        .count()
    )
    last_successful_whatsapp = (
        db.query(NotificationEvent)
        .filter(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.channel == "whatsapp",
            NotificationEvent.status.in_(["SENT", "DELIVERED", "READ"]),
        )
        .order_by(NotificationEvent.created_at.desc())
        .first()
    )
    last_successful_whatsapp_test_at = (
        last_successful_whatsapp.sent_at.isoformat()
        if last_successful_whatsapp and last_successful_whatsapp.sent_at else None
    )

    # ── Global health verdict ────────────────────────────────────────────────
    has_blocking_quota = bool(usage_report and usage_report.get("has_blocking_limit"))
    has_quota_warning = bool(usage_report and usage_report.get("has_warning"))
    if not tenant.is_active:
        overall_status = "inactive"
    elif has_blocking_quota or len(failed_jobs_payload) >= 5 or whatsapp_failed_count >= 5:
        overall_status = "critical"
    elif has_quota_warning or failed_jobs_payload or whatsapp_stuck_count:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return {
        "tenant_id": str(tenant.id),
        "tenant_name": tenant.name,
        "is_active": tenant.is_active,
        "subscription_plan": tenant.subscription_plan or "starter",
        "subscription_status": tenant.subscription_status or "trialing",
        "quota": usage_report,
        "failed_jobs_recent": failed_jobs_payload,
        "last_import": last_import_payload,
        "last_failed_payment_webhook": last_failed_payment_webhook,
        "last_failed_payment_webhook_note": last_failed_payment_webhook_note,
        "whatsapp_failed_count_7d": whatsapp_failed_count,
        "whatsapp_stuck_count": whatsapp_stuck_count,
        "last_successful_whatsapp_test_at": last_successful_whatsapp_test_at,
        "last_activity_at": last_activity_at,
        "overall_status": overall_status,
        "generated_at": _now_utc().isoformat(),
    }


@router.get("/tenants/{tenant_id}/integrations-health/")
async def get_tenant_integrations_health(
    tenant_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(_require_super_admin),
):
    """Alias of GET /tenants/{tenant_id}/health/ under the name used by the
    support monitoring brief — same payload, kept as a single implementation
    so the two names never drift apart."""
    return await get_tenant_health(tenant_id, db, _admin)


# ─── Email deliverability (Render + Resend audit) ─────────────────────────────
# GET  /platform/email/health/       — configuration status, no secrets ever
# POST /platform/email/test-send/    — send a real test email, rate-limited

class EmailTestSendRequest(BaseModel):
    to_email: EmailStr


@router.get("/email/health/")
async def get_email_health(_admin: dict = Depends(_require_super_admin)):
    """Non-secret snapshot of email configuration, for verifying a Render
    deploy before relying on it in production. Never returns API keys,
    SMTP passwords, or any other secret value — only booleans/derived facts.
    """
    from app.core.config import settings

    from_email = (settings.FROM_EMAIL or "").strip()
    from_domain = from_email.split("@", 1)[1] if "@" in from_email else None
    frontend_url = (settings.FRONTEND_URL or "").strip()

    return {
        "resend_configured": bool(settings.RESEND_API_KEY),
        "smtp_configured": bool(settings.SMTP_HOST and settings.SMTP_USER),
        "from_email_domain": from_domain,
        "frontend_url_configured": bool(frontend_url),
        "frontend_url_has_https": frontend_url.startswith("https://"),
        "alert_email_configured": bool(settings.ALERT_EMAIL),
    }


@router.post("/email/test-send/")
@limiter.limit("5/hour")
async def send_test_email(
    request: Request,
    body: EmailTestSendRequest,
    _admin: dict = Depends(_require_super_admin),
):
    """Send a real test email through the configured provider(s) (Resend,
    then SMTP fallback) to verify deliverability end-to-end after a Render
    deploy or a Resend domain change. SUPER_ADMIN only, strictly
    rate-limited — this makes a real outbound send, unlike /email/health/.
    """
    from app.core.config import settings
    from app.services.notifications import EmailSender

    sender = EmailSender(
        resend_api_key=settings.RESEND_API_KEY,
        smtp_host=settings.SMTP_HOST,
        smtp_port=settings.SMTP_PORT,
        smtp_user=settings.SMTP_USER,
        smtp_pass=settings.SMTP_PASS,
        from_email=settings.FROM_EMAIL,
        from_name=settings.FROM_NAME,
    )
    sent = sender.send(
        to=body.to_email,
        subject="SchoolFlow Pro — Email de test (platform admin)",
        html=(
            "<p>Ceci est un email de test envoyé depuis le tableau de bord "
            "SUPER_ADMIN de SchoolFlow Pro pour vérifier la configuration "
            "Resend/SMTP de ce déploiement.</p>"
        ),
    )
    if sent is not True:
        raise HTTPException(
            status_code=502,
            detail="L'envoi a échoué (Resend et SMTP indisponibles ou mal configurés).",
        )
    return {"sent": True, "to": body.to_email}


# ─── Platform-wide operational monitoring (Phase 5 support brief) ─────────────
# Cross-tenant views for support/on-call — the per-tenant health above stays
# scoped to one school; these three answer "is anything platform-wide on
# fire right now" without having to loop over every tenant by hand.

@router.get("/jobs/health/")
async def get_jobs_health(
    db: Session = Depends(get_db),
    _admin: dict = Depends(_require_super_admin),
    stale_running_minutes: int = Query(30, ge=1, le=1440),
):
    """Arq job queue health across every tenant: jobs stuck RUNNING past
    `stale_running_minutes` (usually means a worker crashed mid-job and
    never reached _job_finished()), and the most recent FAILED jobs.
    """
    from app.models.job import Job

    cutoff = _now_utc() - timedelta(minutes=stale_running_minutes)
    stale_running = (
        db.query(Job)
        .filter(Job.status == "RUNNING", Job.started_at.isnot(None), Job.started_at < cutoff)
        .order_by(Job.started_at.asc())
        .limit(50)
        .all()
    )
    recent_failed = (
        db.query(Job)
        .filter(Job.status == "FAILED")
        .order_by(Job.created_at.desc())
        .limit(50)
        .all()
    )

    def _job_payload(j: Job) -> dict:
        return {
            "id": str(j.id),
            "tenant_id": str(j.tenant_id) if j.tenant_id else None,
            "job_type": j.job_type,
            "status": j.status,
            "error": (j.error or "")[:300] or None,
            "retry_count": j.retry_count,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "started_at": j.started_at.isoformat() if j.started_at else None,
            "finished_at": j.finished_at.isoformat() if j.finished_at else None,
        }

    return {
        "stale_running_minutes_threshold": stale_running_minutes,
        "stale_running_jobs": [_job_payload(j) for j in stale_running],
        "stale_running_count": len(stale_running),
        "recent_failed_jobs": [_job_payload(j) for j in recent_failed],
        "recent_failed_count": len(recent_failed),
        "overall_status": "critical" if len(stale_running) or len(recent_failed) >= 5 else (
            "degraded" if recent_failed else "healthy"
        ),
        "generated_at": _now_utc().isoformat(),
    }


@router.get("/webhooks/recent-failures/")
async def get_recent_webhook_failures(
    db: Session = Depends(get_db),
    _admin: dict = Depends(_require_super_admin),
    hours: int = Query(24, ge=1, le=168),
):
    """Every webhook-adjacent failure signal across tenants in the last
    `hours`: rejected payment gateway webhooks (payment_webhook_events) and
    WhatsApp sends that failed outright (notification_events) — the two
    integration points where a silent failure directly costs the tenant
    money or a missed parent notification.
    """
    from app.models.notification_event import NotificationEvent
    from app.models.payment_webhook_event import PaymentWebhookEvent

    cutoff = _now_utc() - timedelta(hours=hours)

    rejected_payment_webhooks = (
        db.query(PaymentWebhookEvent)
        .filter(PaymentWebhookEvent.outcome == "rejected", PaymentWebhookEvent.created_at >= cutoff)
        .order_by(PaymentWebhookEvent.created_at.desc())
        .limit(50)
        .all()
    )
    failed_whatsapp_sends = (
        db.query(NotificationEvent)
        .filter(
            NotificationEvent.channel == "whatsapp",
            NotificationEvent.status == "FAILED",
            NotificationEvent.created_at >= cutoff,
        )
        .order_by(NotificationEvent.created_at.desc())
        .limit(50)
        .all()
    )

    payment_payload = [
        {
            "id": str(w.id),
            "tenant_id": str(w.tenant_id) if w.tenant_id else None,
            "gateway": w.gateway,
            "reason": w.reason,
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w in rejected_payment_webhooks
    ]
    whatsapp_payload = [
        {
            "id": str(n.id),
            "tenant_id": str(n.tenant_id),
            "event_type": n.event_type,
            "error_reason": (n.error_reason or "")[:300] or None,
            "retry_count": n.retry_count,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in failed_whatsapp_sends
    ]

    return {
        "window_hours": hours,
        "rejected_payment_webhooks": payment_payload,
        "rejected_payment_webhooks_count": len(payment_payload),
        "failed_whatsapp_sends": whatsapp_payload,
        "failed_whatsapp_sends_count": len(whatsapp_payload),
        "generated_at": _now_utc().isoformat(),
    }
