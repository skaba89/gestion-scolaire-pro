"""PostgreSQL tests for P2 — schema/code compatibility (schema_migration_compat).

CI applies `alembic upgrade head` before pytest, so the env.py
`on_version_apply` hook has already recorded 20261008_0001. These tests
check that recording, the hook's upgrade/downgrade behaviour, that a
restricted runtime role (NOBYPASSRLS, no explicit grant) can read the
table, and the end-to-end decision of _check_alembic_revision() against a
database simulated as ahead of the code.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from conftest import get_test_client

get_test_client()  # app/config bootstrap, same as the other PostgreSQL test modules

from app.core.database import engine  # noqa: E402
from app.core.schema_compat import COMPAT_TABLE, record_migration_compat  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="PostgreSQL-specific (alembic_version).")

RESTRICTED_ROLE = "test_schema_compat_role"
RESTRICTED_PASSWORD = "test-only-schema-compat-password"  # noqa: S105 — disposable, local test DB only
FAKE_PREFIX = "zz_p2_fake_"


def _step(revision, down_revision, *, is_upgrade=True, declared=True):
    module = SimpleNamespace() if declared is None else SimpleNamespace(backward_compatible=declared)
    script = SimpleNamespace(module=module, down_revision=down_revision)
    return SimpleNamespace(up_revision_id=revision, up_revision=script, is_upgrade=is_upgrade)


def _current_revision():
    with engine.connect() as conn:
        return conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()


def test_upgrade_recorded_the_p2_migration():
    with engine.connect() as conn:
        row = conn.execute(text(
            f"SELECT down_revision, backward_compatible FROM {COMPAT_TABLE} WHERE revision = '20261008_0001'"
        )).one()
    assert row == ("20261007_0002", True)


def test_hook_writes_on_upgrade_and_deletes_on_downgrade():
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            record_migration_compat(conn, _step(f"{FAKE_PREFIX}a", "20261008_0001"))
            record_migration_compat(conn, _step(f"{FAKE_PREFIX}b", f"{FAKE_PREFIX}a", declared=None))
            rows = dict(conn.execute(text(
                f"SELECT revision, backward_compatible FROM {COMPAT_TABLE} WHERE revision LIKE :p"
            ), {"p": f"{FAKE_PREFIX}%"}).all())
            assert rows == {f"{FAKE_PREFIX}a": True, f"{FAKE_PREFIX}b": False}  # undeclared -> fail closed

            record_migration_compat(conn, _step(f"{FAKE_PREFIX}b", f"{FAKE_PREFIX}a", is_upgrade=False))
            remaining = conn.execute(text(
                f"SELECT revision FROM {COMPAT_TABLE} WHERE revision LIKE :p"
            ), {"p": f"{FAKE_PREFIX}%"}).scalars().all()
            assert remaining == [f"{FAKE_PREFIX}a"]
        finally:
            trans.rollback()


def test_restricted_runtime_role_can_read_the_table():
    with engine.connect() as setup:
        setup.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
        setup.execute(text(
            f'CREATE ROLE "{RESTRICTED_ROLE}" LOGIN PASSWORD \'{RESTRICTED_PASSWORD}\' '
            "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"
        ))
        setup.commit()
    url = make_url(engine.url).set(username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD)
    restricted = create_engine(url)
    try:
        with restricted.connect() as conn:
            count = conn.execute(text(f"SELECT count(*) FROM {COMPAT_TABLE}")).scalar_one()
        assert count >= 1
    finally:
        restricted.dispose()
        with engine.connect() as cleanup:
            cleanup.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
            cleanup.commit()


@pytest.fixture()
def simulated_ahead_db():
    """Moves alembic_version to fake revisions ahead of the code head, then
    restores it (and removes the fake compat rows) whatever happens."""
    head = _current_revision()

    def _apply(chain):
        with engine.begin() as conn:
            conn.execute(text(f"DELETE FROM {COMPAT_TABLE} WHERE revision LIKE :p"), {"p": f"{FAKE_PREFIX}%"})
            parent = head
            for name, compatible in chain:
                conn.execute(text(
                    f"INSERT INTO {COMPAT_TABLE} (revision, down_revision, backward_compatible) VALUES (:r, :d, :c)"
                ), {"r": name, "d": parent, "c": compatible})
                parent = name
            conn.execute(text("UPDATE alembic_version SET version_num = :v"), {"v": parent})

    yield head, _apply

    with engine.begin() as conn:
        conn.execute(text("UPDATE alembic_version SET version_num = :v"), {"v": head})
        conn.execute(text(f"DELETE FROM {COMPAT_TABLE} WHERE revision LIKE :p"), {"p": f"{FAKE_PREFIX}%"})
    assert _current_revision() == head


def test_db_ahead_through_compatible_migrations_is_servable(simulated_ahead_db):
    from app.main import _check_alembic_revision

    head, apply = simulated_ahead_db
    apply([(f"{FAKE_PREFIX}1", True), (f"{FAKE_PREFIX}2", True)])
    result = _check_alembic_revision()
    assert result["status"] == "ahead_compatible", result
    assert result["ahead_by"] == 2
    assert result["head_revision"] == head


def test_db_ahead_through_an_incompatible_migration_is_blocked(simulated_ahead_db):
    from app.main import _check_alembic_revision

    _, apply = simulated_ahead_db
    apply([(f"{FAKE_PREFIX}1", True), (f"{FAKE_PREFIX}2", False)])
    assert _check_alembic_revision()["status"] == "incompatible"


def test_db_on_unknown_revision_without_declaration_is_blocked(simulated_ahead_db):
    from app.main import _check_alembic_revision

    _, apply = simulated_ahead_db
    apply([])  # no fake row: alembic_version stays at head -> up_to_date
    assert _check_alembic_revision()["status"] == "up_to_date"
    with engine.begin() as conn:
        conn.execute(text("UPDATE alembic_version SET version_num = :v"), {"v": f"{FAKE_PREFIX}orphan"})
    assert _check_alembic_revision()["status"] == "incompatible"


def test_strict_mode_blocks_a_compatible_ahead_db(simulated_ahead_db, monkeypatch):
    from app.main import _check_alembic_revision, settings

    _, apply = simulated_ahead_db
    apply([(f"{FAKE_PREFIX}1", True)])
    monkeypatch.setattr(settings, "SCHEMA_COMPAT_MODE", "strict")
    assert _check_alembic_revision()["status"] == "incompatible"
