"""Filet de sécurité générique : force ON DELETE CASCADE sur toute FK
tenant_id -> tenants.id qui ne l'a pas déjà.

Revision ID: 20260827_0003
Revises: 20260827_0002
Create Date: 2026-08-27

Signalé en direct par un utilisateur (capture d'écran) : suppression
d'un tenant bloquée par une IntegrityError sur la table 'public_pages'
(diagnostic ajouté dans PR #134, qui a permis d'identifier précisément
cette table — auparavant l'erreur Postgres réelle était avalée dans les
logs serveur).

MYSTÈRE PARTIELLEMENT RÉSOLU : la migration qui crée public_pages
(20260504_0001_add_public_pages_table.py) déclare bien
`ondelete="CASCADE"` sur son ForeignKeyConstraint tenant_id -> tenants.id
— et `git log --follow -p` confirme que cette ligne n'a JAMAIS été
éditée depuis sa création (pas le cas "fichier corrigé après coup, base
déjà migrée avant" comme pour library_borrow_records, PR #127/#128).
Donc soit cette migration a échoué silencieusement sur la base de
production réelle malgré `alembic_version` la marquant comme appliquée,
soit la table a été créée par un autre chemin avant que cette migration
n'existe puis seulement "tamponnée" comme faite. Impossible de trancher
avec certitude sans accès direct à la base de production — mais peu
importe la cause exacte : le code peut diverger de l'état réel de la
base pour des raisons qu'un audit du code seul ne peut pas détecter
(leçon tirée de cet incident précis).

D'où le choix, plutôt que de corriger seulement public_pages au cas par
cas, de reproduire ici EXACTEMENT le même principe que
_sweep_operational_rls()/20260713_0002_enforce_rls_on_current_tenant_tables.py
pour les policies RLS : découvrir DYNAMIQUEMENT, à l'exécution, toute FK
tenant_id -> tenants.id encore en NO ACTION (jamais explicitement
configurée en CASCADE) et la corriger — au lieu de maintenir une liste
figée de tables (comme 20260717_0002_cascade_tenant_fks.py) qui peut
elle-même être incomplète, exactement le piège qui a produit cet
incident.

EXCLUSION DÉLIBÉRÉE : billing_events.tenant_id est intentionnellement en
ON DELETE SET NULL (journal de facturation censé survivre à la
suppression d'un tenant, voir 20260717_0002_cascade_tenant_fks.py) — le
filtre `delete_rule = 'NO ACTION'` l'exclut déjà naturellement (SET NULL
≠ NO ACTION), mais explicitement re-exclue par nom ci-dessous en
défense en profondeur, au cas où un futur SET NULL similaire serait
ajouté ailleurs.

Idempotente et sûre à rejouer sur un environnement déjà correct — chaque
table est traitée dans son propre bloc EXCEPTION, une erreur sur l'une
n'empêche pas la correction des autres.

SQLite : ignorée (FK cascade PostgreSQL-only, comme les autres filets de
sécurité de cette session).
"""
from alembic import op
from sqlalchemy import text

revision = "20260827_0003"
down_revision = "20260827_0002"
branch_labels = None
depends_on = None

# Tables dont la FK tenant_id -> tenants.id est INTENTIONNELLEMENT autre
# chose que CASCADE — ne jamais les "corriger" ici.
_INTENTIONAL_NON_CASCADE = ("billing_events",)


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

    try:
        conn.execute(text("SAVEPOINT sp_tenant_fk_cascade_sweep"))
        conn.execute(text("""
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT
            tc.table_name,
            tc.constraint_name,
            kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
            AND tc.table_schema = ccu.table_schema
        JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name
            AND tc.table_schema = rc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND ccu.table_schema = 'public'
          AND ccu.table_name = 'tenants'
          AND rc.delete_rule = 'NO ACTION'
          AND tc.table_name <> 'tenants'
          AND tc.table_name NOT IN ('billing_events')
    LOOP
        BEGIN
            EXECUTE format(
                'ALTER TABLE %I DROP CONSTRAINT %I',
                rec.table_name, rec.constraint_name
            );
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES tenants(id) ON DELETE CASCADE',
                rec.table_name, rec.constraint_name, rec.column_name
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'tenant_fk_cascade_sweep: could not fix %.% (%): %',
                rec.table_name, rec.constraint_name, rec.column_name, SQLERRM;
        END;
    END LOOP;
END $$;
"""))
        conn.execute(text("RELEASE SAVEPOINT sp_tenant_fk_cascade_sweep"))
    except Exception as e:
        conn.execute(text("ROLLBACK TO SAVEPOINT sp_tenant_fk_cascade_sweep"))
        print(f"[20260827_0003] Warning: {e}")


def downgrade():
    # Ne retire aucune contrainte CASCADE — la reculer réintroduirait
    # exactement le bug signalé. No-op, comme les autres filets de
    # sécurité de cette session.
    pass
