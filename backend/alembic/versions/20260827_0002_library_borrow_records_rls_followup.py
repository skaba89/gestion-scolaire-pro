"""Filet de sécurité : force la RLS sur library_borrow_records même si
20260827_0001 a déjà tourné dans sa version cassée.

Revision ID: 20260827_0002
Revises: 20260827_0001
Create Date: 2026-08-27

Pourquoi une migration séparée plutôt que de compter uniquement sur le
correctif appliqué directement dans 20260827_0001 : Alembic ne réexécute
jamais une révision déjà présente dans `alembic_version`, même si son
fichier source change entre-temps. La PR #126 a été mergée puis
`git push`ée avec un readiness check CI rouge non détecté avant merge
(voir le correctif dans 20260827_0001) — si un déploiement réel (Render)
a exécuté `alembic upgrade head` entre ce merge et ce correctif, la
table library_borrow_records existe déjà sur cet environnement SANS RLS,
et rien ne la protégera rétroactivement sans une NOUVELLE révision.
Cette migration est donc le filet de sécurité garanti de s'exécuter
partout, qu'un environnement ait vu la version cassée de 20260827_0001,
sa version corrigée (où ceci devient un simple no-op idempotent), ou
aucune des deux (base neuve).

SQLite : ignorée (RLS est PostgreSQL-only).
"""
from alembic import op
from sqlalchemy import text

revision = "20260827_0002"
down_revision = "20260827_0001"
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

    # Idempotent : no-op si la table n'existe pas encore (cas d'une base
    # neuve où 20260827_0001, dans sa version corrigée, l'aura déjà créée
    # et protégée juste avant) ou si elle est déjà protégée.
    try:
        conn.execute(text("SAVEPOINT sp_library_borrow_rls_followup"))
        conn.execute(text("""
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class cls
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public' AND cls.relname = 'library_borrow_records'
    ) THEN
        ALTER TABLE library_borrow_records ENABLE ROW LEVEL SECURITY;
        ALTER TABLE library_borrow_records FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "tenant_isolation_library_borrow_records" ON library_borrow_records;
        CREATE POLICY "tenant_isolation_library_borrow_records" ON library_borrow_records
        AS PERMISSIVE FOR ALL TO PUBLIC
        USING (tenant_id::text = COALESCE(current_setting('app.current_tenant_id', true), ''))
        WITH CHECK (tenant_id::text = COALESCE(current_setting('app.current_tenant_id', true), ''));
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
"""))
        conn.execute(text("RELEASE SAVEPOINT sp_library_borrow_rls_followup"))
    except Exception as e:
        conn.execute(text("ROLLBACK TO SAVEPOINT sp_library_borrow_rls_followup"))
        print(f"[20260827_0002] Warning: {e}")


def downgrade():
    pass
