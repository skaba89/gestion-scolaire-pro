"""Tests for attendance, homework, clubs, and incident endpoints — auth guards + existence."""
from conftest import get_test_client

client = get_test_client()


class TestAttendanceAuthGuards:
    """Tous les endpoints de présence nécessitent une authentification."""

    def test_attendance_list_requires_auth(self):
        resp = client.get("/api/v1/academic/attendance/")
        assert resp.status_code in (401, 403)

    def test_attendance_create_requires_auth(self):
        resp = client.post("/api/v1/academic/attendance/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_attendance_bulk_requires_auth(self):
        resp = client.post("/api/v1/academic/attendance/bulk/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_attendance_stats_requires_auth(self):
        resp = client.get("/api/v1/academic/attendance/stats/")
        assert resp.status_code in (401, 403, 404)

    def test_attendance_by_student_requires_auth(self):
        resp = client.get("/api/v1/academic/attendance/student/nonexistent-id/")
        assert resp.status_code in (401, 403, 404)


class TestHomeworkAuthGuards:
    """Tous les endpoints devoirs nécessitent une authentification."""

    def test_homework_list_requires_auth(self):
        resp = client.get("/api/v1/academic/homework/")
        assert resp.status_code in (401, 403)

    def test_homework_create_requires_auth(self):
        resp = client.post("/api/v1/academic/homework/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_homework_detail_requires_auth(self):
        resp = client.get("/api/v1/academic/homework/nonexistent-id/")
        assert resp.status_code in (401, 403, 404)


class TestClubsAuthGuards:
    """Tous les endpoints clubs nécessitent une authentification."""

    def test_clubs_list_requires_auth(self):
        resp = client.get("/api/v1/school-life/clubs/")
        assert resp.status_code in (401, 403)

    def test_clubs_create_requires_auth(self):
        resp = client.post("/api/v1/school-life/clubs/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_club_members_requires_auth(self):
        resp = client.get("/api/v1/school-life/clubs/nonexistent-id/members/")
        assert resp.status_code in (401, 403, 404)


class TestIncidentsAuthGuards:
    """Tous les endpoints incidents nécessitent une authentification."""

    def test_incidents_list_requires_auth(self):
        resp = client.get("/api/v1/school-life/incidents/")
        assert resp.status_code in (401, 403)

    def test_incident_create_requires_auth(self):
        resp = client.post("/api/v1/school-life/incidents/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_incident_detail_requires_auth(self):
        resp = client.get("/api/v1/school-life/incidents/nonexistent-id/")
        assert resp.status_code in (401, 403, 404)


class TestAttendanceEndpointExistence:
    """Les endpoints doivent être enregistrés dans le routeur."""

    def test_attendance_endpoint_exists(self):
        resp = client.get("/api/v1/academic/attendance/")
        assert resp.status_code != 404, "GET /academic/attendance/ must exist"

    def test_homework_endpoint_exists(self):
        resp = client.get("/api/v1/academic/homework/")
        assert resp.status_code != 404, "GET /academic/homework/ must exist"

    def test_clubs_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/clubs/")
        assert resp.status_code != 404, "GET /school-life/clubs/ must exist"

    def test_incidents_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/incidents/")
        assert resp.status_code != 404, "GET /school-life/incidents/ must exist"


class TestAttendanceTenantIsolation:
    """Requêtes sans contexte tenant bloquées."""

    def test_attendance_without_tenant_blocked(self):
        resp = client.get("/api/v1/academic/attendance/")
        assert resp.status_code in (401, 403)

    def test_homework_without_tenant_blocked(self):
        resp = client.get("/api/v1/academic/homework/")
        assert resp.status_code in (401, 403)

    def test_clubs_without_tenant_blocked(self):
        resp = client.get("/api/v1/school-life/clubs/")
        assert resp.status_code in (401, 403)

    def test_incidents_without_tenant_blocked(self):
        resp = client.get("/api/v1/school-life/incidents/")
        assert resp.status_code in (401, 403)


class TestAttendanceInputValidation:
    """Payloads invalides → 422 (si authentifié) ou 401/403."""

    def test_attendance_create_empty_body(self):
        resp = client.post("/api/v1/academic/attendance/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_homework_create_empty_body(self):
        resp = client.post("/api/v1/academic/homework/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_club_create_empty_body(self):
        resp = client.post("/api/v1/school-life/clubs/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_incident_create_empty_body(self):
        resp = client.post("/api/v1/school-life/incidents/", json={})
        assert resp.status_code in (401, 403, 422)
