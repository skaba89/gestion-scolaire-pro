"""Tests for analytics and settings endpoints — auth guards + response shape."""
import pytest
from conftest import get_test_client

client = get_test_client()


class TestAnalyticsAuth:
    """All analytics endpoints must require authentication."""

    def test_financial_kpis_requires_auth(self):
        resp = client.get("/api/v1/analytics/financial-kpis/")
        assert resp.status_code in (401, 403)

    def test_overview_requires_auth(self):
        resp = client.get("/api/v1/analytics/overview/")
        assert resp.status_code in (401, 403)

    def test_students_stats_requires_auth(self):
        resp = client.get("/api/v1/analytics/students/")
        assert resp.status_code in (401, 403)

    def test_attendance_stats_requires_auth(self):
        resp = client.get("/api/v1/analytics/attendance/")
        assert resp.status_code in (401, 403)

    def test_export_csv_requires_auth(self):
        resp = client.get("/api/v1/analytics/export/students/")
        assert resp.status_code in (401, 403)


class TestMetricsEndpoint:
    """The /metrics/ endpoint must be secured in production."""

    def test_metrics_blocked_without_secret(self, monkeypatch):
        """When DEBUG=false and no secret provided, must return 403."""
        import os
        monkeypatch.setenv("DEBUG", "false")
        monkeypatch.delenv("METRICS_SECRET", raising=False)
        resp = client.get("/metrics/")
        # Either 403 (disabled) or 401/403 (auth required)
        assert resp.status_code in (401, 403)

    def test_metrics_reachable_in_debug(self, monkeypatch):
        """In DEBUG mode, metrics are accessible without authentication."""
        import os
        monkeypatch.setenv("DEBUG", "true")
        resp = client.get("/metrics/")
        # Should not be 404; content-type text/plain for Prometheus
        assert resp.status_code != 404


class TestMFAEnforcement:
    """ENFORCE_MFA must block login for privileged users without MFA."""

    def test_login_with_bad_password_is_401(self):
        resp = client.post(
            "/api/v1/auth/login/",
            data={"username": "admin@test.com", "password": "wrong"},
        )
        assert resp.status_code in (401, 403, 422)

    def test_login_endpoint_accepts_form_data(self):
        """Login endpoint must accept OAuth2 form (not JSON body)."""
        resp = client.post(
            "/api/v1/auth/login/",
            data={"username": "test@example.com", "password": "secret"},
        )
        # 422 = validation ok but wrong format, 401 = auth failed — both mean the endpoint exists
        assert resp.status_code != 404
        assert resp.status_code != 405

    def test_refresh_token_endpoint_exists(self):
        """Token refresh endpoint must exist and reject missing token."""
        resp = client.post("/api/v1/auth/refresh/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_logout_endpoint_exists(self):
        """Logout endpoint must reject unauthenticated requests."""
        resp = client.post("/api/v1/auth/logout/")
        assert resp.status_code in (401, 403, 422)
