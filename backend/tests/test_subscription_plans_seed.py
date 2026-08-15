"""Tests for the default subscription plans seed migration (Phase 4 PR1,
issue #24) — alembic/versions/20260815_0001_seed_default_subscription_plans.py

The SQLite test DB is built via Base.metadata.create_all() (see
tests/conftest.py), not by replaying Alembic migrations, so seeded rows
from this migration never appear there — these tests split accordingly:
a pure-Python check of the migration's PLANS data (runs everywhere) and
an integration check of the actual table content, skipped unless running
against PostgreSQL with migrations applied (the CI "Backend Tests
(PostgreSQL)" job does exactly this via `alembic upgrade head`).

IMPORTANT: the integration checks below deliberately do NOT use the
`test_engine` fixture from conftest.py — that fixture is hardcoded to its
own dedicated `sqlite:///./test_schoolflow.db` file regardless of
DATABASE_URL (see SQLALCHEMY_TEST_DATABASE_URL in conftest.py), so it can
never see data seeded into the real, Alembic-migrated database. This was
caught by the CI "Backend Tests (PostgreSQL)" job actually failing with
`sqlite3.OperationalError: no such table: subscription_plans` even though
that job runs against real Postgres — proof the first version of this
test file was checking the wrong database entirely. Using
`app.core.database.engine` (the same engine the app and Alembic both use,
built from `settings.DATABASE_URL_SYNC`) instead.
"""
import importlib.util
import os

import pytest
from sqlalchemy import text

MIGRATION_PATH = os.path.join(
    os.path.dirname(__file__), "..", "alembic", "versions",
    "20260815_0001_seed_default_subscription_plans.py",
)


def _load_migration_module():
    spec = importlib.util.spec_from_file_location("seed_plans_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestSeedPlansData:
    """Pure-Python sanity checks on the migration's PLANS constant — no DB needed."""

    def test_five_plans_defined(self):
        module = _load_migration_module()
        assert len(module.PLANS) == 5

    def test_slugs_are_unique(self):
        module = _load_migration_module()
        slugs = [p["slug"] for p in module.PLANS]
        assert len(slugs) == len(set(slugs))

    def test_expected_slugs_present(self):
        module = _load_migration_module()
        slugs = {p["slug"] for p in module.PLANS}
        assert slugs == {"free", "starter", "pro", "enterprise", "institution"}

    def test_sort_order_is_sequential_and_unique(self):
        module = _load_migration_module()
        orders = sorted(p["sort_order"] for p in module.PLANS)
        assert orders == list(range(len(module.PLANS)))

    def test_no_negative_pricing(self):
        module = _load_migration_module()
        for p in module.PLANS:
            assert p["price_monthly"] >= 0
            assert p["price_yearly"] >= 0

    def test_no_stripe_price_ids_hardcoded(self):
        """This migration seeds the plan catalog only — it must not wire up
        a live Stripe price ID, since no payment provider is activated by
        seeding plan rows (see migration docstring)."""
        module = _load_migration_module()
        for p in module.PLANS:
            assert "stripe_price_monthly_id" not in p
            assert "stripe_price_yearly_id" not in p


def _is_sqlite() -> bool:
    from app.core.config import settings
    return settings.is_sqlite


@pytest.mark.skipif(
    _is_sqlite(),
    reason="Seed data only exists after a real `alembic upgrade head` run "
           "against PostgreSQL — the SQLite dev/test DB is built from ORM "
           "metadata directly (see tests/conftest.py's get_test_client()), "
           "not migrations.",
)
class TestSeedPlansIntegration:
    """Only meaningful in the CI 'Backend Tests (PostgreSQL)' job, where
    migrations are actually applied before pytest runs. Uses the app's own
    engine (app.core.database.engine, built from DATABASE_URL_SYNC) —
    NOT the test_engine fixture, which is a separate, hardcoded SQLite
    file unrelated to whatever DATABASE_URL points at (see module
    docstring)."""

    def test_five_plans_exist_in_db(self):
        from app.core.database import engine

        with engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM subscription_plans")).scalar()
        assert count >= 5

    def test_all_expected_slugs_present_in_db(self):
        from app.core.database import engine

        with engine.connect() as conn:
            rows = conn.execute(text("SELECT slug FROM subscription_plans")).fetchall()
        slugs = {r[0] for r in rows}
        assert {"free", "starter", "pro", "enterprise", "institution"} <= slugs
