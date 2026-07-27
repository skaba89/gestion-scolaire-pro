"""GET /metrics/ — national audit Phase 4 (protection en production).

The endpoint (app/main.py:prometheus_metrics) already implements exactly
the behavior requested by the audit: open access in DEBUG mode (local
dev/Prometheus scraping convenience), deny-by-default in production if no
METRICS_SECRET is configured, and HMAC-safe comparison against a secret
passed via query param or Bearer header otherwise. This file adds the
regression tests the audit explicitly requires — none existed before.
"""
import os

from conftest import get_test_client

client = get_test_client()

from app.main import settings  # noqa: E402


def teardown_function():
    # Never leak a monkeypatched DEBUG/secret state into other test files.
    os.environ.pop("METRICS_SECRET", None)


class TestMetricsProtection:
    def test_debug_mode_allows_unrestricted_access(self, monkeypatch):
        monkeypatch.setattr(settings, "DEBUG", True)
        resp = client.get("/metrics/")
        assert resp.status_code == 200, resp.text

    def test_production_without_secret_configured_denies_access(self, monkeypatch):
        monkeypatch.setattr(settings, "DEBUG", False)
        monkeypatch.delenv("METRICS_SECRET", raising=False)
        resp = client.get("/metrics/")
        assert resp.status_code == 403, resp.text

    def test_production_with_wrong_secret_is_rejected(self, monkeypatch):
        monkeypatch.setattr(settings, "DEBUG", False)
        monkeypatch.setenv("METRICS_SECRET", "the-real-secret")
        resp = client.get("/metrics/", params={"secret": "wrong-guess"})
        assert resp.status_code == 401, resp.text

    def test_production_with_correct_query_secret_succeeds(self, monkeypatch):
        monkeypatch.setattr(settings, "DEBUG", False)
        monkeypatch.setenv("METRICS_SECRET", "the-real-secret")
        resp = client.get("/metrics/", params={"secret": "the-real-secret"})
        assert resp.status_code == 200, resp.text

    def test_production_with_correct_bearer_secret_succeeds(self, monkeypatch):
        monkeypatch.setattr(settings, "DEBUG", False)
        monkeypatch.setenv("METRICS_SECRET", "the-real-secret")
        resp = client.get("/metrics/", headers={"Authorization": "Bearer the-real-secret"})
        assert resp.status_code == 200, resp.text
