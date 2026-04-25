"""Row Level Security sur les tables opérationnelles (sans modèle SQLAlchemy).

Revision ID: 20260424_0002
Revises: 20260424_0001
Create Date: 2026-04-24

Pourquoi :
- 54 tables créées via operational_tables.py n'avaient aucun RLS PostgreSQL.
- Sans RLS, un tenant peut accéder aux données d'un autre si un endpoint
  oublie le filtre WHERE tenant_id = :tenant_id.
- Cette migration applique une policy d'isolation tenant sur toutes ces tables.
- SUPER_ADMIN bypass : current_setting('app.is_superadmin') = 'true'
  → permet au SUPER_ADMIN de voir tous les tenants.

Note : SQLite ne supporte pas RLS — la migration est ignorée silencieusement.
"""
from alembic import op
from sqlalchemy import text

revision = "20260424_0002"
down_revision = "20260424_0001"
branch_labels = None
depends_on = None

# Tables opérationnelles à sécuriser par RLS
# Source : backend/app/core/operational_tables.py
OPERATIONAL_TABLES = [
    "inventory_items",
    "inventory_categories",
    "inventory_movements",
    "clubs",
    "club_members",
    "club_activities",
    "club_events",
    "surveys",
    "survey_questions",
    "survey_responses",
    "announcements",
    "messages",
    "message_recipients",
    "message_threads",
    "alumni_profiles",
    "alumni_employment",
    "mentorship_requests",
    "mentorship_sessions",
    "incidents",
    "incident_followups",
    "early_warnings",
    "success_plans",
    "success_plan_objectives",
    "bookings",
    "booking_slots",
    "booking_resources",
    "events",
    "event_registrations",
    "forum_topics",
    "forum_posts",
    "forum_reactions",
    "scholarships",
    "scholarship_applications",
    "sponsorships",
    "sponsorship_payments",
    "certificates",
    "certificate_templates",
    "elearning_courses",
    "elearning_modules",
    "elearning_lessons",
    "elearning_progress",
    "library_books",
    "library_loans",
    "hr_contracts",
    "hr_leaves",
    "hr_evaluations",
    "hr_positions",
    "careers_offers",
    "careers_applications",
    "digital_signatures",
    "qr_codes",
    "marketplace_items",
    "marketplace_orders",
    "video_meetings",
    "meeting_participants",
]


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(text(
        "SELECT EXISTS ("
        "  SELECT 1 FROM information_schema.tables"
        "  WHERE table_schema = 'public' AND table_name = :t"
        ")"
    ), {"t": table_name})
    return bool(result.scalar())


def _is_sqlite(conn) -> bool:
    """RLS non supporté par SQLite — détecter et ignorer."""
    try:
        result = conn.execute(text("SELECT current_database()"))
        result.fetchone()
        return False
    except Exception:
        return True


def upgrade():
    conn = op.get_bind()

    if _is_sqlite(conn):
        # SQLite : pas de RLS, isolation gérée au niveau applicatif
        return

    applied = 0
    skipped = 0

    for table in OPERATIONAL_TABLES:
        if not _table_exists(conn, table):
            skipped += 1
            continue

        try:
            # Activer RLS
            conn.execute(text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY;'))
            conn.execute(text(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY;'))

            # Supprimer les policies existantes si elles existent (idempotent)
            conn.execute(text(
                f'DROP POLICY IF EXISTS "tenant_isolation_{table}" ON "{table}";'
            ))
            conn.execute(text(
                f'DROP POLICY IF EXISTS "superadmin_bypass_{table}" ON "{table}";'
            ))

            # Policy principale : isolation tenant
            conn.execute(text(f"""
                CREATE POLICY "tenant_isolation_{table}" ON "{table}"
                AS PERMISSIVE FOR ALL
                TO PUBLIC
                USING (
                    tenant_id::text = COALESCE(
                        current_setting('app.current_tenant_id', true),
                        ''
                    )
                )
                WITH CHECK (
                    tenant_id::text = COALESCE(
                        current_setting('app.current_tenant_id', true),
                        ''
                    )
                );
            """))

            # Policy SUPER_ADMIN bypass — peut voir tous les tenants
            conn.execute(text(f"""
                CREATE POLICY "superadmin_bypass_{table}" ON "{table}"
                AS PERMISSIVE FOR ALL
                TO PUBLIC
                USING (
                    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
                );
            """))

            applied += 1

        except Exception as e:
            # Log l'erreur mais continue — une table manquante ne doit pas bloquer
            print(f"[RLS] Warning: could not apply RLS on '{table}': {e}")
            skipped += 1

    print(f"[RLS] Applied to {applied} tables, skipped {skipped} tables.")


def downgrade():
    conn = op.get_bind()

    if _is_sqlite(conn):
        return

    for table in OPERATIONAL_TABLES:
        if not _table_exists(conn, table):
            continue
        try:
            conn.execute(text(
                f'DROP POLICY IF EXISTS "tenant_isolation_{table}" ON "{table}";'
            ))
            conn.execute(text(
                f'DROP POLICY IF EXISTS "superadmin_bypass_{table}" ON "{table}";'
            ))
            conn.execute(text(
                f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY;'
            ))
        except Exception:
            pass
