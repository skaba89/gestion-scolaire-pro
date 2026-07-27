"""Tests for school_life operational endpoints — auth guards + shape checks."""
import base64
import uuid
from datetime import date

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

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


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


class TestGenerateReportCardV2:
    """Régression : le template HTML du bulletin plantait avec un
    NameError ('safe_name' is not defined) dès qu'un élève réel était
    fourni, car {safe_name}/{safe_term} étaient interprétés comme des
    expressions f-string au lieu de rester du texte littéral remplacé
    ensuite par .replace(). Aucun test existant n'exerçait ce chemin
    avec des données réelles (seul le 401/422 sans auth était couvert),
    ce qui a laissé le bug invisible jusqu'à une vérification manuelle
    en navigateur."""

    def test_generates_html_bulletin_without_crashing(self):
        tenant_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())

        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="Ecole Bulletin Test", slug=f"bulletin-{tenant_id[:8]}",
                type="secondary", country="GN", is_active=True, settings={},
            ))
            db.commit()

            db.add(Student(
                id=student_id, tenant_id=tenant_id,
                registration_number=f"REG-{student_id[:8]}",
                first_name="Mariam", last_name="Diallo",
                date_of_birth=date(2009, 3, 15), gender=Gender.FEMALE,
                status=StudentStatus.ACTIVE,
            ))
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.post(
            "/api/v1/school-life/generate-report-card/v2/",
            json={
                "student_id": student_id,
                "term_id": str(uuid.uuid4()),
                "classroom_id": str(uuid.uuid4()),
            },
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        html = base64.b64decode(body["html"]).decode("utf-8")
        assert "Mariam Diallo" in html
        assert "safe_name" not in html
        assert "safe_term" not in html
