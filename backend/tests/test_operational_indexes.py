"""Composite (tenant_id, timestamp) indexes on operational/ tables —
national audit Phase 3 (scalability), continuation of the pagination fix.

Every list_* endpoint fixed in test_operational_pagination.py filters by
tenant_id and sorts by a timestamp column (ORDER BY ... DESC LIMIT :limit).
With only a single-column tenant_id index, Postgres can use the index for
the filter but still has to sort the matching rows separately — a composite
(tenant_id, timestamp) index lets it satisfy both from the index directly.

Postgres-only (checks pg_indexes) — skipped on the SQLite default since
index strategy isn't meaningfully portable between engines here.
"""
import pytest
from sqlalchemy import text

from conftest import get_test_client

# This file's own claim below is to be self-sufficient regardless of what ran
# before it in the same session. That requires the ORM schema (tenants,
# departments, users, ... — every FK target in operational_tables.py's raw
# DDL) to exist first: get_test_client() runs Base.metadata.create_all() for
# that. Without it, every ensure_operational_tables() statement fails on
# "relation \"tenants\" does not exist" and every index in EXPECTED_INDEXES
# is reported missing — not because the feature is broken, but because this
# file forgot to build its own prerequisites (caught by running this file in
# isolation: it previously relied entirely on an earlier test file in the
# same run having already created the schema).
client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402


pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Composite index verification is Postgres-specific (pg_indexes).",
)

if engine.dialect.name == "postgresql":
    # incidents/appointments only exist once ensure_operational_tables() has
    # run (no Alembic migration creates them) — see test_operational_
    # pagination.py for the full explanation. get_test_client()'s no-op
    # lifespan skips this at app startup, so tests in this file trigger it
    # directly to be self-sufficient regardless of what ran before them.
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

EXPECTED_INDEXES = [
    "ix_incidents_tenant_occurred",
    "ix_appointments_tenant_date",
    "ix_inventory_items_tenant_created",
    "ix_inventory_transactions_tenant_created",
    "ix_orders_tenant_created",
    "ix_library_resources_tenant_created",
    "ix_announcements_tenant_created",
    "ix_student_forums_tenant_created",
    "ix_student_badges_tenant_issued",
    "ix_career_event_registrations_tenant_registered",
    "ix_alumni_document_requests_alumni_created",
    "ix_surveys_tenant_created",
]


class TestOperationalCompositeIndexes:
    @pytest.mark.parametrize("index_name", EXPECTED_INDEXES)
    def test_index_exists(self, index_name):
        with SessionLocal() as db:
            exists = db.execute(
                text("SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :i)"),
                {"i": index_name},
            ).scalar()
        assert exists, (
            f"{index_name} missing — either the 20260724_0001 Alembic migration "
            "hasn't run, or (for incidents/appointments, created only at app "
            "startup, not by a migration) app.core.operational_tables.ensure_"
            "operational_tables() hasn't run."
        )

    def test_indexes_are_actually_composite_not_single_column(self):
        """Guards against a future edit accidentally recreating one of these
        as a plain single-column tenant_id index under the same name."""
        with SessionLocal() as db:
            for index_name in EXPECTED_INDEXES:
                indexdef = db.execute(
                    text("SELECT indexdef FROM pg_indexes WHERE indexname = :i"),
                    {"i": index_name},
                ).scalar()
                if indexdef is None:
                    continue  # already reported by test_index_exists
                col_count = indexdef.count(",") + 1
                assert col_count >= 2, f"{index_name} is not composite: {indexdef}"
