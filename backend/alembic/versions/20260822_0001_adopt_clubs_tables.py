"""Adopt clubs/club_memberships into Alembic (pilote migration modules non-ORM).

Revision ID: 20260822_0001
Revises: 20260816_0001
Create Date: 2026-08-22

Pourquoi :
- clubs et club_memberships étaient jusqu'ici créées via du DDL brut dans
  app/core/operational_tables.py (ensure_operational_tables), exécuté à
  chaque démarrage APRÈS `alembic upgrade head` — un schéma géré hors
  Alembic, jamais visible dans `Base.metadata`, donc jamais créé dans la
  base de test SQLite (qui construit son schéma via
  `Base.metadata.create_all()`, voir tests/conftest.py). Résultat concret :
  ce module n'avait tout simplement aucun test possible avant ce correctif.
- Ce module (pilote de la migration des modules non-ORM listés dans
  l'audit marché, Horizon 2) fait passer clubs/club_memberships sous
  Alembic + modèles SQLAlchemy (app/models/club.py). Les blocs DDL
  correspondants sont retirés d'operational_tables.py dans le même commit.

CREATE TABLE IF NOT EXISTS ci-dessous est un no-op en production (les
tables existent déjà, créées historiquement par operational_tables.py) et
crée le schéma pour tout nouvel environnement. Le schéma reproduit
exactement l'état actuel de production, y compris les correctifs
appliqués après coup par operational_tables.py :
  - id avec DEFAULT gen_random_uuid() (patch "Défaut UUID manquant sur 30
    tables", operational_tables.py ~ligne 1000).
  - clubs.advisor_id → users(id), pas profiles(id) : la FK d'origine vers
    profiles(id) a été corrigée en cours de route (profiles n'a jamais eu
    de ligne peuplée pour ce besoin, operational_tables.py ~ligne 1034).
  - clubs.meeting_day / meeting_time / location : ajoutées après coup
    (présentes dans le Pydantic et les requêtes SQL depuis toujours, mais
    absentes de la table initiale).

SQLite : ignorée (les modèles ORM assurent déjà la création du schéma via
Base.metadata.create_all() dans les tests, voir tests/conftest.py — cette
migration ne fait rien de plus qui y serait utile).
"""
from alembic import op
from sqlalchemy import text

revision = "20260822_0001"
down_revision = "20260816_0001"
branch_labels = None
depends_on = None


def _is_sqlite(conn) -> bool:
    try:
        conn.execute(text("SELECT current_database()")).fetchone()
        return False
    except Exception:
        return True


def upgrade():
    conn = op.get_bind()
    if _is_sqlite(conn):
        return

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS clubs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            advisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
            meeting_day VARCHAR(50),
            meeting_time VARCHAR(50),
            location VARCHAR(255),
            max_members INTEGER,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_clubs_tenant_id ON clubs(tenant_id)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS club_memberships (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            role VARCHAR(50),
            joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_club_memberships_tenant_id ON club_memberships(tenant_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_club_memberships_student_id ON club_memberships(student_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_club_memberships_club_id ON club_memberships(club_id)"))

    # Ceinture et bretelles : si les tables existaient déjà (cas réel de
    # production) mais avec l'ancien défaut manquant sur id ou l'ancienne
    # FK vers profiles(id), les aligner sur le schéma ci-dessus. No-op sur
    # un environnement fraîchement créé par le CREATE TABLE précédent.
    try:
        conn.execute(text("SAVEPOINT sp_clubs_fix"))
        conn.execute(text("""
DO $$
BEGIN
    ALTER TABLE clubs ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE club_memberships ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_advisor_id_fkey;
    ALTER TABLE clubs ADD CONSTRAINT clubs_advisor_id_fkey
        FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
"""))
        conn.execute(text("RELEASE SAVEPOINT sp_clubs_fix"))
    except Exception as e:
        conn.execute(text("ROLLBACK TO SAVEPOINT sp_clubs_fix"))
        print(f"[20260822_0001] Warning: {e}")


def downgrade():
    # Ne supprime pas les tables : elles portent potentiellement des
    # données réelles de tenants (clubs et adhésions). Downgrade
    # volontairement un no-op, comme le précédent de ce type
    # (20260424_0003_ensure_core_table_columns.py).
    pass
