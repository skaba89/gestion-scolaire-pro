"""Adopt library_categories/library_resources/library_borrow_records into
Alembic (Horizon 2, troisième pilote après clubs puis surveys — voir
20260822_0001_adopt_clubs_tables.py et 20260823_0001_adopt_surveys_tables.py).

Revision ID: 20260827_0001
Revises: 20260823_0001
Create Date: 2026-08-27

Pourquoi (même rationale que les pilotes précédents) :
- library_categories/library_resources/library_borrow_records étaient
  gérées via du DDL brut dans app/core/operational_tables.py, hors
  Base.metadata, donc jamais créées dans la base de test SQLite — ce
  module n'avait aucun test possible avant ce correctif (en plus,
  les endpoints existants utilisent gen_random_uuid()/NOW(), du SQL
  Postgres-only qui casse de toute façon sur SQLite).
- Passage sous Alembic + modèles SQLAlchemy (app/models/library.py). Les
  blocs DDL correspondants sont retirés d'operational_tables.py dans le
  même commit.

CE PILOTE REPRODUIT LE PIÈGE "clubs.meeting_day" (voir 20260822_0001) :
contrairement à surveys (où la migration Alembic d'origine avait déjà le
bon schéma), la migration 20260406_create_operational_tables créait
library_categories/library_resources avec un schéma MINIMAL — sans isbn,
total_copies, available_copies, file_url, cover_url, external_url,
publication_year, tags, is_featured, is_public, views_count. Ces colonnes
n'ont jamais existé que via des ALTER TABLE ADD COLUMN IF NOT EXISTS
ajoutés bien plus tard dans operational_tables.py (~ligne 1052, avec un
commentaire explicite : "jamais créées -> UndefinedColumn systématique à
la création d'une ressource"). Un simple CREATE TABLE IF NOT EXISTS ici
serait un no-op sur tout environnement réel (la table existe déjà depuis
20260406) — cette migration réplique donc aussi CHAQUE ALTER TABLE ADD
COLUMN historique, vérifiés un par un en lisant operational_tables.py
avant d'écrire ce fichier (lignes 27-54, 869-881, 927-928, 1052-1067).

library_borrow_records n'a, elle, jamais eu de modèle Alembic d'origine
(créée uniquement via le DDL brut ~ligne 870) — CREATE TABLE IF NOT
EXISTS ici est donc bien le créateur réel sur tout environnement où elle
n'existe pas encore. Ses colonnes resource_id/borrowed_by sont de simples
UUID sans contrainte FK dans le DDL d'origine — reproduites à l'identique
(pas de nouvelle contrainte qui pourrait échouer sur des données de
production existantes).

RLS : library_borrow_records a des policies RLS explicites dans
operational_tables.py (~ligne 970), mais _sweep_operational_rls() —
appelée génériquement à chaque démarrage réel dans
ensure_operational_tables() — détecte déjà TOUTE table avec une colonne
tenant_id et lui applique RLS + une policy d'isolation si absente. Pas
besoin de les répliquer ici (même conclusion que pour clubs/surveys).

BUG RÉEL, PAS SEULEMENT DE LA DETTE TECHNIQUE : les endpoints
POST/PUT /library/resources/, POST /library/categories/, POST
/library/borrow/ et POST /library/return/ utilisaient tous
gen_random_uuid()/NOW(), du SQL strictement PostgreSQL — jamais
exécutable sur SQLite, donc jamais couvert par un seul test avant cette
migration (même situation que public_apply()/create_admission() pour les
admissions, et l'ancien /surveys/{id}/submit/). Réécrits en ORM dans ce
commit (app/api/v1/endpoints/operational/library.py), donc désormais
testables et testés.

SQLite : ignorée (les modèles ORM assurent déjà la création du schéma
via Base.metadata.create_all() dans les tests).
"""
from alembic import op
from sqlalchemy import text

revision = "20260827_0001"
down_revision = "20260823_0001"
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
        CREATE TABLE IF NOT EXISTS library_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            color VARCHAR(50),
            description VARCHAR(500),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_library_categories_tenant_id ON library_categories(tenant_id)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS library_resources (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            category_id UUID REFERENCES library_categories(id) ON DELETE SET NULL,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            author VARCHAR(255),
            resource_type VARCHAR(100),
            uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
            isbn VARCHAR(50),
            total_copies INTEGER DEFAULT 1,
            available_copies INTEGER DEFAULT 1,
            file_url VARCHAR(1000),
            cover_url VARCHAR(1000),
            external_url VARCHAR(1000),
            publication_year INTEGER,
            tags JSONB DEFAULT '[]'::jsonb,
            is_featured BOOLEAN DEFAULT false,
            is_public BOOLEAN DEFAULT false,
            views_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_library_resources_tenant_id ON library_resources(tenant_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_library_resources_category_id ON library_resources(category_id)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS library_borrow_records (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            resource_id UUID NOT NULL,
            borrowed_by UUID NOT NULL,
            borrowed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            due_date DATE,
            returned_at TIMESTAMPTZ,
            status VARCHAR(20) NOT NULL DEFAULT 'BORROWED',
            notes TEXT
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_library_borrow_tenant ON library_borrow_records (tenant_id, status)"))

    # Aligne un environnement déjà existant (cas réel de production) sur
    # le schéma complet ci-dessus. No-op sur un environnement fraîchement
    # créé par les CREATE TABLE précédents (colonnes déjà présentes).
    try:
        conn.execute(text("SAVEPOINT sp_library_fix"))
        conn.execute(text("""
DO $$
BEGIN
    ALTER TABLE library_categories ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE library_resources ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS isbn VARCHAR(50);
    ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS total_copies INTEGER DEFAULT 1;
    ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS available_copies INTEGER DEFAULT 1;
    ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS file_url VARCHAR(1000);
    ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS cover_url VARCHAR(1000);
    ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS external_url VARCHAR(1000);
    ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS publication_year INTEGER;
    ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
    ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
    ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
"""))
        conn.execute(text("RELEASE SAVEPOINT sp_library_fix"))
    except Exception as e:
        conn.execute(text("ROLLBACK TO SAVEPOINT sp_library_fix"))
        print(f"[20260827_0001] Warning: {e}")


def downgrade():
    # Ne supprime pas les tables : elles portent potentiellement des
    # données réelles de tenants. No-op, comme les pilotes précédents.
    pass
