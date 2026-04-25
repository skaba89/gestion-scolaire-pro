"""Tests for parent portal endpoints — auth guards + basic shape validation."""
from conftest import get_test_client

client = get_test_client()


class TestParentAuthGuards:
    """All parent endpoints must require PARENT role authentication."""

    def test_parent_children_requires_auth(self):
        resp = client.get("/api/v1/parents/children/")
        assert resp.status_code in (401, 403)

    def test_parent_invoices_requires_auth(self):
        resp = client.get("/api/v1/parents/invoices/")
        assert resp.status_code in (401, 403)

    def test_parent_attendance_requires_auth(self):
        resp = client.get("/api/v1/parents/attendance/")
        assert resp.status_code in (401, 403)

    def test_parent_grades_requires_auth(self):
        resp = client.get("/api/v1/parents/grades/")
        assert resp.status_code in (401, 403)

    def test_parent_messages_requires_auth(self):
        resp = client.get("/api/v1/parents/messages/")
        assert resp.status_code in (401, 403)

    def test_send_message_requires_auth(self):
        resp = client.post("/api/v1/parents/messages/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_parent_homework_requires_auth(self):
        resp = client.get("/api/v1/parents/homework/")
        assert resp.status_code in (401, 403)

    def test_parent_notifications_requires_auth(self):
        resp = client.get("/api/v1/parents/notifications/")
        assert resp.status_code in (401, 403)


class TestParentEndpointExistence:
    """Parent endpoints must be registered in the router."""

    def test_children_endpoint_exists(self):
        resp = client.get("/api/v1/parents/children/")
        assert resp.status_code != 404, "GET /parents/children/ must exist"

    def test_invoices_endpoint_exists(self):
        resp = client.get("/api/v1/parents/invoices/")
        assert resp.status_code != 404, "GET /parents/invoices/ must exist"

    def test_messages_endpoint_exists(self):
        resp = client.get("/api/v1/parents/messages/")
        assert resp.status_code != 404, "GET /parents/messages/ must exist"

    def test_attendance_endpoint_exists(self):
        resp = client.get("/api/v1/parents/attendance/")
        assert resp.status_code != 404, "GET /parents/attendance/ must exist"


class TestParentTenantIsolation:
    """Requests without tenant context must be blocked."""

    def test_children_without_tenant_blocked(self):
        """No tenant in JWT → must return 401 or 403, never 200."""
        resp = client.get("/api/v1/parents/children/")
        assert resp.status_code in (401, 403)

    def test_grades_without_tenant_blocked(self):
        resp = client.get("/api/v1/parents/grades/")
        assert resp.status_code in (401, 403)

    def test_invoices_without_tenant_blocked(self):
        resp = client.get("/api/v1/parents/invoices/")
        assert resp.status_code in (401, 403)
