"""Regression tests for the production backup and restore scripts."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import subprocess
import time

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKUP_SCRIPT = REPO_ROOT / "scripts" / "backup-database.sh"
RESTORE_SCRIPT = REPO_ROOT / "scripts" / "restore-database.sh"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


@pytest.fixture
def backup_environment(tmp_path: Path) -> dict[str, str]:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _write_executable(
        fake_bin / "pg_dump",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_PG_DUMP_FAIL:-false}" == "true" ]]; then
  echo "simulated pg_dump failure" >&2
  exit 17
fi
output=""
for argument in "$@"; do
  case "$argument" in
    --file=*) output="${argument#--file=}" ;;
  esac
done
[[ -n "$output" ]]
printf 'valid-postgresql-custom-archive' > "$output"
""",
    )
    _write_executable(
        fake_bin / "pg_restore",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--list" ]]; then
  [[ "${FAKE_PG_RESTORE_LIST_FAIL:-false}" != "true" ]]
  exit
fi
if [[ -n "${FAKE_RESTORE_LOG:-}" ]]; then
  printf '%s\n' "$*" >> "$FAKE_RESTORE_LOG"
fi
[[ "${FAKE_PG_RESTORE_FAIL:-false}" != "true" ]]
""",
    )
    _write_executable(
        fake_bin / "aws",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${FAKE_AWS_LOG:-}" ]]; then
  printf '%s\n' "$*" >> "$FAKE_AWS_LOG"
fi
[[ "${FAKE_AWS_FAIL:-false}" != "true" ]]
""",
    )

    return {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "DB_HOST": "database.internal",
        "DB_PORT": "5432",
        "DB_NAME": "schoolflow",
        "DB_USER": "backup_user",
        "DB_PASSWORD": "test-only-password",
        "BACKUP_DIR": str(tmp_path / "backups"),
        "MIN_FREE_SPACE_MB": "0",
        "RETENTION_DAYS": "30",
        "ALERT_EMAIL": "",
        "ALERT_WEBHOOK": "",
    }


def _run_backup(environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(BACKUP_SCRIPT)],
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )


def _created_backup(environment: dict[str, str]) -> Path:
    backups = list(Path(environment["BACKUP_DIR"]).glob("schoolflow_backup_*.dump"))
    assert len(backups) == 1
    return backups[0]


def test_backup_is_atomic_and_checksum_verified(backup_environment: dict[str, str]):
    result = _run_backup(backup_environment)

    assert result.returncode == 0, result.stderr
    backup = _created_backup(backup_environment)
    checksum = Path(f"{backup}.sha256")
    assert checksum.is_file()
    expected = checksum.read_text(encoding="utf-8").split()[0]
    assert hashlib.sha256(backup.read_bytes()).hexdigest() == expected
    assert not list(backup.parent.glob("*.partial.*"))
    assert backup.stat().st_mode & 0o077 == 0


def test_pg_dump_failure_never_publishes_a_backup(backup_environment: dict[str, str]):
    backup_environment["FAKE_PG_DUMP_FAIL"] = "true"

    result = _run_backup(backup_environment)

    assert result.returncode != 0
    assert not list(Path(backup_environment["BACKUP_DIR"]).glob("*.dump"))
    assert "pg_dump failed" in result.stdout


def test_unreadable_archive_never_publishes_a_backup(backup_environment: dict[str, str]):
    backup_environment["FAKE_PG_RESTORE_LIST_FAIL"] = "true"

    result = _run_backup(backup_environment)

    assert result.returncode != 0
    assert not list(Path(backup_environment["BACKUP_DIR"]).glob("*.dump"))
    assert "could not read" in result.stdout


def test_successful_backup_rotates_expired_archive_and_checksum(
    backup_environment: dict[str, str],
):
    backup_dir = Path(backup_environment["BACKUP_DIR"])
    backup_dir.mkdir()
    expired = backup_dir / "schoolflow_backup_20200101T000000Z.dump"
    expired.write_bytes(b"expired")
    expired_checksum = Path(f"{expired}.sha256")
    expired_checksum.write_text("expired", encoding="utf-8")
    old_time = time.time() - (32 * 86400)
    os.utime(expired, (old_time, old_time))
    os.utime(expired_checksum, (old_time, old_time))

    result = _run_backup(backup_environment)

    assert result.returncode == 0, result.stderr
    assert not expired.exists()
    assert not expired_checksum.exists()
    _created_backup(backup_environment)


