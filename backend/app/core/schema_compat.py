"""Schema / code compatibility decision (P2 — no 503 window during migrations).

Production applies migrations *before* deploying the code that ships them
(docs/runbooks/appservice-migrations.md). Between the two steps the running
code sees a database **ahead** of its own Alembic head. A strict equality
check reported that as "outdated": `/health/ready` answered 503 and a restart
of the old code would `SystemExit` (incident 2026-10-07, ~10 min).

The old code cannot judge revisions it has never seen (their scripts are not
in its image), so the database carries the proof instead: every migration
declares a module-level ``backward_compatible: bool`` — "the code of my
down_revision keeps working against me" — and the ``on_version_apply`` hook
in ``alembic/env.py`` records it in ``schema_migration_compat`` on upgrade
(and removes it on downgrade).

Decision for code head H and database revision D:

- D == H                               -> ``up_to_date``
- D known to the code, D != H          -> ``outdated`` (DB behind: block)
- D unknown: walk D -> down_revision -> ... in the compat table, at most
  ``MAX_AHEAD_STEPS`` steps. Every link must exist and be backward
  compatible, and the walk must land exactly on H -> ``ahead_compatible``.
  Anything else (missing row, incompatible link, merge revision, landing on
  another known revision i.e. a divergent branch, cycle, too far, unreadable
  table) -> ``incompatible`` (block). Absence of proof is never a green light.

``SCHEMA_COMPAT_MODE=strict`` (in fact any value other than
"ahead_compatible") restores the historical strict equality — emergency
switch, no redeploy needed.
"""
from __future__ import annotations

from typing import Mapping, NamedTuple, Optional, Sequence

COMPAT_TABLE = "schema_migration_compat"
MAX_AHEAD_STEPS = 10

UP_TO_DATE = "up_to_date"
AHEAD_COMPATIBLE = "ahead_compatible"
OUTDATED = "outdated"
INCOMPATIBLE = "incompatible"
UNKNOWN = "unknown"

# Statuses under which the API may start and report ready.
SERVABLE_STATUSES = frozenset({UP_TO_DATE, AHEAD_COMPATIBLE})
# Statuses that must stop the process at startup (confirmed mismatch).
BLOCKING_STATUSES = frozenset({OUTDATED, INCOMPATIBLE})


class CompatRow(NamedTuple):
    down_revision: Optional[str]
    backward_compatible: bool


def decide_schema_status(
    *,
    db_revision: Optional[str],
    code_heads: Sequence[str],
    known_revisions: frozenset[str] | set[str],
    compat_rows: Optional[Mapping[str, CompatRow]],
    mode: str = "ahead_compatible",
    max_steps: int = MAX_AHEAD_STEPS,
) -> dict:
    """Pure decision function — no I/O, fully unit-testable.

    ``compat_rows`` is None when the compat table could not be read (missing
    or error): treated as "no proof".
    """
    if db_revision is None:
        return {"status": UNKNOWN, "detail": "No alembic_version row found"}
    if len(code_heads) != 1:
        return {"status": UNKNOWN, "db_revision": db_revision, "detail": "Code has multiple Alembic heads"}

    head = code_heads[0]
    base = {"db_revision": db_revision, "head_revision": head}
    if db_revision == head:
        return {"status": UP_TO_DATE, **base}
    if db_revision in known_revisions:
        return {"status": OUTDATED, **base, "detail": "Database is behind the code"}
    if (mode or "").strip().lower() != "ahead_compatible":
        return {"status": INCOMPATIBLE, **base, "detail": "Strict mode: database revision unknown to this code"}
    if compat_rows is None:
        return {"status": INCOMPATIBLE, **base, "detail": "Compatibility table unreadable or missing"}

    current, steps, seen = db_revision, 0, set()
    while True:
        if current in seen:
            return {"status": INCOMPATIBLE, **base, "detail": f"Cycle in compatibility chain at {current}"}
        seen.add(current)
        row = compat_rows.get(current)
        if row is None:
            return {"status": INCOMPATIBLE, **base, "detail": f"No compatibility declaration for {current}"}
        if not row.backward_compatible:
            return {"status": INCOMPATIBLE, **base, "detail": f"Migration {current} is not backward compatible"}
        steps += 1
        parent = row.down_revision
        if not parent or "," in parent:
            return {"status": INCOMPATIBLE, **base, "detail": f"Cannot prove a single chain from {current}"}
        if parent == head:
            return {"status": AHEAD_COMPATIBLE, **base, "ahead_by": steps}
        if parent in known_revisions:
            return {"status": INCOMPATIBLE, **base, "detail": f"Divergent branch: chain reaches {parent}, not the code head"}
        if steps >= max_steps:
            return {"status": INCOMPATIBLE, **base, "detail": f"Database more than {max_steps} migrations ahead"}
        current = parent


def record_migration_compat(connection, step) -> None:
    """Alembic ``on_version_apply`` hook body (see alembic/env.py).

    Upgrade: (re)writes the row for the applied revision with its declared
    ``backward_compatible`` (missing or non-bool declaration -> False, fail
    closed). Downgrade: deletes the row of the reverted revision. No-op while
    the table does not exist yet (older migrations on a fresh database, or
    after downgrading the migration that creates it).
    """
    from sqlalchemy import inspect, text

    if not inspect(connection).has_table(COMPAT_TABLE):
        return
    revision = step.up_revision_id
    connection.execute(text(f"DELETE FROM {COMPAT_TABLE} WHERE revision = :r"), {"r": revision})
    if not step.is_upgrade:
        return
    script = step.up_revision
    declared = getattr(getattr(script, "module", None), "backward_compatible", None)
    down = script.down_revision if script is not None else None
    if isinstance(down, (tuple, list)):
        down = ",".join(down)
    connection.execute(
        text(
            f"INSERT INTO {COMPAT_TABLE} (revision, down_revision, backward_compatible) "
            "VALUES (:r, :d, :c)"
        ),
        {"r": revision, "d": down, "c": declared is True},
    )
