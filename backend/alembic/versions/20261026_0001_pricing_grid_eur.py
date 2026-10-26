"""Grille tarifaire en euros, sans offre gratuite (2026-10-26).

Décision produit : Standard 49,99 € (≤ 500 élèves), Medium 99,99 €
(501–999), Premium 499,99 € (≥ 1 000, un établissement), Entreprise sur
devis (plusieurs établissements). Annuel = 10 × mensuel. Toutes les
fonctionnalités dans toutes les offres. 30 jours d'essai, plus d'offre
gratuite ni d'essai sans date de fin.

Catalogue (copie figée de app/services/plan_catalog.py — une migration
n'importe pas le code applicatif) :
- insère standard / medium / premium, met à jour enterprise ;
- désactive free / starter / pro / institution (lignes conservées :
  historique des abonnements, FK tenant_subscriptions.plan_id).

Établissements existants (table `tenants`, sans RLS) :
- essai en cours sur free / starter / pro → offre standard, date de fin
  conservée ;
- essai sans date de fin, ou offre gratuite free / starter « active »
  → essai standard de 30 jours à partir de maintenant (période de grâce) ;
- abonnements payants actifs (pro, enterprise, institution) : inchangés,
  ils gardent l'accès jusqu'à expiration.
Les valeurs d'origine sont gardées dans settings["_pricing_20261026"] pour
le downgrade. Les quotas déjà appliqués ne sont pas modifiés.

Revision ID: 20261026_0001
Revises: 20261024_0001
Create Date: 2026-10-26
"""
import uuid
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20261026_0001"
down_revision = "20261024_0001"
branch_labels = None
depends_on = None

# Données uniquement (aucun changement de schéma) : le code précédent
# continue de fonctionner ; il ne connaît pas les nouvelles offres et
# refuse simplement l'IA / l'import aux établissements « standard »
# jusqu'au déploiement du code qui les accompagne.
backward_compatible = True

BACKUP_KEY = "_pricing_20261026"
TRIAL_DAYS = 30
LEGACY_SLUGS = ("free", "starter", "pro", "institution")
NEW_SLUGS = ("standard", "medium", "premium")

PLANS = [
    {
        "slug": "standard", "name": "Standard",
        "description": "Jusqu'à 500 élèves ou étudiants — toutes les fonctionnalités.",
        "price_monthly": 49.99, "price_yearly": 499.90,
        "max_students": 500, "max_users": 50, "max_storage_gb": 10,
        "max_ai_requests": 500, "max_exports_per_day": 50, "max_campuses": 1,
        "features": {"all_features": True}, "sort_order": 10,
    },
    {
        "slug": "medium", "name": "Medium",
        "description": "De 501 à 999 élèves ou étudiants — toutes les fonctionnalités.",
        "price_monthly": 99.99, "price_yearly": 999.90,
        "max_students": 999, "max_users": 100, "max_storage_gb": 25,
        "max_ai_requests": 1500, "max_exports_per_day": 100, "max_campuses": 1,
        "features": {"all_features": True}, "sort_order": 20,
    },
    {
        "slug": "premium", "name": "Premium",
        "description": "1 000 élèves ou étudiants et plus, un établissement — toutes les fonctionnalités.",
        "price_monthly": 499.99, "price_yearly": 4999.90,
        "max_students": None, "max_users": None, "max_storage_gb": 100,
        "max_ai_requests": 5000, "max_exports_per_day": None, "max_campuses": 1,
        "features": {"all_features": True}, "sort_order": 30,
    },
    {
        "slug": "enterprise", "name": "Entreprise",
        "description": "Plusieurs établissements, effectifs illimités — tarification sur devis.",
        "price_monthly": 0.0, "price_yearly": 0.0,
        "max_students": None, "max_users": None, "max_storage_gb": None,
        "max_ai_requests": None, "max_exports_per_day": None, "max_campuses": None,
        "features": {"all_features": True, "on_quote": True, "multi_establishment": True},
        "sort_order": 40,
    },
]

