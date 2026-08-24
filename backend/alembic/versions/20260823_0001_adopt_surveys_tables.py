"""Adopt surveys/survey_questions/survey_responses into Alembic (Horizon 2,
suite du pilote clubs — voir 20260822_0001_adopt_clubs_tables.py).

Revision ID: 20260823_0001
Revises: 20260822_0001
Create Date: 2026-08-23

Pourquoi (même rationale que le pilote clubs) :
- surveys/survey_questions/survey_responses étaient gérées via du DDL
  brut dans app/core/operational_tables.py, hors Base.metadata, donc
  jamais créées dans la base de test SQLite — ce module n'avait aucun
  test possible avant ce correctif.
- Passage sous Alembic + modèles SQLAlchemy (app/models/survey.py). Les
  blocs DDL correspondants sont retirés d'operational_tables.py dans le
  même commit.

CREATE TABLE IF NOT EXISTS ci-dessous est un no-op en production. Ici,
contrairement au pilote clubs, la migration Alembic d'origine
(20260406_create_operational_tables) créait déjà ces 3 tables avec le
bon schéma dès le départ (colonnes options/response_data en JSONB,
survey_responses.response_data — pas de colonnes manquantes comme
clubs.meeting_day) : vérifié en lisant cette migration avant d'écrire
celle-ci, pas d'ALTER TABLE ADD COLUMN nécessaire ici. Seuls les deux
correctifs déjà connus du pilote clubs s'appliquent, à l'identique :
  - id avec DEFAULT gen_random_uuid() (operational_tables.py ~ligne 979).
  - surveys.created_by → users(id), pas profiles(id) — la FK d'origine
    a été corrigée en cours de route (operational_tables.py ~ligne 1002).

BUG RÉEL CORRIGÉ EN MIGRANT (pas seulement de la dette technique) :
l'ancien endpoint POST /surveys/{id}/submit/ appelait `UUID()` sans
argument (TypeError systématique, capturé par le except générique et
renvoyé comme un 400 anodin) ET, même sans ce bug, tentait d'insérer
dans survey_responses des colonnes qui n'existent pas sur la vraie
table (question_id/response_text/submitted_by/submitted_at — la vraie
table n'a que respondent_id + response_data JSONB, un blob par session
de réponse, pas une ligne par question). Soumettre une réponse à un
sondage n'a donc probablement jamais fonctionné en production. Corrigé
dans ce commit (app/api/v1/endpoints/operational/surveys.py +
app/crud/survey.py), pas seulement migré vers l'ORM.

SQLite : ignorée (les modèles ORM assurent déjà la création du schéma
via Base.metadata.create_all() dans les tests).
"""
from alembic import op
from sqlalchemy import text

revision = "20260823_0001"
down_revision = "20260822_0001"
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
        CREATE TABLE IF NOT EXISTS surveys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            target_audience VARCHAR(100) DEFAULT 'ALL',
            is_anonymous BOOLEAN DEFAULT false,
            is_active BOOLEAN DEFAULT true,
            starts_at TIMESTAMPTZ,
            ends_at TIMESTAMPTZ,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_surveys_tenant_id ON surveys(tenant_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_surveys_created_by ON surveys(created_by)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS survey_questions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            question_text TEXT NOT NULL,
            question_type VARCHAR(50) NOT NULL,
            options JSONB,
            order_index INTEGER NOT NULL DEFAULT 0,
            is_required BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_survey_questions_tenant_id ON survey_questions(tenant_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_survey_questions_survey_id ON survey_questions(survey_id)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS survey_responses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            respondent_id UUID,
            response_data JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_survey_responses_tenant_id ON survey_responses(tenant_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_survey_responses_survey_id ON survey_responses(survey_id)"))

    # Aligne une table déjà existante (cas réel de production) sur les
    # deux correctifs connus. No-op sur un environnement fraîchement créé
    # par le CREATE TABLE précédent.
    try:
        conn.execute(text("SAVEPOINT sp_surveys_fix"))
        conn.execute(text("""
DO $$
BEGIN
    ALTER TABLE surveys ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE survey_questions ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE survey_responses ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_created_by_fkey;
    ALTER TABLE surveys ADD CONSTRAINT surveys_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
"""))
        conn.execute(text("RELEASE SAVEPOINT sp_surveys_fix"))
    except Exception as e:
        conn.execute(text("ROLLBACK TO SAVEPOINT sp_surveys_fix"))
        print(f"[20260823_0001] Warning: {e}")


def downgrade():
    # Ne supprime pas les tables : elles portent potentiellement des
    # données réelles de tenants. No-op, comme le pilote clubs.
    pass
