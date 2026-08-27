"""Tests for the tenant_id -> tenants.id FK cascade sweep migration (audit
2026-08-27, follow-up to PR #134) —
alembic/versions/20260827_0003_fix_public_pages_tenant_fk_cascade.py

Signalé en direct par un utilisateur : suppression d'un tenant bloquée
par une IntegrityError sur 'public_pages' malgré le fait que sa
migration d'origine (20260504_0001_add_public_pages_table.py) déclare
bien `ondelete="CASCADE"` et n'a jamais été modifiée (`git log --follow
-p`). Cette migration corrige dynamiquement, sur la base réelle, toute
FK tenant_id -> tenants.id encore en NO ACTION — pas seulement
public_pages — au cas où d'autres tables souffriraient de la même
divergence code/base non détectable par un audit statique.

Même découpage que test_push_subscriptions_index_migration.py : un
contrôle pur-Python du module de migration (tourne partout) + un
contrôle d'intégration de l'effet réel, sauté sauf contre PostgreSQL
avec migrations appliquées (job CI "Backend Tests (PostgreSQL)")."""
import importlib.util
import os

import pytest
from sqlalchemy import text

MIGRATION_PATH = os.path.join(
    os.path.dirname(__file__), "..", "alembic", "versions",
    "20260827_0003_fix_public_pages_tenant_fk_cascade.py",
)


def _load_migration_module():
    spec = importlib.util.spec_from_file_location("fix_public_pages_tenant_fk_cascade_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestMigrationModule:
    def test_revision_chain_is_correct(self):
        module = _load_migration_module()
        assert module.revision == "20260827_0003"
        assert module.down_revision == "20260827_0002"

    def test_downgrade_is_a_deliberate_no_op(self):
        """Reculer cette migration réintroduirait exactement le bug
        signalé (perte du CASCADE) — downgrade() doit exister et ne rien
        faire, jamais retirer la contrainte."""
        module = _load_migration_module()
        assert callable(module.downgrade)
        assert callable(module.upgrade)
        # ne doit lever aucune exception et n'a besoin d'aucune connexion
        module.downgrade()

    def test_billing_events_is_excluded_from_the_sweep(self):
        """billing_events.tenant_id est intentionnellement en ON DELETE
        SET NULL (journal de facturation censé survivre à la suppression
        d'un tenant) — le sweep ne doit jamais le "corriger" en CASCADE."""
        module = _load_migration_module()
        assert "billing_events" in module._INTENTIONAL_NON_CASCADE

    def test_is_sqlite_detects_the_local_test_engine(self):
        module = _load_migration_module()
        from app.core.database import engine

        with engine.connect() as conn:
            assert module._is_sqlite(conn) == _is_sqlite()


def _is_sqlite() -> bool:
    from app.core.config import settings
    return settings.is_sqlite


@pytest.mark.skipif(
    _is_sqlite(),
    reason="La correction de contrainte FK ne s'applique que contre "
           "PostgreSQL après un vrai `alembic upgrade head` — la base de "
           "test SQLite est construite depuis les métadonnées ORM "
           "directement (voir tests/conftest.py), pas via les migrations.",
)
class TestPublicPagesCascadeExistsInDb:
    def test_public_pages_tenant_id_fk_is_on_delete_cascade(self):
        from app.core.database import engine

        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT rc.delete_rule
                FROM information_schema.table_constraints tc
                JOIN information_schema.referential_constraints rc
                    ON tc.constraint_name = rc.constraint_name
                    AND tc.table_schema = rc.constraint_schema
                WHERE tc.table_schema = 'public'
                  AND tc.table_name = 'public_pages'
                  AND tc.constraint_type = 'FOREIGN KEY'
                  AND tc.constraint_name = 'public_pages_tenant_id_fkey'
            """)).first()
        assert row is not None
        assert row[0] == "CASCADE"
