"""Ownership scoping on GET/POST /api/v1/alumni/careers/applications/ and
GET /api/v1/alumni/mentorship-requests/ (institutional-readiness audit,
2026-09).

Before this fix:
  - list_job_applications scoped a non-admin to `student_id or user_id` —
    the CLIENT-SUPPLIED student_id won whenever present, so any
    authenticated alumnus could read another alumnus's job applications
    (including cover letters) via ?student_id=<other>.
  - create_job_application inserted `body.get("student_id") or user_id` —
    letting a caller submit an application AS another student.
  - list_mentorship_requests_student used `student_id or user_id` with no
    admin exception at all — any authenticated user could read another
    student's mentorship requests (private message/goals) the same way.

None of this is exercised by the actual frontend (which never sends
student_id to these endpoints — see src/pages/student/StudentCareers.tsx),
so the fix simply ignores the client-supplied id for these endpoints;
staff use the dedicated, permission-gated GET /alumni/admin/... endpoints
instead.

job_offers/job_applications/mentorship_requests are raw-SQL operational
tables (see app/core/operational_tables.py, Postgres-specific DDL:
TIMESTAMPTZ/DEFAULT now()) never created in the SQLite test lifespan —
same constraint as test_announcements_authorization.py.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="job_offers/job_applications/mentorship_requests are raw-SQL "
           "operational tables whose DDL is Postgres-specific — see "
           "app/core/operational_tables.py. Exercised by the CI Postgres job.",
)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Alumni Test", slug=f"alumni-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
            subscription_plan="starter", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str, *, reg: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=reg,
            first_name="Ancien", last_name="Élève",
            date_of_birth=date(2000, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _make_job_offer(tenant_id: str) -> str:
    from sqlalchemy import text
    offer_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO job_offers (id, tenant_id, title, company_name, is_active)
            VALUES (:id, :tid, 'Développeur', 'ACME', true)
        """), {"id": offer_id, "tid": tenant_id})
        db.commit()
    return offer_id


def _make_job_application(tenant_id: str, student_id: str, job_offer_id: str) -> None:
    from sqlalchemy import text
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO job_applications (id, tenant_id, student_id, job_offer_id, cover_letter)
            VALUES (:id, :tid, :sid, :jid, 'Ma lettre de motivation confidentielle')
        """), {"id": str(uuid.uuid4()), "tid": tenant_id, "sid": student_id, "jid": job_offer_id})
        db.commit()


def _make_mentorship_request(tenant_id: str, student_id: str) -> None:
    from sqlalchemy import text
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO mentorship_requests (id, tenant_id, student_id, message)
            VALUES (:id, :tid, :sid, 'Mon objectif de carrière confidentiel')
        """), {"id": str(uuid.uuid4()), "tid": tenant_id, "sid": student_id})
        db.commit()


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestCannotReadOrActAsAnotherStudent:
    def test_alumnus_cannot_list_another_students_job_applications(self):
        tenant_id = _make_tenant()
        offer_id = _make_job_offer(tenant_id)
        victim_id = _make_student(tenant_id, reg="ALU-1")
        _make_job_application(tenant_id, victim_id, offer_id)

        attacker = {"id": str(uuid.uuid4()), "roles": ["ALUMNI"], "tenant_id": tenant_id}
        resp = _as(attacker).get(
            "/api/v1/alumni/careers/applications/",
            params={"student_id": victim_id},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == [], "must not leak another student's applications/cover letters"

    def test_student_cannot_apply_as_another_student(self):
        tenant_id = _make_tenant()
        offer_id = _make_job_offer(tenant_id)
        victim_id = _make_student(tenant_id, reg="ALU-2")
        attacker_student_id = _make_student(tenant_id, reg="ALU-2-ATTACKER")

        attacker = {"id": attacker_student_id, "roles": ["ALUMNI"], "tenant_id": tenant_id}
        resp = _as(attacker).post(
            "/api/v1/alumni/careers/applications/",
            json={"student_id": victim_id, "job_offer_id": offer_id, "cover_letter": "spoofed"},
            headers=HEADERS,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["id"]
        with SessionLocal() as db:
            from sqlalchemy import text
            row = db.execute(text(
                "SELECT student_id FROM job_applications WHERE job_offer_id = :jid"
            ), {"jid": offer_id}).mappings().first()
        assert str(row["student_id"]) == attacker["id"], "application must be attributed to the caller, not the spoofed student_id"

    def test_student_cannot_view_another_students_mentorship_requests(self):
        tenant_id = _make_tenant()
        victim_id = _make_student(tenant_id, reg="ALU-3")
        _make_mentorship_request(tenant_id, victim_id)

        attacker = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(attacker).get(
            "/api/v1/alumni/mentorship-requests/",
            params={"student_id": victim_id},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == [], "must not leak another student's mentorship requests"


class TestOwnDataStillWorks:
    def test_alumnus_can_list_own_job_applications(self):
        tenant_id = _make_tenant()
        offer_id = _make_job_offer(tenant_id)
        # job_applications.student_id has an FK on students(id) — an alumnus
        # keeps their original student row, so "own id" here is that row's id.
        user_id = _make_student(tenant_id, reg="ALU-OWN-1")
        _make_job_application(tenant_id, user_id, offer_id)

        alumnus = {"id": user_id, "roles": ["ALUMNI"], "tenant_id": tenant_id}
        resp = _as(alumnus).get("/api/v1/alumni/careers/applications/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1

    def test_student_can_view_own_mentorship_requests(self):
        tenant_id = _make_tenant()
        user_id = _make_student(tenant_id, reg="ALU-OWN-2")
        _make_mentorship_request(tenant_id, user_id)

        student = {"id": user_id, "roles": ["STUDENT"], "tenant_id": tenant_id}
        resp = _as(student).get("/api/v1/alumni/mentorship-requests/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1

    def test_staff_can_still_look_up_a_students_applications(self):
        tenant_id = _make_tenant()
        offer_id = _make_job_offer(tenant_id)
        student_id = _make_student(tenant_id, reg="ALU-4")
        _make_job_application(tenant_id, student_id, offer_id)

        staff = {"id": str(uuid.uuid4()), "roles": ["STAFF"], "tenant_id": tenant_id}
        resp = _as(staff).get(
            "/api/v1/alumni/careers/applications/",
            params={"student_id": student_id},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1