def test_backup_uploads_archive_and_checksum_with_server_side_encryption(
    backup_environment: dict[str, str], tmp_path: Path,
):
    aws_log = tmp_path / "aws.log"
    backup_environment.update({
        "BACKUP_S3_URI": "s3://schoolflow-backups/database/",
        "S3_SSE": "AES256",
        "FAKE_AWS_LOG": str(aws_log),
    })

    result = _run_backup(backup_environment)

    assert result.returncode == 0, result.stderr
    calls = aws_log.read_text(encoding="utf-8").splitlines()
    assert len(calls) == 2
    assert all("--sse AES256" in call for call in calls)
    assert any(".dump s3://schoolflow-backups/database/" in call for call in calls)
    assert any(".dump.sha256 s3://schoolflow-backups/database/" in call for call in calls)


def test_offsite_failure_keeps_the_verified_local_backup(
    backup_environment: dict[str, str], tmp_path: Path,
):
    backup_environment.update({
        "BACKUP_S3_URI": "s3://schoolflow-backups/database",
        "FAKE_AWS_FAIL": "true",
        "FAKE_AWS_LOG": str(tmp_path / "aws.log"),
    })

    result = _run_backup(backup_environment)

    assert result.returncode != 0
    backup = _created_backup(backup_environment)
    assert Path(f"{backup}.sha256").is_file()
    assert "Off-site archive upload failed" in result.stdout


def test_restore_defaults_to_verification_only(
    backup_environment: dict[str, str], tmp_path: Path,
):
    assert _run_backup(backup_environment).returncode == 0
    backup = _created_backup(backup_environment)
    restore_log = tmp_path / "restore.log"
    backup_environment["FAKE_RESTORE_LOG"] = str(restore_log)

    result = subprocess.run(
        [str(RESTORE_SCRIPT), "--backup", str(backup)],
        env=backup_environment,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "Verification-only mode" in result.stdout
    assert not restore_log.exists()


def test_restore_requires_exact_confirmation(
    backup_environment: dict[str, str], tmp_path: Path,
):
    assert _run_backup(backup_environment).returncode == 0
    backup = _created_backup(backup_environment)
    restore_log = tmp_path / "restore.log"
    backup_environment["FAKE_RESTORE_LOG"] = str(restore_log)

    result = subprocess.run(
        [
            str(RESTORE_SCRIPT),
            "--backup", str(backup),
            "--target-db", "schoolflow_restore_drill",
            "--execute",
            "--confirm", "wrong_database",
        ],
        env=backup_environment,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert "exactly match" in result.stderr
    assert not restore_log.exists()


def test_restore_drill_uses_transactional_safe_flags(
    backup_environment: dict[str, str], tmp_path: Path,
):
    assert _run_backup(backup_environment).returncode == 0
    backup = _created_backup(backup_environment)
    restore_log = tmp_path / "restore.log"
    backup_environment["FAKE_RESTORE_LOG"] = str(restore_log)

    result = subprocess.run(
        [
            str(RESTORE_SCRIPT),
            "--backup", str(backup),
            "--target-db", "schoolflow_restore_drill",
            "--execute",
            "--confirm", "schoolflow_restore_drill",
        ],
        env=backup_environment,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    restore_args = restore_log.read_text(encoding="utf-8")
    assert "--dbname=schoolflow_restore_drill" in restore_args
    assert "--single-transaction" in restore_args
    assert "--exit-on-error" in restore_args
    assert "--clean" in restore_args


def test_in_place_restore_is_blocked_by_default(
    backup_environment: dict[str, str], tmp_path: Path,
):
    assert _run_backup(backup_environment).returncode == 0
    backup = _created_backup(backup_environment)
    restore_log = tmp_path / "restore.log"
    backup_environment["FAKE_RESTORE_LOG"] = str(restore_log)

    result = subprocess.run(
        [
            str(RESTORE_SCRIPT),
            "--backup", str(backup),
            "--target-db", "schoolflow",
            "--execute",
            "--confirm", "schoolflow",
        ],
        env=backup_environment,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert "In-place restore is blocked" in result.stderr
    assert not restore_log.exists()
