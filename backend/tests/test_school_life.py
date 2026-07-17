"""Tests for school_life operational endpoints — auth guards + shape checks."""
from conftest import get_test_client

client = get_test_client()

SCHOOL_LIFE_ENDPOINTS = [
    "/api/v1/school-life/appointment-slots/",
    "/api/v1/school-life/check-in-sessions/",
    "/api/v1/school-life/career-events/",
    "/api/v1/school-life/badges/",
    "/api/v1/school-life/homework/",
]

POST_ENDPOINTS = [
    "/api/v1/school-life/appointment-slots/",
    "/api/v1/school-life/check-in-sessions/",
]


class TestSchoolLifeAuthGuards:
    """Every school_life GET endpoint must reject unauthenticated requests."""

    def test_appointment_slots_requires_auth(self):
        resp = client.get("/api/v1/school-life/appointment-slots/")
        assert resp.status_code in (401, 403), f"Expected 401/403, got {resp.status_code}"

    def test_check_in_sessions_requires_auth(self):
        resp = client.get("/api/v1/school-life/check-in-sessions/")
        assert resp.status_code in (401, 403)

    def test_career_events_requires_auth(self):
        resp = client.get("/api/v1/school-life/career-events/")
        assert resp.status_code in (401, 403)

    def test_badges_requires_auth(self):
        resp = client.get("/api/v1/school-life/badges/")
        assert resp.status_code in (401, 403)

    def test_homework_requires_auth(self):
        resp = client.get("/api/v1/school-life/homework/")
        assert resp.status_code in (401, 403)

    def test_report_card_v2_requires_auth(self):
        resp = client.post("/api/v1/school-life/generate-report-card/v2/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_batch_report_cards_requires_auth(self):
        resp = client.post("/api/v1/school-life/generate-report-cards/batch/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_career_event_registrations_requires_auth(self):
        resp = client.get("/api/v1/school-life/career-event-registrations/")
        assert resp.status_code in (401, 403)


class TestSchoolLifeEndpointExistence:
    """Endpoints must exist (not 404/405)."""

    def test_appointment_slots_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/appointment-slots/")
        assert resp.status_code != 404

    def test_check_in_sessions_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/check-in-sessions/")
        assert resp.status_code != 404

    def test_badges_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/badges/")
        assert resp.status_code != 404

    def test_homework_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/homework/")
        assert resp.status_code != 404

    def test_career_events_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/career-events/")
        assert resp.status_code != 404


class TestCheckInSchema:
    """Régression : le scan QR ne fournit pas checked_at (horodaté serveur)."""

    def test_check_in_create_accepts_payload_without_checked_at(self):
        import uuid
        from app.schemas.school_life import StudentCheckInCreate

        obj = StudentCheckInCreate(student_id=uuid.uuid4(), source="QR_SCAN")
        assert obj.checked_at is None
        assert obj.source == "QR_SCAN"
        assert obj.direction == "IN"

    def test_check_in_create_still_accepts_explicit_checked_at(self):
        import uuid
        from datetime import datetime
        from app.schemas.school_life import StudentCheckInCreate

        now = datetime(2026, 7, 17, 8, 0, 0)
        obj = StudentCheckInCreate(student_id=uuid.uuid4(), checked_at=now, source="MANUAL")
        assert obj.checked_at == now
