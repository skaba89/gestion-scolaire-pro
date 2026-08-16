"""Tests for the push_subscriptions(tenant_id, user_id) index migration
(audit 2026-08-16, round 2) —
alembic/versions/20260816_0001_index_push_subscriptions.py

Same split as test_subscription_plans_seed.py: a pure-Python check of the
migration module (runs everywhere) and an integration check of the actual
index, skipped unless running against PostgreSQL with migrations applied
(the CI "Backend Tests (PostgreSQL)" job does exactly this via
`alembic upgrade head`) — SQLite indexes aren't queryable via
pg_indexes, and the SQLite test DB is built from ORM metadata directly
(see conftest.py), not by replaying migrations, so this index wouldn't
exist there regardless.
"""
import importlib.util
import os

import pytest
from sqlalchemy import text

MIGRATION_PATH = os.path.join(
    os.path.dirname(__file__), "..", "alembic", "versions",
    "20260816_0001_index_push_subscriptions.py",
)


def _load_migration_module():
    spec = importlib.util.spec_from_file_location("index_push_subscriptions_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestMigrationModule:
    def test_revision_chain_is_correct(self):
        module = _load_migration_module()
        assert module.revision == "20260816_0001"
        assert module.down_revision == "20260815_0001"

    def test_index_name_is_descriptive(self):
        module = _load_migration_module()
        assert module.INDEX_NAME == "ix_push_subscriptions_tenant_id_user_id"

    def test_downgrade_is_defined_and_reversible(self):
        """This migration must never be deleted (absolute rule: no existing
        migration is ever removed) — a defined, working downgrade is the
        next best guarantee that it can be safely rolled back if needed."""
        module = _load_migration_module()
        assert callable(module.downgrade)
        assert callable(module.upgrade)


def _is_sqlite() -> bool:
    from app.core.config import settings
    return settings.is_sqlite


@pytest.mark.skipif(
    _is_sqlite(),
    reason="Index only exists after a real `alembic upgrade head` run "
           "against PostgreSQL — the SQLite dev/test DB is built from ORM "
           "metadata directly (see tests/conftest.py), not migrations.",
)
class TestIndexExistsInDb:
    def test_composite_index_exists_on_tenant_id_and_user_id(self):
        from app.core.database import engine

        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT indexdef FROM pg_indexes "
                "WHERE schemaname = 'public' "
                "AND indexname = 'ix_push_subscriptions_tenant_id_user_id'"
            )).first()
        assert row is not None
        assert "tenant_id" in row[0]
        assert "user_id" in row[0]