# Ligne enterprise telle que seedée par 20260815_0001, restaurée au downgrade.
PREVIOUS_ENTERPRISE = {
    "name": "Enterprise",
    "description": "Groupe scolaire ou université — multi-campus, API, support prioritaire.",
    "currency": "USD", "price_monthly": 99.0, "price_yearly": 990.0,
    "max_students": None, "max_users": None, "max_storage_gb": 200,
    "max_ai_requests": 10000, "max_exports_per_day": None, "max_campuses": None,
    "features": {}, "sort_order": 3,
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _plans_table(conn) -> sa.Table:
    json_type = JSONB if conn.dialect.name == "postgresql" else sa.JSON
    return sa.table(
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


_tenants = sa.table(
    "tenants",
    sa.column("id"),
    sa.column("subscription_plan", sa.String),
    sa.column("subscription_status", sa.String),
    sa.column("trial_ends_at", sa.DateTime),
    sa.column("settings", sa.JSON),
)


def upgrade():
    conn = op.get_bind()
    if not conn.dialect.has_table(conn, "subscription_plans") or not conn.dialect.has_table(conn, "tenants"):
        return
    plans = _plans_table(conn)
    now = _now()

    # 1. Catalogue (idempotent : upsert par slug).
    existing = {row.slug for row in conn.execute(sa.select(plans.c.slug))}
    for plan in PLANS:
        values = {**plan, "currency": "EUR", "is_active": True, "updated_at": now}
        if plan["slug"] in existing:
            conn.execute(plans.update().where(plans.c.slug == plan["slug"]).values(**values))
        else:
            conn.execute(plans.insert().values(id=str(uuid.uuid4()), created_at=now, **values))
    conn.execute(
        plans.update()
        .where(plans.c.slug.in_(LEGACY_SLUGS))
        .values(is_active=False, updated_at=now)
    )

    # 2. Établissements : plus d'offre gratuite ni d'essai illimité.
    trial_end = now + timedelta(days=TRIAL_DAYS)
    rows = conn.execute(
        sa.select(
            _tenants.c.id, _tenants.c.subscription_plan, _tenants.c.subscription_status,
            _tenants.c.trial_ends_at, _tenants.c.settings,
        )
    ).fetchall()
    for row in rows:
        plan = (row.subscription_plan or "starter").lower()
        status = (row.subscription_status or "trialing").lower()
        settings = dict(row.settings or {})
        if BACKUP_KEY in settings:
            continue  # déjà migré

        new_plan, new_status, new_trial_end = plan, status, row.trial_ends_at
        if status == "trialing":
            if plan in ("free", "starter", "pro"):
                new_plan = "standard"
            if row.trial_ends_at is None:
                new_trial_end = trial_end
        elif status == "active" and plan in ("free", "starter"):
            new_plan, new_status, new_trial_end = "standard", "trialing", trial_end

        if (new_plan, new_status, new_trial_end) == (plan, status, row.trial_ends_at):
            continue
        settings[BACKUP_KEY] = {
            "subscription_plan": row.subscription_plan,
            "subscription_status": row.subscription_status,
            "trial_ends_at": row.trial_ends_at.isoformat() if row.trial_ends_at else None,
        }
        conn.execute(
            _tenants.update()
            .where(_tenants.c.id == row.id)
            .values(
                subscription_plan=new_plan,
                subscription_status=new_status,
                trial_ends_at=new_trial_end,
                settings=settings,
            )
        )


def downgrade():
    conn = op.get_bind()
    if not conn.dialect.has_table(conn, "subscription_plans") or not conn.dialect.has_table(conn, "tenants"):
        return
    plans = _plans_table(conn)
    now = _now()

    # 1. Établissements : valeurs d'origine.
    rows = conn.execute(sa.select(_tenants.c.id, _tenants.c.settings)).fetchall()
    for row in rows:
        settings = dict(row.settings or {})
        backup = settings.pop(BACKUP_KEY, None)
        if backup is None:
            continue
        trial_ends_at = backup.get("trial_ends_at")
        conn.execute(
            _tenants.update()
            .where(_tenants.c.id == row.id)
            .values(
                subscription_plan=backup.get("subscription_plan"),
                subscription_status=backup.get("subscription_status"),
                trial_ends_at=datetime.fromisoformat(trial_ends_at) if trial_ends_at else None,
                settings=settings,
            )
        )

    # 2. Catalogue : anciennes offres réactivées, enterprise restaurée.
    conn.execute(
        plans.update().where(plans.c.slug.in_(LEGACY_SLUGS)).values(is_active=True, updated_at=now)
    )
    conn.execute(
        plans.update().where(plans.c.slug == "enterprise").values(**PREVIOUS_ENTERPRISE, updated_at=now)
    )
    # Une offre déjà référencée par un abonnement est désactivée, pas
    # supprimée (la FK passerait plan_id à NULL et perdrait l'historique).
    referenced = {
        row[0]
        for row in conn.execute(
            sa.text(
                "SELECT DISTINCT p.slug FROM subscription_plans p "
                "JOIN tenant_subscriptions s ON s.plan_id = p.id WHERE p.slug IN :slugs"
            ).bindparams(sa.bindparam("slugs", expanding=True)),
            {"slugs": list(NEW_SLUGS)},
        )
    }
    for slug in NEW_SLUGS:
        if slug in referenced:
            conn.execute(plans.update().where(plans.c.slug == slug).values(is_active=False, updated_at=now))
        else:
            conn.execute(plans.delete().where(plans.c.slug == slug))
