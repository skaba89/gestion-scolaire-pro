"""Seed default SaaS plans for Phase 4 Enterprise.

Usage:
    cd backend
    python -m app.scripts.seed_saas_plans

Safe to run multiple times: plans are upserted by slug.
"""
from __future__ import annotations

from app.core.database import SessionLocal
from app.models.saas import SubscriptionPlan


DEFAULT_PLANS = [
    {
        "slug": "starter",
        "name": "Starter",
        "description": "Plan de démarrage pour petites écoles et démonstrations.",
        "currency": "GNF",
        "price_monthly": 0.0,
        "price_yearly": 0.0,
        "max_students": 300,
        "max_users": 10,
        "max_storage_gb": 5,
        "max_ai_requests": 100,
        "max_exports_per_day": 20,
        "max_campuses": 1,
        "features": {
            "parent_portal": True,
            "basic_reports": True,
            "white_label": False,
            "custom_domain": False,
            "api_access": False,
            "sso": False,
            "support": "community",
        },
        "sort_order": 10,
    },
    {
        "slug": "pro",
        "name": "Pro",
        "description": "Plan professionnel pour écoles privées et groupes scolaires moyens.",
        "currency": "GNF",
        # 500 000 GNF/mois ; l'annuel offre deux mois (10 × mensuel).
        "price_monthly": 500_000.0,
        "price_yearly": 5_000_000.0,
        "max_students": 2000,
        "max_users": 80,
        "max_storage_gb": 50,
        "max_ai_requests": 2000,
        "max_exports_per_day": 200,
        "max_campuses": 5,
        "features": {
            "parent_portal": True,
            "advanced_reports": True,
            "white_label": True,
            "custom_domain": False,
            "api_access": False,
            "sso": False,
            "support": "standard",
        },
        "sort_order": 20,
    },
    {
        "slug": "enterprise",
        "name": "Enterprise",
        "description": "Plan enterprise pour groupes scolaires, universités et réseaux multi-campus.",
        "currency": "GNF",
        # 1 000 000 GNF/mois ; l'annuel offre deux mois (10 × mensuel).
        "price_monthly": 1_000_000.0,
        "price_yearly": 10_000_000.0,
        "max_students": 10000,
        "max_users": 500,
        "max_storage_gb": 500,
        "max_ai_requests": 20000,
        "max_exports_per_day": 2000,
        "max_campuses": 50,
        "features": {
            "parent_portal": True,
            "advanced_reports": True,
            "white_label": True,
            "custom_domain": True,
            "api_access": True,
            "sso": False,
            "support": "priority",
        },
        "sort_order": 30,
    },
    {
        "slug": "institution",
        "name": "Institution",
        "description": "Plan institutionnel pour ministères, universités publiques et déploiements souverains. Tarification sur devis.",
        "currency": "GNF",
        "price_monthly": 0.0,
        "price_yearly": 0.0,
        "max_students": None,
        "max_users": None,
        "max_storage_gb": None,
        "max_ai_requests": None,
        "max_exports_per_day": None,
        "max_campuses": None,
        "features": {
            "parent_portal": True,
            "advanced_reports": True,
            "white_label": True,
            "custom_domain": True,
            "api_access": True,
            "sso": True,
            "dedicated_hosting": True,
            "support": "sla",
        },
        "sort_order": 40,
    },
]


def seed_plans() -> int:
    db = SessionLocal()
    changed = 0
    try:
        for item in DEFAULT_PLANS:
            plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == item["slug"]).first()
            if not plan:
                plan = SubscriptionPlan(**item)
                db.add(plan)
                changed += 1
            else:
                for key, value in item.items():
                    setattr(plan, key, value)
                changed += 1
        db.commit()
        return changed
    finally:
        db.close()


if __name__ == "__main__":
    count = seed_plans()
    print(f"Seeded/updated {count} SaaS plans")
