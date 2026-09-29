#!/usr/bin/env python3
"""One-shot migration entrypoint for the Azure Container Apps migration Job
(#263 — docs/AZURE_ONE_SHOT_MIGRATIONS.md, #264 — docs/IMMUTABLE_RELEASES.md).

infra/azure/modules/container-apps.bicep's migrationJob runs this instead
of a bare `alembic upgrade head` so the job's own logs are directly
readable in Azure Log Analytics without an operator having to already
know Alembic's log format: which revision the DB started at, which
revision it's moving to, and a single unambiguous success/failure line —
see docs/AZURE_OBSERVABILITY.md#migration-logs.

Uses plain `print()`, not the `logging` module, for this script's own
status lines — confirmed the hard way: `alembic/env.py` calls
`logging.config.fileConfig(alembic.ini)` (to apply alembic.ini's own
[loggers] section) as a side effect of `command.upgrade()`, and
`fileConfig()` defaults to `disable_existing_loggers=True`, which
silently disables any logger not explicitly listed there — including
this script's own, the moment `command.upgrade()` runs. A `logger.error()`
call made after that point never appears anywhere, exit code included, no
traceback: this is a real failure mode confirmed by reproduction (a
raised OperationalError was correctly caught by the try/except below, but
the "migration failed" line it logged was silently swallowed). print()
to stdout/stderr is immune to this and still ends up in the same Azure
Log Analytics stream as everything else this container writes.

SECURITY: never logs DATABASE_URL/DATABASE_URL_MIGRATIONS, passwords, or
any other secret — only revision identifiers (short hex strings from this
repo's own migration filenames, not sensitive) and the release SHA
(already a public git commit, not a secret either). Behaves identically
to `alembic upgrade head` otherwise: same exit code semantics (0 on
success, non-zero on any failure), same STOP-after-exit contract — this
script starts, runs one migration pass, and exits; it is not a service.
"""
from __future__ import annotations

import datetime
import os
import sys


def _log(level: str, message: str) -> None:
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    stream = sys.stderr if level == "ERROR" else sys.stdout
    print(f"{timestamp} {level} [migration] {message}", file=stream, flush=True)


def main() -> int:
    release_sha = os.environ.get("RELEASE_SHA", "unknown")
    _log("INFO", f"migration started: release_sha={release_sha}")

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, backend_dir)

    from alembic.config import Config
    from alembic import command
    from alembic.script import ScriptDirectory
    from sqlalchemy import text

    alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    script = ScriptDirectory.from_config(alembic_cfg)
    target_revision = script.get_current_head()

    from app.core.config import settings
    from app.core.database import engine

    current_revision = "none (fresh database)"
    if not settings.is_sqlite:
        try:
            with engine.connect() as conn:
                row = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).first()
                if row:
                    current_revision = row[0]
        except Exception:
            # alembic_version doesn't exist yet on a genuinely fresh DB —
            # not an error, just means "none" (already the default above).
            pass

    _log("INFO", f"current revision: {current_revision}")
    _log("INFO", f"target revision: {target_revision}")

    if current_revision == target_revision:
        _log("INFO", "migration succeeded: already at target revision (no-op)")
        return 0

    try:
        command.upgrade(alembic_cfg, "head")
    except Exception as exc:
        # SECURITY: str(exc) can legitimately be an Alembic/SQLAlchemy
        # error that quotes the failing SQL statement — never the DSN
        # itself, since this connects via the already-parsed `engine`, not
        # by re-reading DATABASE_URL_MIGRATIONS as a string here.
        _log("ERROR", f"migration failed: {type(exc).__name__}: {exc}")
        return 1

    _log("INFO", f"migration succeeded: release_sha={release_sha} revision={target_revision}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
