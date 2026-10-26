"""Catalogue des offres SaaS (grille du 2026-10-26).

Source unique côté application : le script de seed, les limites par défaut
du service de quotas, le contrôle d'accès (`require_plan`), l'essai à la
création d'un établissement et le MRR du tableau de bord plateforme lisent
ces valeurs. La migration 20261026_0001 en garde une copie figée (une
migration n'importe pas le code applicatif).

- Pas d'offre gratuite : 30 jours d'essai (limites Standard), puis paiement.
- Toutes les fonctionnalités dans toutes les offres ; seules les limites
  (élèves, établissements…) changent.
- Prix en euros, payables en GNF au taux du jour (Mobile Money / virement).
- Entreprise : plusieurs établissements, sur devis (non souscriptible en ligne).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

PLAN_CURRENCY = "EUR"
TRIAL_PLAN_SLUG = "standard"
TRIAL_DAYS = 30

PLAN_CATALOG: list[dict[str, Any]] = [
    {
        "slug": "standard",
        "name": "Standard",
        "description": "Jusqu'à 500 élèves ou étudiants — toutes les fonctionnalités.",
        "currency": PLAN_CURRENCY,
        "price_monthly": 49.99,
        "price_yearly": 499.90,  # 10 × mensuel : 2 mois offerts
        "max_students": 500,
        "max_users": 50,
        "max_storage_gb": 10,
        "max_ai_requests": 500,
        "max_exports_per_day": 50,
        "max_campuses": 1,
        "features": {"all_features": True},
        "sort_order": 10,
    },
    {
        "slug": "medium",
        "name": "Medium",
        "description": "De 501 à 999 élèves ou étudiants — toutes les fonctionnalités.",
        "currency": PLAN_CURRENCY,
        "price_monthly": 99.99,
        "price_yearly": 999.90,
        "max_students": 999,
        "max_users": 100,
        "max_storage_gb": 25,
        "max_ai_requests": 1500,
        "max_exports_per_day": 100,
        "max_campuses": 1,
        "features": {"all_features": True},
        "sort_order": 20,
    },
    {
        "slug": "premium",
        "name": "Premium",
        "description": "1 000 élèves ou étudiants et plus, un établissement — toutes les fonctionnalités.",
        "currency": PLAN_CURRENCY,
        "price_monthly": 499.99,
        "price_yearly": 4999.90,
        "max_students": None,
        "max_users": None,
        "max_storage_gb": 100,
        "max_ai_requests": 5000,
        "max_exports_per_day": None,
        "max_campuses": 1,
        "features": {"all_features": True},
        "sort_order": 30,
    },
    {
        "slug": "enterprise",
        "name": "Entreprise",
        "description": "Plusieurs établissements, effectifs illimités — tarification sur devis.",
        "currency": PLAN_CURRENCY,
        "price_monthly": 0.0,
        "price_yearly": 0.0,
        "max_students": None,
        "max_users": None,
        "max_storage_gb": None,
        "max_ai_requests": None,
        "max_exports_per_day": None,
        "max_campuses": None,
        "features": {"all_features": True, "on_quote": True, "multi_establishment": True},
        "sort_order": 40,
    },
]

PLANS_BY_SLUG: dict[str, dict[str, Any]] = {p["slug"]: p for p in PLAN_CATALOG}

# Anciennes offres désactivées par la migration 20261026_0001 (lignes
# conservées). Un établissement encore abonné à « pro » / « institution »
# (payé avant la nouvelle grille) garde l'accès jusqu'à expiration ;
# « free » / « starter » ne donnent plus accès à rien (pas d'offre gratuite).
LEGACY_PLAN_SLUGS = ("free", "starter", "pro", "institution")

# Poids pour require_plan / usePlan : 0 = aucune offre payante.
PLAN_WEIGHT: dict[str, int] = {
    "standard": 1,
    "medium": 2,
    "premium": 3,
    "enterprise": 4,
    "pro": 1,
    "institution": 4,
}


def plan_weight(slug: str | None) -> int:
    return PLAN_WEIGHT.get((slug or "").lower(), 0)


def monthly_price(slug: str | None) -> float:
    """Prix mensuel catalogue (0 pour une offre sur devis ou inconnue)."""
    plan = PLANS_BY_SLUG.get((slug or "").lower())
    return float(plan["price_monthly"]) if plan else 0.0


def is_on_quote(features: dict | None) -> bool:
    return bool((features or {}).get("on_quote"))


def apply_quota_limits(tenant: Any, max_students: int | None, max_storage_gb: int | None) -> None:
    """Copie les limites d'une offre dans tenant.settings["quotas"] (QuotaMiddleware).

    `None` est écrit explicitement : il signifie « illimité ». Retirer la clé
    faisait retomber le middleware sur sa limite par défaut (1 000 élèves),
    ce qui plafonnait en silence les offres illimitées.
    """
    settings_dict = dict(tenant.settings or {})
    quotas = dict(settings_dict.get("quotas") or {})
    quotas["max_students"] = max_students
    quotas["max_storage_mb"] = max_storage_gb * 1024 if max_storage_gb is not None else None
    settings_dict["quotas"] = quotas
    tenant.settings = settings_dict  # réassignation : détection du changement JSON


def start_trial(tenant: Any, now: datetime | None = None) -> None:
    """Essai de TRIAL_DAYS jours aux limites de l'offre Standard."""
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    trial_plan = PLANS_BY_SLUG[TRIAL_PLAN_SLUG]
    tenant.subscription_plan = TRIAL_PLAN_SLUG
    tenant.subscription_status = "trialing"
    tenant.trial_ends_at = now + timedelta(days=TRIAL_DAYS)
    apply_quota_limits(tenant, trial_plan["max_students"], trial_plan["max_storage_gb"])


