"""Seed default subscription plans — Phase 4 PR1 (issue #24).

The Phase 4 SaaS foundation migration (20260509_0001) created the
subscription_plans/tenant_subscriptions/tenant_quota_usage/billing_events/
tenant_domains tables, but never populated subscription_plans with any
rows — the issue's PR1 explicitly asks for "seed plans par défaut" and
that part was never done. platform.py's MRR calculation currently
hardcodes plan pricing in a Python dict (PLAN_MONTHLY_USD) rather than
reading from this table, so seeding it now is purely additive: nothing
currently reads subscription_plans, so this cannot regress anything, and
it unblocks any future PR that wants to query real plan rows instead of
the hardcoded dict.

5 plans matching issue #24's list: Free/Demo, Starter, Pro, Enterprise,
Institution. Pricing in USD (informational default — tenant currency is
independent, see Tenant.currency). No stripe_price_*_id set: this schema
is provider-agnostic by design (payment_provider on TenantSubscription
defaults to "stripe" but is free text, not an enum — Mobile Money is a
valid value per issue #24's own text: "Ne pas remplacer Stripe: Stripe
reste international, Mobile Money devient canal local"). No live payment
provider is wired up by this migration — just the plan catalog.

Revision ID: 20260815_0001
Revises: 20260811_0001
Create Date: 2026-08-15

Non-destructive: only inserts rows with slugs that don't already exist
(idempotent — safe to run against a DB where an operator already added
custom plans manually). Downgrade removes only the exact 5 seeded slugs,
never touches a plan an operator created themselves.
"""
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260815_0001"
down_revision = "20260811_0001"
branch_labels = None
depends_on = None

PLANS = [
    {
        "slug": "free",
        "name": "Free / Demo",
        "description": "Découverte et démonstration — usage limité, sans engagement.",
        "price_monthly": 0.0,
        "price_yearly": 0.0,
        "max_students": 30,
        "max_users": 5,
        "max_storage_gb": 1,
        "max_ai_requests": 20,
        "max_exports_per_day": 3,
        "max_campuses": 1,
        "sort_order": 0,
    },
    {
        "slug": "starter",
        "name": "Starter",
        "description": "Petit établissement — fonctionnalités essentielles.",
        "price_monthly": 0.0,
        "price_yearly": 0.0,
        "max_students": 150,
        "max_users": 15,
        "max_storage_gb": 5,
        "max_ai_requests": 100,
        "max_exports_per_day": 10,
        "max_campuses": 1,
        "sort_order": 1,
    },
    {
        "slug": "pro",
        "name": "Pro",
        "description": "Établissement en croissance — IA, exports, multi-campus limité.",
        "price_monthly": 29.0,
        "price_yearly": 290.0,
        "max_students": 800,
        "max_users": 60,
        "max_storage_gb": 25,
        "max_ai_requests": 1000,
        "max_exports_per_day": 50,
        "max_campuses": 3,
        "sort_order": 2,
    },
    {
        "slug": "enterprise",
        "name": "Enterprise",
        "description": "Groupe scolaire ou université — multi-campus, API, support prioritaire.",
        "price_monthly": 99.0,
        "price_yearly": 990.0,
        "max_students": None,
        "max_users": None,
        "max_storage_gb": 200,
        "max_ai_requests": 10000,
        "max_exports_per_day": None,
        "max_campuses": None,
        "sort_order": 3,
    },
    {
        "slug": "institution",
        "name": "Institution / Ministère",
        "description": "Contrat annuel, SLA, déploiement dédié — tarification sur devis.",
        "price_monthly": 0.0,
        "price_yearly": 0.0,
        "max_students": None,
        "max_users": None,
        "max_storage_gb": None,
        "max_ai_requests": None,
        "max_exports_per_day": None,
        "max_campuses": None,
        "sort_order": 4,
    },
]

SEEDED_SLUGS = tuple(p["slug"] for p in PLANS)


def _is_postgres(conn) -> bool:
    return conn.dialect.name == "postgresql"


def upgrade():
    conn = op.get_bind()
    existing = {
        row[0]
        for row in conn.execute(
            text("SELECT slug FROM subscription_plans WHERE slug IN :slugs".replace(
                ":slugs", "(" + ",".join(f"'{s}'" for s in SEEDED_SLUGS) + ")"
            ))
        ).fetchall()
    }

    now = datetime.now(timezone.utc)
    rows_to_insert = [p for p in PLANS if p["slug"] not in existing]
    if not rows_to_insert:
        return

    json_type = JSONB if _is_postgres(conn) else sa.JSON

    subscription_plans = sa.table(
        "subscription_plans",
        sa.column("id"),
        sa.column("name", sa.String),
        sa.column("slug", sa.String),
        sa.column("description", sa.Text),
        sa.column("currency", sa.String),
        sa.column("price_monthly", sa.Float),
        sa.column("price_yearly", sa.Float),
        sa.column("max_students", sa.Integer),
        sa.column("max_users", sa.Integer),
        sa.column("max_storage_gb", sa.Integer),
        sa.column("max_ai_requests", sa.Integer),
        sa.column("max_exports_per_day", sa.Integer),
        sa.column("max_campuses", sa.Integer),
        sa.column("features", json_type),
        sa.column("is_active", sa.Boolean),
        sa.column("sort_order", sa.Integer),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )

    op.bulk_insert(
        subscription_plans,
        [
            {
                "id": str(uuid.uuid4()),
                "name": p["name"],
                "slug": p["slug"],
                "description": p["description"],
                "currency": "USD",
                "price_monthly": p["price_monthly"],
                "price_yearly": p["price_yearly"],
                "max_students": p["max_students"],
                "max_users": p["max_users"],
                "max_storage_gb": p["max_storage_gb"],
                "max_ai_requests": p["max_ai_requests"],
                "max_exports_per_day": p["max_exports_per_day"],
                "max_campuses": p["max_campuses"],
                "features": {},
                "is_active": True,
                "sort_order": p["sort_order"],
                "created_at": now,
                "updated_at": now,
            }
            for p in rows_to_insert
        ],
    )


def downgrade():
    conn = op.get_bind()
    conn.execute(
        text(
            "DELETE FROM subscription_plans WHERE slug IN ("
            + ",".join(f"'{s}'" for s in SEEDED_SLUGS)
            + ")"
        )
    )
