"""Seed default SaaS plans for Phase 4 Enterprise.

Usage:
    cd backend
    python -m app.scripts.seed_saas_plans

Safe to run multiple times: plans are upserted by slug.
"""
from __future__ import annotations

from app.core.database import SessionLocal
from app.models.saas import SubscriptionPlan
from app.services.plan_catalog import LEGACY_PLAN_SLUGS, PLAN_CATALOG


# Grille du 2026-10-26 : une seule source, app/services/plan_catalog.py.
DEFAULT_PLANS = PLAN_CATALOG


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
        # Pas d'offre gratuite : les anciennes offres restent en base
        # (historique des abonnements) mais ne sont plus souscriptibles.
        for plan in db.query(SubscriptionPlan).filter(SubscriptionPlan.slug.in_(LEGACY_PLAN_SLUGS)).all():
            if plan.is_active:
                plan.is_active = False
                changed += 1
        db.commit()
        return changed
    finally:
        db.close()


if __name__ == "__main__":
    count = seed_plans()
    print(f"Seeded/updated {count} SaaS plans")