# ─── Accès selon l'état de l'abonnement ──────────────────────────────────────
# Abonnement échu : lecture seule pendant SUBSCRIPTION_READ_ONLY_DAYS jours,
# puis blocage (hors connexion et facturation) — get_current_user.

ACCESS_FULL = "full"
ACCESS_READ_ONLY = "read_only"
ACCESS_BLOCKED = "blocked"

# Fin de l'abonnement payé (ISO 8601), posée à l'expiration ou à l'annulation ;
# retirée à la confirmation d'un paiement.
ENDED_AT_KEY = "subscription_ended_at"


def subscription_ended_at(tenant: Any) -> datetime | None:
    raw = (tenant.settings or {}).get(ENDED_AT_KEY)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def mark_subscription_ended(tenant: Any, ended_at: datetime) -> None:
    settings_dict = dict(tenant.settings or {})
    settings_dict.setdefault(ENDED_AT_KEY, ended_at.replace(tzinfo=None).isoformat())
    tenant.settings = settings_dict


def clear_subscription_ended(tenant: Any) -> None:
    settings_dict = dict(tenant.settings or {})
    if settings_dict.pop(ENDED_AT_KEY, None) is not None:
        tenant.settings = settings_dict


def subscription_access(tenant: Any, now: datetime, read_only_days: int) -> tuple[str, datetime | None]:
    """(niveau d'accès, fin de la lecture seule) pour un établissement.

    - abonnement payant actif ou essai en cours : accès complet ;
    - sinon, lecture seule jusqu'à fin de l'accès + read_only_days, puis blocage.
      Fin de l'accès : trial_ends_at pour un essai, sinon ENDED_AT_KEY (à défaut
      trial_ends_at). Sans aucune date connue : lecture seule, et la tâche
      quotidienne horodate le début du délai (stamp_lapsed_tenants).
    """
    status = (tenant.subscription_status or "trialing").lower()
    if status == "active" and plan_weight(tenant.subscription_plan) > 0:
        return ACCESS_FULL, None
    if status == "trialing" and tenant.trial_ends_at and tenant.trial_ends_at > now:
        return ACCESS_FULL, None

    marked = subscription_ended_at(tenant)
    ended = (tenant.trial_ends_at or marked) if status == "trialing" else (marked or tenant.trial_ends_at)
    if ended is None:
        return ACCESS_READ_ONLY, None
    read_only_until = ended + timedelta(days=read_only_days)
    return (ACCESS_READ_ONLY if now < read_only_until else ACCESS_BLOCKED), read_only_until
