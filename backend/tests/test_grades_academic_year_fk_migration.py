"""Validate additive schema repair with retained rows and refused orphan data."""
import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import inspect, text

from app.core.database import engine


def _migration():
    path = Path(__file__).parents[1] / "alembic/versions/20261114_0001_grades_academic_year_fk.py"
    spec = importlib.util.spec_from_file_location("grades_year_fk", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_revision_is_additive_and_chained():
    module = _migration()
    assert module.revision == "20261114_0001"
    assert module.down_revision == "20261112_0002"
    assert module.backward_compatible is True


@pytest.fixture
def shadow_tables():
    if engine.dialect.name != "postgresql":
        pytest.skip("Migration and catalog validation require PostgreSQL")
    # Temporary tables shadow the real tables in this connection only. No
    # DROP/ALTER of a live application table, no shared test-state mutation.
    with engine.connect() as conn:
        conn.execute(text("CREATE TEMP TABLE academic_years (id uuid PRIMARY KEY) ON COMMIT DROP"))
        conn.execute(text("CREATE TEMP TABLE grades (id uuid PRIMARY KEY, academic_year_id uuid, score float NOT NULL) ON COMMIT DROP"))
        yield conn
        conn.rollback()


def test_repair_preserves_existing_grades_and_is_repeatable(shadow_tables, monkeypatch):
    conn = shadow_tables
    year, grade, manual = (uuid4() for _ in range(3))
    conn.execute(text("INSERT INTO academic_years VALUES (:id)"), {"id": year})
    conn.execute(text("INSERT INTO grades VALUES (:g,:y,14),(:m,NULL,17)"), {"g": grade, "y": year, "m": manual})
    before = conn.execute(text("SELECT id,academic_year_id,score FROM grades ORDER BY id")).all()
    module = _migration()
    monkeypatch.setattr(module, "op", Operations(MigrationContext.configure(conn)))
    module.upgrade()
    module.upgrade()
    assert conn.execute(text("SELECT id,academic_year_id,score FROM grades ORDER BY id")).all() == before
    fk = next(fk for fk in inspect(conn).get_foreign_keys("grades") if fk["constrained_columns"] == ["academic_year_id"])
    assert fk["referred_table"] == "academic_years"
    assert fk["options"]["ondelete"] == "SET NULL"
    assert conn.execute(text("SELECT convalidated FROM pg_constraint WHERE conrelid='pg_temp.grades'::regclass AND contype='f'")).scalar_one()
    module.downgrade()
    assert not inspect(conn).get_foreign_keys("grades")
    assert conn.execute(text("SELECT id,academic_year_id,score FROM grades ORDER BY id")).all() == before


def test_orphan_preflight_refuses_migration_without_truncating_or_reassigning(shadow_tables, monkeypatch):
    conn = shadow_tables
    grade, missing = uuid4(), uuid4()
    conn.execute(text("INSERT INTO grades VALUES (:g,:y,12)"), {"g": grade, "y": missing})
    module = _migration()
    monkeypatch.setattr(module, "op", Operations(MigrationContext.configure(conn)))
    with pytest.raises(RuntimeError, match="1 grade.*missing academic year"):
        module.upgrade()
    assert conn.execute(text("SELECT academic_year_id, score FROM grades WHERE id=:g"), {"g": grade}).one() == (missing, 12)
    assert not inspect(conn).get_foreign_keys("grades")


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Real migrated PostgreSQL catalog")
def test_migrated_application_schema_has_validated_year_fk_and_index():
    with engine.connect() as conn:
        fk = next((fk for fk in inspect(conn).get_foreign_keys("grades")
                   if fk["constrained_columns"] == ["academic_year_id"]), None)
        assert fk is not None, "SCHEMA-DRIFT-01: academic_year_id is missing its real foreign key"
        assert fk["referred_table"] == "academic_years"
        assert fk["options"]["ondelete"] == "SET NULL"
        assert conn.execute(text("SELECT convalidated FROM pg_constraint WHERE conrelid='grades'::regclass AND conname=:name"), {"name": fk["name"]}).scalar_one()
        assert any(i["column_names"] == ["academic_year_id"] for i in inspect(conn).get_indexes("grades"))
