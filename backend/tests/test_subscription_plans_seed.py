"""Tests for the default subscription plans seed migration (Phase 4 PR1,
issue #24) — alembic/versions/20260815_0001_seed_default_subscription_plans.py

The SQLite test DB is built via Base.metadata.create_all() (see
tests/conftest.py), not by replaying Alembic migrations, so seeded rows
from this migration never appear there — these tests split accordingly:
a pure-Python check of the migration's PLANS data (runs everywhere) and
an integration check of the actual table content, skipped unless running
against PostgreSQL with migrations applied (the CI "Backend Tests
(PostgreSQL)" job does exactly this via `alembic upgrade head`).
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


@pytest.mark.skipif(
    "sqlite" in os.environ.get("DATABASE_URL", "sqlite"),
    reason="Seed data only exists after a real `alembic upgrade head` run "
           "against PostgreSQL — the SQLite test DB is built from ORM "
           "metadata directly (see tests/conftest.py), not migrations.",
)
class TestSeedPlansIntegration:
    """Only meaningful in the CI 'Backend Tests (PostgreSQL)' job, where
    migrations are actually applied before pytest runs."""

    def test_five_plans_exist_in_db(self, test_engine):
        with test_engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM subscription_plans")).scalar()
        assert count >= 5

    def test_all_expected_slugs_present_in_db(self, test_engine):
        with test_engine.connect() as conn:
            rows = conn.execute(text("SELECT slug FROM subscription_plans")).fetchall()
        slugs = {r[0] for r in rows}
        assert {"free", "starter", "pro", "enterprise", "institution"} <= slugs
