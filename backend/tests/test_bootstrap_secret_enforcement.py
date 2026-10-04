"""BOOTSTRAP_SECRET : appliqué à l'API, sans bloquer le worker (régression, 2026-10).

Le contrôle fail-closed a quitté l'import de app/core/config.py (qui tuait le
worker ARQ de production à chaque démarrage) pour enforce_bootstrap_secret(),
appelé par app/main.py. Ces tests verrouillent les deux moitiés du contrat.
"""
import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core import config as config_module  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]


class TestEnforceBootstrapSecret:
    @pytest.mark.parametrize("value", ["", "too-short-secret"])
    def test_production_refuses_missing_or_weak_secret(self, monkeypatch, value):
        monkeypatch.setattr(config_module.settings, "DEBUG", False)
        monkeypatch.setattr(config_module.settings, "BOOTSTRAP_SECRET", value)
        with pytest.raises(SystemExit):
            config_module.enforce_bootstrap_secret()

    def test_production_accepts_strong_secret(self, monkeypatch):
        monkeypatch.setattr(config_module.settings, "DEBUG", False)
        monkeypatch.setattr(config_module.settings, "BOOTSTRAP_SECRET", secrets.token_hex(32))
        config_module.enforce_bootstrap_secret()

    @pytest.mark.parametrize("value", ["", "short"])
    def test_debug_only_warns(self, monkeypatch, value):
        monkeypatch.setattr(config_module.settings, "DEBUG", True)
        monkeypatch.setattr(config_module.settings, "BOOTSTRAP_SECRET", value)
        config_module.enforce_bootstrap_secret()


def _run(code: str, with_secret: bool, tmp_path: Path) -> subprocess.CompletedProcess:
    # cwd = dossier temporaire : config.py lit un `.env` relatif au dossier
    # courant ; on ne veut hériter d'aucun fichier local (processus hermétique).
    env = {k: v for k, v in os.environ.items() if k not in {"BOOTSTRAP_SECRET", "DEBUG"}}
    tmp_db = tmp_path / "bootstrap_probe.db"
    env.update({
        "PYTHONPATH": str(BACKEND_DIR),
        "DEBUG": "false",
        "DATABASE_URL": f"sqlite:///{tmp_db.as_posix()}",
        "DATABASE_URL_SYNC": f"sqlite:///{tmp_db.as_posix()}",
        "SECRET_KEY": secrets.token_hex(32),
        "BACKEND_CORS_ORIGINS": "http://localhost",
        "PYTHONIOENCODING": "utf-8",
    })
    if with_secret:
        env["BOOTSTRAP_SECRET"] = secrets.token_hex(32)
    return subprocess.run([sys.executable, "-c", code], cwd=tmp_path, env=env,
                          capture_output=True, text=True, timeout=180)


class TestProcessStartup:
    def test_worker_imports_without_bootstrap_secret(self, tmp_path):
        r = _run("import app.workers.tasks", with_secret=False, tmp_path=tmp_path)
        assert r.returncode == 0, r.stderr[-800:]

    def test_api_refuses_to_start_without_bootstrap_secret(self, tmp_path):
        r = _run("import app.main", with_secret=False, tmp_path=tmp_path)
        assert r.returncode != 0
        assert "BOOTSTRAP_SECRET" in (r.stdout + r.stderr)

    def test_api_starts_with_bootstrap_secret(self, tmp_path):
        r = _run("import app.main", with_secret=True, tmp_path=tmp_path)
        assert r.returncode == 0, r.stderr[-800:]
