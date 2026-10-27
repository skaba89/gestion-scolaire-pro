"""deploy/vps/scripts/sauvegarde-distante.sh (copie chiffrée vers Backblaze B2).

Incident 2026-10-25 → 27 : le conteneur de sauvegarde fait pointer chaque nuit
les fichiers de la semaine et du mois en cours vers le dernier dump ; copiés
avec --immutable, rclone refusait de les remplacer, le script s'arrêtait
(set -e) sans copier les mensuels ni purger, et l'alerte « distant » restait
active. Les dumps quotidiens gardent --immutable ; semaine et mois non.
"""
import os
import stat
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "deploy" / "vps" / "scripts" / "sauvegarde-distante.sh"

pytestmark = pytest.mark.skipif(not SCRIPT.exists(), reason="dépôt complet requis (deploy/vps)")

# Faux rclone : journalise ses arguments ; avec --immutable il refuse un
# fichier « modifié » (marqueur CHANGED dans le dossier), comme le vrai.
FAKE_RCLONE = """#!/usr/bin/env bash
echo "$*" >> "$RCLONE_CALLS"
case "$1" in
  listremotes) echo "distant-crypt:" ;;
  copy)
    if [[ " $* " == *" --immutable "* ]] && [ -e "$2/CHANGED" ]; then
      echo "ERROR : immutable file modified" >&2; exit 1
    fi ;;
  delete) [ -n "${RCLONE_DELETE_FAILS:-}" ] && exit 1 ;;
esac
exit 0
"""


@pytest.fixture
def env(tmp_path):
    bindir = tmp_path / "bin"
    bindir.mkdir()
    rclone = bindir / "rclone"
    rclone.write_text(FAKE_RCLONE)
    rclone.chmod(rclone.stat().st_mode | stat.S_IEXEC)
    src = tmp_path / "backups"
    for d in ("daily", "weekly", "monthly"):
        (src / d).mkdir(parents=True)
        (src / d / f"schoolflow-{d}.sql.gz").write_text("dump")
    return {
        **os.environ,
        "PATH": f"{bindir}:{os.environ['PATH']}",
        "BACKUP_SRC": str(src),
        "OFFSITE_LOG": str(tmp_path / "offsite.log"),
        "RCLONE_CALLS": str(tmp_path / "calls.log"),
    }


def _run(env):
    return subprocess.run(["bash", str(SCRIPT)], env=env, capture_output=True, text=True, timeout=30)


def _calls(env) -> list[str]:
    return Path(env["RCLONE_CALLS"]).read_text().splitlines()


def test_current_week_and_month_dumps_can_be_replaced(env):
    for d in ("weekly", "monthly"):
        (Path(env["BACKUP_SRC"]) / d / "CHANGED").write_text("re-pointed tonight")

    result = _run(env)

    assert result.returncode == 0, result.stderr
    assert Path(env["OFFSITE_LOG"]).read_text().splitlines()[-1].endswith(" OK")
    copies = [c for c in _calls(env) if c.startswith("copy ")]
    assert len(copies) == 3
    assert all("--immutable" not in c for c in copies if "distant-crypt:weekly" in c or "distant-crypt:monthly" in c)


def test_daily_dumps_stay_immutable(env):
    assert _run(env).returncode == 0
    daily = next(c for c in _calls(env) if "distant-crypt:daily" in c)
    assert "--immutable" in daily


def test_a_failure_still_copies_the_rest_and_is_reported(env):
    (Path(env["BACKUP_SRC"]) / "daily" / "CHANGED").write_text("tampered")

    result = _run(env)

    assert result.returncode != 0
    assert Path(env["OFFSITE_LOG"]).read_text().splitlines()[-1].endswith(" ÉCHEC")
    targets = [c for c in _calls(env) if c.startswith("copy ")]
    assert any("distant-crypt:monthly" in c for c in targets)  # la suite a tourné
    assert any(c.startswith("delete ") for c in _calls(env))


def test_purge_failure_is_not_reported_as_ok(env):
    env["RCLONE_DELETE_FAILS"] = "1"
    assert _run(env).returncode != 0
    assert not Path(env["OFFSITE_LOG"]).read_text().splitlines()[-1].endswith(" OK")
