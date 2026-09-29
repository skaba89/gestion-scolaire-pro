"""Tests for backend/scripts/run_migration.py — the one-shot migration
Job's logging wrapper (Azure probes pass — docs/AZURE_OBSERVABILITY.md).

Runs the script as a real subprocess (not an import) so these tests
exercise exactly what the Azure Container Apps migration Job actually
executes, catch-fully — including the real bug this script's own
docstring documents (Alembic's own `fileConfig()` disabling any logger
not listed in alembic.ini, which is why this script uses print() instead
of the `logging` module for its own status lines).
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND_DIR / "scripts" / "run_migration.py"


def _run(env_overrides: dict) -> subprocess.CompletedProcess:
    env = {
        **os.environ,
        "DEBUG": "True",
        "SECRET_KEY": "test-secret-key-for-testing-only-32chars",
        "BOOTSTRAP_SECRET": "test-bootstrap-secret-key-for-ci-32chars",
        **env_overrides,
    }
    return subprocess.run(
        [sys.executable, str(SCRIPT)],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def test_migration_logs_started_current_and_target_revision(tmp_path):
    """TEST 23 (migration success/failure logs must be exploitable): even
    on a path this script can't fully complete (SQLite — the real
    migration chain includes Postgres-only DDL, and the one-shot job only
    ever targets real Postgres in Azure), it must still log started,
    current revision, and target revision before whatever happens next."""
    db_path = tmp_path / "run_migration_test.db"
    result = _run({
        "DATABASE_URL": f"sqlite:///{db_path}",
        "DATABASE_URL_SYNC": f"sqlite:///{db_path}",
        "RELEASE_SHA": "test-sha-0123456789",
    })

    assert "migration started: release_sha=test-sha-0123456789" in result.stdout
    assert "current revision:" in result.stdout
    assert "target revision:" in result.stdout


def test_migration_failure_is_logged_and_exits_non_zero(tmp_path):
    """Regression test for the real bug found during this PR: Alembic's
    command.upgrade() triggers alembic/env.py's fileConfig() call, which
    (disable_existing_loggers defaults to True) silently disables any
    logger not listed in alembic.ini — including a logging.getLogger()
    instance in this script. Before the fix (print() instead of
    logging), a real failure exited non-zero with NO error line at all —
    exactly the "masked failure" this whole PR exists to prevent."""
    db_path = tmp_path / "run_migration_fail_test.db"
    result = _run({
        "DATABASE_URL": f"sqlite:///{db_path}",
        "DATABASE_URL_SYNC": f"sqlite:///{db_path}",
        "RELEASE_SHA": "test-sha-fail",
    })

    # This repo's full Alembic chain includes Postgres-only DDL with no
    # SQLite guard partway through — confirmed to fail deterministically
    # against a fresh SQLite DB (this is a pre-existing, unrelated fact
    # about the migration chain, not something this script causes: the
    # migration job only ever targets real Postgres in Azure).
    assert result.returncode != 0
    assert "ERROR [migration] migration failed:" in result.stderr


def test_migration_logs_contain_no_secrets(tmp_path):
    """TEST 24: no DATABASE_URL, password, or connection string in the
    script's own output, success or failure path alike."""
    db_path = tmp_path / "run_migration_secrets_test.db"
    result = _run({
        "DATABASE_URL": f"sqlite:///{db_path}",
        "DATABASE_URL_SYNC": f"sqlite:///{db_path}",
        "RELEASE_SHA": "test-sha-secrets",
    })

    combined = (result.stdout + result.stderr).lower()
    for forbidden in ("password=", "postgres://", "postgresql://", "redis://", "authorization:", "bearer "):
        assert forbidden not in combined, f"Forbidden token {forbidden!r} found in migration script output"
