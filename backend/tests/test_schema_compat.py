"""P2 — schema/code compatibility decision (app/core/schema_compat.py).

Pure unit tests of decide_schema_status() covering the validated matrix,
plus the readiness mapping and the "every new migration declares
backward_compatible" rule.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from app.core.schema_compat import CompatRow, decide_schema_status

VERSIONS = Path(__file__).resolve().parents[1] / "alembic" / "versions"
FIRST_DECLARING_REVISION = "20261008_0001"

HEAD = "r3"
KNOWN = frozenset({"r1", "r2", "r3"})


def _decide(db_revision, compat_rows=None, **kw):
    params = dict(db_revision=db_revision, code_heads=[HEAD], known_revisions=KNOWN, compat_rows=compat_rows)
    params.update(kw)
    return decide_schema_status(**params)


def test_equal_is_up_to_date():
    assert _decide("r3")["status"] == "up_to_date"


def test_db_behind_is_outdated():
    result = _decide("r2")
    assert result["status"] == "outdated"
    assert result["head_revision"] == "r3"


def test_one_ahead_compatible():
    result = _decide("r4", {"r4": CompatRow("r3", True)})
    assert result["status"] == "ahead_compatible"
    assert result["ahead_by"] == 1


def test_several_ahead_all_compatible():
    rows = {"r6": CompatRow("r5", True), "r5": CompatRow("r4", True), "r4": CompatRow("r3", True)}
    result = _decide("r6", rows)
    assert result["status"] == "ahead_compatible"
    assert result["ahead_by"] == 3


def test_one_incompatible_link_blocks():
    rows = {"r6": CompatRow("r5", True), "r5": CompatRow("r4", False), "r4": CompatRow("r3", True)}
    result = _decide("r6", rows)
    assert result["status"] == "incompatible"
    assert "r5" in result["detail"]


def test_missing_declaration_blocks():
    assert _decide("r5", {"r5": CompatRow("r4", True)})["status"] == "incompatible"


def test_unreadable_or_missing_table_blocks():
    assert _decide("r4", None)["status"] == "incompatible"


def test_divergent_branch_blocks():
    """The chain lands on a revision the code knows but which is not its head."""
    result = _decide("x2", {"x2": CompatRow("x1", True), "x1": CompatRow("r2", True)})
    assert result["status"] == "incompatible"
    assert "Divergent" in result["detail"]


def test_cycle_blocks():
    rows = {"a": CompatRow("b", True), "b": CompatRow("a", True)}
    assert _decide("a", rows)["status"] == "incompatible"


def test_too_far_ahead_blocks():
    rows = {f"n{i}": CompatRow(f"n{i - 1}" if i > 0 else HEAD, True) for i in range(12)}
    assert _decide("n11", rows)["status"] == "incompatible"
    assert _decide("n9", rows)["status"] == "ahead_compatible"  # exactly 10 steps is allowed


def test_merge_revision_cannot_be_proven():
    assert _decide("m", {"m": CompatRow("r3,z1", True)})["status"] == "incompatible"


def test_null_down_revision_blocks():
    assert _decide("orphan", {"orphan": CompatRow(None, True)})["status"] == "incompatible"


def test_no_alembic_row_is_unknown():
    assert _decide(None)["status"] == "unknown"


def test_multiple_code_heads_is_unknown():
    assert _decide("r3", code_heads=["r3", "z9"])["status"] == "unknown"


@pytest.mark.parametrize("mode", ["strict", "STRICT", "", "nonsense"])
def test_strict_mode_blocks_any_ahead_db(mode):
    rows = {"r4": CompatRow("r3", True)}
    assert _decide("r4", rows, mode=mode)["status"] == "incompatible"
    assert _decide("r3", rows, mode=mode)["status"] == "up_to_date"


def test_default_mode_tolerates_case_and_spaces():
    assert _decide("r4", {"r4": CompatRow("r3", True)}, mode=" Ahead_Compatible ")["status"] == "ahead_compatible"


@pytest.mark.parametrize(
    ("schema", "healthy"),
    [("up_to_date", True), ("ahead_compatible", True), ("outdated", False), ("incompatible", False), ("unknown", False)],
)
def test_readiness_mapping(schema, healthy):
    from app.main import _readiness_is_healthy

    assert _readiness_is_healthy(
        database="connected", cache="connected", rls="active", storage="ok", schema=schema, is_sqlite=False,
    ) is healthy


def _load(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_every_migration_since_p2_declares_backward_compatible():
    """From 20261008_0001 on, a migration without an explicit bool
    `backward_compatible` would be recorded as incompatible (fail closed) —
    reject it at review time instead of discovering it during a deploy."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(VERSIONS.parents[1] / "alembic.ini"))
    cfg.set_main_option("script_location", str(VERSIONS.parent))
    script = ScriptDirectory.from_config(cfg)

    checked = []
    for rev in script.walk_revisions():
        assert isinstance(getattr(rev.module, "backward_compatible", None), bool), (
            f"{rev.revision} must declare `backward_compatible = True|False` (see app/core/schema_compat.py)"
        )
        checked.append(rev.revision)
        if rev.revision == FIRST_DECLARING_REVISION:
            break
    assert FIRST_DECLARING_REVISION in checked


@pytest.mark.parametrize("status", ["outdated", "incompatible"])
def test_lifespan_refuses_to_start_on_blocking_status(status):
    import asyncio
    from unittest.mock import PropertyMock, patch

    from app.main import app, lifespan, settings

    async def _enter():
        async with lifespan(app):
            pass

    with (
        patch.object(type(settings), "is_sqlite", new_callable=PropertyMock, return_value=False),
        patch("app.main._check_alembic_revision", return_value={"status": status, "db_revision": "x", "head_revision": "y"}),
        pytest.raises(SystemExit),
    ):
        asyncio.run(_enter())
