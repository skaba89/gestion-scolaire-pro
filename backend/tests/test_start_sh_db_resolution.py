"""Regression tests for backend/start.sh's database-configuration resolution.

P0-1 (production readiness — Azure startup fix): the Azure Container Apps
IaC (infra/azure/modules/container-apps.bicep) injects DATABASE_URL and
DATABASE_URL_SYNC on the "api" container — never POSTGRES_HOST/
POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB. start.sh previously hard
":?"-required the POSTGRES_* variables, so the Azure container exited here
before Alembic or FastAPI ever ran.

Linux-only by design (same reasoning as test_backup_scripts.py, which this
module's harness style mirrors): start.sh is a `#!/bin/bash` script, not
runnable via subprocess on native Windows.
"""

from __future__ import annotations

import os
from pathlib import Path
import subprocess

import pytest

pytestmark = pytest.mark.skipif(
    os.name != "posix",
    reason="start.sh is bash (#!/bin/bash) and only runnable on a POSIX host.",
)

REPO_ROOT = Path(__file__).resolve().parents[2]
START_SCRIPT = REPO_ROOT / "backend" / "start.sh"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


@pytest.fixture
def start_environment(tmp_path: Path) -> dict[str, str]:
    """A minimal, fully-stubbed environment to run start.sh in.

    Stubs every external binary start.sh shells out to (pg_isready, psql,
    alembic, gunicorn, uvicorn) so the test exercises only start.sh's own
    control flow — never a real database, migration, or server process —
    matching test_backup_scripts.py's fake-PATH approach for the sibling
    production script suite.
    """
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()

    _write_executable(
        fake_bin / "pg_isready",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${FAKE_PG_ISREADY_LOG:-}" ]]; then
  printf '%s\\n' "$*" >> "$FAKE_PG_ISREADY_LOG"
fi
[[ "${FAKE_PG_ISREADY_FAIL:-false}" != "true" ]]
""",
    )
    _write_executable(
        fake_bin / "psql",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${FAKE_PSQL_LOG:-}" ]]; then
  printf '%s\\n' "$*" >> "$FAKE_PSQL_LOG"
fi
if [[ -n "${FAKE_PSQL_PGPASSWORD_FILE:-}" ]]; then
  printf '%s' "${PGPASSWORD:-}" > "$FAKE_PSQL_PGPASSWORD_FILE"
fi
[[ "${FAKE_PSQL_FAIL:-false}" != "true" ]]
""",
    )
    _write_executable(
        fake_bin / "alembic",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${FAKE_ALEMBIC_LOG:-}" ]]; then
  printf '%s\\n' "$*" >> "$FAKE_ALEMBIC_LOG"
fi
[[ "${FAKE_ALEMBIC_FAIL:-false}" != "true" ]]
""",
    )
    _write_executable(
        fake_bin / "gunicorn",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${FAKE_GUNICORN_LOG:-}" ]]; then
  printf '%s\\n' "$*" >> "$FAKE_GUNICORN_LOG"
fi
echo "fake gunicorn started"
""",
    )
    _write_executable(
        fake_bin / "uvicorn",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${FAKE_UVICORN_LOG:-}" ]]; then
  printf '%s\\n' "$*" >> "$FAKE_UVICORN_LOG"
fi
echo "fake uvicorn started"
""",
    )

    return {
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "HOME": os.environ.get("HOME", "/root"),
        "DEBUG": "false",
        "DB_WAIT_TIMEOUT": "5",
        "FAKE_PG_ISREADY_LOG": str(tmp_path / "pg_isready.log"),
        "FAKE_PSQL_LOG": str(tmp_path / "psql.log"),
        "FAKE_PSQL_PGPASSWORD_FILE": str(tmp_path / "psql_pgpassword"),
        "FAKE_ALEMBIC_LOG": str(tmp_path / "alembic.log"),
        "FAKE_GUNICORN_LOG": str(tmp_path / "gunicorn.log"),
        "FAKE_UVICORN_LOG": str(tmp_path / "uvicorn.log"),
    }


def _run_start(environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(START_SCRIPT)],
        env=environment,
        text=True,
        capture_output=True,
        check=False,
        timeout=30,
    )


def test_docker_compose_mode_uses_postgres_star_vars(start_environment):
    """Historical Docker Compose mode: only POSTGRES_* set, no DATABASE_URL*."""
    start_environment.update({
        "POSTGRES_HOST": "localhost",
        "POSTGRES_USER": "schoolflow",
        "POSTGRES_PASSWORD": "compose-local-password",
        "POSTGRES_DB": "schoolflow",
    })

    result = _run_start(start_environment)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Database mode: POSTGRES_* (Docker Compose)" in result.stdout

    pg_isready_log = Path(start_environment["FAKE_PG_ISREADY_LOG"]).read_text()
    assert "-h localhost" in pg_isready_log
    assert "-U schoolflow" in pg_isready_log
    assert "-d schoolflow" in pg_isready_log

    pgpassword = Path(start_environment["FAKE_PSQL_PGPASSWORD_FILE"]).read_text()
    assert pgpassword == "compose-local-password"

    alembic_log = Path(start_environment["FAKE_ALEMBIC_LOG"]).read_text()
    assert "upgrade head" in alembic_log

    assert "compose-local-password" not in result.stdout
    assert "compose-local-password" not in result.stderr


def test_azure_mode_uses_database_url_sync_only(start_environment):
    """Azure Container Apps mode: only DATABASE_URL_SYNC set, no POSTGRES_*
    (matches infra/azure/modules/container-apps.bicep's actual env list —
    this is the exact scenario that used to crash the container)."""
    start_environment["DATABASE_URL_SYNC"] = (
        "postgresql+psycopg://azureuser:azurepass123@localhost:5432/schoolflow_prod"
    )

    result = _run_start(start_environment)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Database mode: DATABASE_URL_SYNC/DATABASE_URL (managed deployment)" in result.stdout

    pg_isready_log = Path(start_environment["FAKE_PG_ISREADY_LOG"]).read_text()
    assert "-h localhost" in pg_isready_log
    assert "-U azureuser" in pg_isready_log
    assert "-d schoolflow_prod" in pg_isready_log

    pgpassword = Path(start_environment["FAKE_PSQL_PGPASSWORD_FILE"]).read_text()
    assert pgpassword == "azurepass123"

    assert "azurepass123" not in result.stdout
    assert "azurepass123" not in result.stderr


def test_password_with_reserved_url_characters_is_decoded_correctly(start_environment):
    """A password containing URL-reserved characters (@, :, /, #, ?, &, =) —
    routine for Azure Flexible Server-generated passwords — must be
    percent-decoded correctly, never truncated or mis-split by a naive
    shell-level parse."""
    raw_password = "p@ss:w/o#rd?a=1&b"
    encoded_password = "p%40ss%3Aw%2Fo%23rd%3Fa%3D1%26b"
    start_environment["DATABASE_URL_SYNC"] = (
        f"postgresql+psycopg://azureuser:{encoded_password}@localhost:5432/schoolflow_prod"
    )

    result = _run_start(start_environment)

    assert result.returncode == 0, result.stdout + result.stderr

    pgpassword = Path(start_environment["FAKE_PSQL_PGPASSWORD_FILE"]).read_text()
    assert pgpassword == raw_password

    assert raw_password not in result.stdout
    assert raw_password not in result.stderr
    assert encoded_password not in result.stdout
    assert encoded_password not in result.stderr


def test_database_url_wins_over_database_url_sync_when_sync_is_unset(start_environment):
    """DATABASE_URL is the documented fallback when DATABASE_URL_SYNC isn't set."""
    start_environment["DATABASE_URL"] = (
        "postgresql://fallbackuser:fallbackpass@localhost:5432/schoolflow_fallback"
    )

    result = _run_start(start_environment)

    assert result.returncode == 0, result.stdout + result.stderr
    pg_isready_log = Path(start_environment["FAKE_PG_ISREADY_LOG"]).read_text()
    assert "-U fallbackuser" in pg_isready_log
    assert "-d schoolflow_fallback" in pg_isready_log


def test_database_url_sync_takes_priority_over_postgres_star(start_environment):
    """When both are present (today's docker-compose.yml/.env.docker actually
    set both), DATABASE_URL_SYNC wins — it's the single source of truth
    app/core/database.py itself connects with."""
    start_environment.update({
        "POSTGRES_HOST": "localhost",
        "POSTGRES_USER": "legacy_user",
        "POSTGRES_PASSWORD": "legacy_password",
        "POSTGRES_DB": "legacy_db",
        "DATABASE_URL_SYNC": "postgresql+psycopg://realuser:realpass@localhost:5432/real_db",
    })

    result = _run_start(start_environment)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Database mode: DATABASE_URL_SYNC/DATABASE_URL (managed deployment)" in result.stdout
    pg_isready_log = Path(start_environment["FAKE_PG_ISREADY_LOG"]).read_text()
    assert "-U realuser" in pg_isready_log
    assert "-d real_db" in pg_isready_log
    assert "legacy_user" not in pg_isready_log


def test_missing_database_configuration_fails_cleanly(start_environment):
    """No POSTGRES_* and no DATABASE_URL*/DATABASE_URL_SYNC — must stop the
    container before Alembic/FastAPI, with a clear error, not hang or crash
    obscurely later."""
    result = _run_start(start_environment)

    assert result.returncode != 0
    assert "no database configuration found" in result.stderr

    assert not Path(start_environment["FAKE_PG_ISREADY_LOG"]).exists()
    assert not Path(start_environment["FAKE_ALEMBIC_LOG"]).exists()


def test_malformed_database_url_fails_cleanly(start_environment):
    start_environment["DATABASE_URL_SYNC"] = "not-a-valid-url"

    result = _run_start(start_environment)

    assert result.returncode != 0
    assert not Path(start_environment["FAKE_PG_ISREADY_LOG"]).exists()


def test_database_url_missing_database_name_fails_cleanly(start_environment):
    start_environment["DATABASE_URL_SYNC"] = "postgresql+psycopg://user:pass@localhost:5432/"

    result = _run_start(start_environment)

    assert result.returncode != 0
    assert not Path(start_environment["FAKE_PG_ISREADY_LOG"]).exists()


def test_non_postgresql_database_url_is_rejected(start_environment):
    start_environment["DATABASE_URL_SYNC"] = "sqlite:///./test.db"

    result = _run_start(start_environment)

    assert result.returncode != 0
    assert not Path(start_environment["FAKE_PG_ISREADY_LOG"]).exists()


def test_gunicorn_invoked_identically_in_production_mode(start_environment):
    """DEBUG=false must still start gunicorn with the same flags as before
    this change — this PR must not alter the production server startup."""
    start_environment["DATABASE_URL_SYNC"] = (
        "postgresql+psycopg://azureuser:azurepass@localhost:5432/schoolflow_prod"
    )
    start_environment["DEBUG"] = "false"

    result = _run_start(start_environment)

    assert result.returncode == 0, result.stdout + result.stderr
    gunicorn_log = Path(start_environment["FAKE_GUNICORN_LOG"]).read_text()
    assert "--worker-class uvicorn.workers.UvicornWorker" in gunicorn_log
    assert "--workers 2" in gunicorn_log
    assert "--timeout 120" in gunicorn_log
    assert not Path(start_environment["FAKE_UVICORN_LOG"]).exists()


def test_uvicorn_invoked_in_debug_mode(start_environment):
    start_environment["DATABASE_URL_SYNC"] = (
        "postgresql+psycopg://azureuser:azurepass@localhost:5432/schoolflow_prod"
    )
    start_environment["DEBUG"] = "true"

    result = _run_start(start_environment)

    assert result.returncode == 0, result.stdout + result.stderr
    uvicorn_log = Path(start_environment["FAKE_UVICORN_LOG"]).read_text()
    assert "--reload" in uvicorn_log
    assert not Path(start_environment["FAKE_GUNICORN_LOG"]).exists()


# Postgres non-superuser app role pass: DATABASE_URL_SYNC/DATABASE_URL may
# now be the restricted app role (see infra/azure/sql/create_app_role.sql),
# which lacks the ALTER TABLE privilege the alembic_version column-size
# fixup step needs. DATABASE_URL_MIGRATIONS (unset by default — see
# app.core.config.effective_migrations_url) carries the admin login for
# that one DDL step instead.

def test_migrations_url_credentials_used_for_schema_fixup_step_when_set(start_environment):
    start_environment["DATABASE_URL_SYNC"] = (
        "postgresql+psycopg://approle:approlepass@localhost:5432/schoolflow_prod"
    )
    start_environment["DATABASE_URL_MIGRATIONS"] = (
        "postgresql+psycopg://adminrole:adminpass@localhost:5432/schoolflow_prod"
    )

    result = _run_start(start_environment)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Using DATABASE_URL_MIGRATIONS (admin role) for the schema-fixup step" in result.stdout

    psql_log = Path(start_environment["FAKE_PSQL_LOG"]).read_text()
    assert "-U adminrole" in psql_log
    assert "-U approle" not in psql_log

    pgpassword = Path(start_environment["FAKE_PSQL_PGPASSWORD_FILE"]).read_text()
    assert pgpassword == "adminpass"

    # pg_isready still waits using the app role — that's the connection
    # the rest of the app (and every later query) actually uses.
    pg_isready_log = Path(start_environment["FAKE_PG_ISREADY_LOG"]).read_text()
    assert "-U approle" in pg_isready_log

    assert "adminpass" not in result.stdout
    assert "adminpass" not in result.stderr
    assert "approlepass" not in result.stdout
    assert "approlepass" not in result.stderr


def test_falls_back_to_sync_credentials_when_migrations_url_unset(start_environment):
    """Today's behavior (no DATABASE_URL_MIGRATIONS set anywhere yet) must
    be completely unchanged: the same role/password used for
    connectivity is also used for the schema-fixup step."""
    start_environment["DATABASE_URL_SYNC"] = (
        "postgresql+psycopg://azureuser:azurepass@localhost:5432/schoolflow_prod"
    )

    result = _run_start(start_environment)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Using DATABASE_URL_MIGRATIONS" not in result.stdout

    psql_log = Path(start_environment["FAKE_PSQL_LOG"]).read_text()
    assert "-U azureuser" in psql_log

    pgpassword = Path(start_environment["FAKE_PSQL_PGPASSWORD_FILE"]).read_text()
    assert pgpassword == "azurepass"


def test_malformed_migrations_url_fails_cleanly(start_environment):
    start_environment["DATABASE_URL_SYNC"] = (
        "postgresql+psycopg://azureuser:azurepass@localhost:5432/schoolflow_prod"
    )
    start_environment["DATABASE_URL_MIGRATIONS"] = "not-a-valid-url"

    result = _run_start(start_environment)

    assert result.returncode != 0
    assert not Path(start_environment["FAKE_ALEMBIC_LOG"]).exists()
