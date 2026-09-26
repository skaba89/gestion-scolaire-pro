"""4 fixes from the 2026-09 permissions/completeness audit continuing
docs/PERMISSIONS_MATRIX.md, this time on the layouts NOT reachable via
AdminLayout.tsx (TeacherLayout, StudentLayout, ParentLayout, AlumniLayout):

- TEACHER "Badges" (QR check-in scanner, ClassSessionAttendance.tsx):
  POST /school-life/check-ins/sessions/start/, PATCH .../{id}/end/, and
  GET /school-life/check-ins/badges/?qr_code_data=... never existed at
  all — a 404 on every step of the page's only real feature.
- PARENT "Messages"/"Appointments": GET /parents/children-teachers/ never
  existed either — the Messages recipient list silently stayed empty
  (caught and swallowed) and Appointments' teacher dropdown 404'd.
- ALUMNI document-request history: GET /alumni/document-requests/{id}/
  history/ scoped its ownership check on tenant_id alone, admitting ANY
  authenticated user of the tenant, not just the request's owner or
  actual staff (users:read) — a cross-user data leak.

STUDENT's own bug (StudentCareers.tsx calling the admin-only
/alumni/admin/mentorship-requests/ instead of the self-scoped
/alumni/mentorship-requests/) is a frontend-only fix, covered by
src/features/students/services/__tests__/studentsService.test.ts instead.

check_in_sessions/check_in_assignments are raw-SQL operational tables
(app/core/operational_tables.py) never created by
Base.metadata.create_all() on the SQLite test DB — Postgres-only, same
pattern as the rest of this audit's test files.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from sqlalchemy import text  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="check_in_sessions/teacher_assignments are raw-SQL operational "
           "tables whose DDL is Postgres-specific — see "
           "app/core/operational_tables.py.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Audit Test", slug=f"audit-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str, *, first_name="Test", last_name="User") -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@audit-test.example",
            username=f"u-{user_id[:8]}", first_name=first_name, last_name=last_name,
            password_hash="x", is_active=True,
        ))
        db.commit()
    return user_id


def _make_classroom(tenant_id: str) -> str:
    classroom_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Classroom(id=classroom_id, tenant_id=tenant_id, name="6e A"))
        db.commit()
    return classroom_id


def _make_academic_year(tenant_id: str) -> str:
    ay_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(AcademicYear(
            id=ay_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
            start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True,
        ))
        db.commit()
    return ay_id


def _make_student(tenant_id: str, *, reg: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            # registration_number is globally unique across tenants — suffix
            # with the student's own id to avoid collisions across test runs.
            id=student_id, tenant_id=tenant_id, registration_number=f"{reg}-{student_id[:8]}",
            first_name="Test", last_name="Élève",
            date_of_birth=date(2012, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _enroll(tenant_id: str, student_id: str, classroom_id: str, academic_year_id: str) -> None:
    with SessionLocal() as db:
        db.add(Enrollment(
            id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
            class_id=classroom_id, academic_year_id=academic_year_id,
            enrollment_date=date(2026, 9, 1), status="ACTIVE",
        ))
        db.commit()


def _link_parent(tenant_id: str, parent_id: str, student_id: str) -> None:
    with SessionLocal() as db:
        db.add(ParentStudent(
            id=str(uuid.uuid4()), tenant_id=tenant_id, parent_id=parent_id,
            student_id=student_id, is_primary=True,
        ))
        db.commit()


def _assign_teacher(tenant_id: str, teacher_id: str, classroom_id: str) -> None:
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO teacher_assignments (id, tenant_id, user_id, classroom_id)
            VALUES (:id, :tid, :uid, :cid)
        """), {"id": str(uuid.uuid4()), "tid": tenant_id, "uid": teacher_id, "cid": classroom_id})
        db.commit()


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@requires_postgres
class TestParentChildrenTeachers:
    def test_parent_sees_only_their_own_childrens_teachers(self):
        tenant_id = _make_tenant()
        ay_id = _make_academic_year(tenant_id)
        classroom_a = _make_classroom(tenant_id)
        classroom_b = _make_classroom(tenant_id)
        teacher_a = _make_user(tenant_id, first_name="Aïssatou", last_name="Diallo")
        teacher_b = _make_user(tenant_id, first_name="Ibrahima", last_name="Sow")
        _assign_teacher(tenant_id, teacher_a, classroom_a)
        _assign_teacher(tenant_id, teacher_b, classroom_b)

        # parent_students.parent_id is a real FK to users(id).
        parent_id = _make_user(tenant_id)
        my_child = _make_student(tenant_id, reg="P-1")
        _enroll(tenant_id, my_child, classroom_a, ay_id)
        _link_parent(tenant_id, parent_id, my_child)

        other_child = _make_student(tenant_id, reg="P-2")
        _enroll(tenant_id, other_child, classroom_b, ay_id)

        resp = _as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}).get(
            "/api/v1/parents/children-teachers/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        names = {(t["first_name"], t["last_name"]) for t in resp.json()}
        assert names == {("Aïssatou", "Diallo")}, "must only see teachers of the caller's own children"

    def test_parent_with_no_children_gets_empty_list_not_an_error(self):
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id}).get(
            "/api/v1/parents/children-teachers/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == []


@requires_postgres
class TestTeacherCheckInSessionLifecycle:
    def test_start_list_and_end_session(self):
        tenant_id = _make_tenant()
        classroom_id = _make_classroom(tenant_id)
        # check_in_sessions.teacher_id is a real FK to users(id) — needs an
        # actual row, unlike the synthetic ids used for TEACHER callers below
        # whose requests never insert a teacher_id.
        teacher_id = _make_user(tenant_id)
        headers = _as({"id": teacher_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        start_resp = headers.post(
            "/api/v1/school-life/check-ins/sessions/start/",
            json={"class_id": classroom_id},
            headers=HEADERS,
        )
        assert start_resp.status_code == 200, start_resp.text
        session = start_resp.json()
        assert session["class_id"] == classroom_id
        assert session["status"] == "ACTIVE"
        session_id = session["id"]

        list_resp = headers.get(
            "/api/v1/school-life/check-ins/sessions/",
            params={"class_id": classroom_id, "status": "active"},
            headers=HEADERS,
        )
        assert list_resp.status_code == 200, list_resp.text
        items = list_resp.json()["items"]
        assert any(i["id"] == session_id for i in items), "status filter must be case-insensitive"

        end_resp = headers.patch(
            f"/api/v1/school-life/check-ins/sessions/{session_id}/end/",
            json={},
            headers=HEADERS,
        )
        assert end_resp.status_code == 200, end_resp.text
        assert end_resp.json()["status"] == "COMPLETED"

    def test_ending_unknown_session_returns_404(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id})
        resp = headers.patch(
            f"/api/v1/school-life/check-ins/sessions/{uuid.uuid4()}/end/",
            json={}, headers=HEADERS,
        )
        assert resp.status_code == 404, resp.text

    def test_badge_lookup_resolves_card_uid_to_student(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id, reg="BADGE-1")
        card_uid = f"NFC-CARD-{student_id[:8]}"
        with SessionLocal() as db:
            student = db.get(Student, student_id)
            student.card_uid = card_uid
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id})
        resp = headers.get(
            "/api/v1/school-life/check-ins/badges/",
            params={"qr_code_data": card_uid},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["student_id"] == student_id

    def test_badge_lookup_returns_null_for_unknown_card(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id})
        resp = headers.get(
            "/api/v1/school-life/check-ins/badges/",
            params={"qr_code_data": "NOT-A-REAL-CARD"},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() is None

    def test_badge_lookup_is_tenant_scoped(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_id = _make_student(tenant_a, reg="BADGE-2")
        card_uid = f"NFC-CARD-{student_id[:8]}"
        with SessionLocal() as db:
            student = db.get(Student, student_id)
            student.card_uid = card_uid
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_b})
        resp = headers.get(
            "/api/v1/school-life/check-ins/badges/",
            params={"qr_code_data": card_uid},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() is None, "a card from another tenant must never resolve"


@requires_postgres
class TestAlumniDocumentRequestHistoryOwnership:
    def _make_request(self, tenant_id: str, alumni_id: str) -> str:
        request_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.execute(text("""
                INSERT INTO alumni_document_requests
                    (id, tenant_id, alumni_id, document_type, purpose)
                VALUES (:id, :tid, :aid, 'transcript', 'Admission universitaire')
            """), {"id": request_id, "tid": tenant_id, "aid": alumni_id})
            db.commit()
        return request_id

    def test_owner_can_read_their_own_request_history(self):
        tenant_id = _make_tenant()
        alumni_id = _make_user(tenant_id)
        request_id = self._make_request(tenant_id, alumni_id)

        resp = _as({"id": alumni_id, "roles": ["ALUMNI"], "tenant_id": tenant_id}).get(
            f"/api/v1/alumni/document-requests/{request_id}/history/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text

    def test_staff_with_users_read_can_see_any_request_history(self):
        tenant_id = _make_tenant()
        alumni_id = _make_user(tenant_id)
        request_id = self._make_request(tenant_id, alumni_id)

        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}).get(
            f"/api/v1/alumni/document-requests/{request_id}/history/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text

    def test_other_tenant_user_without_users_read_cannot_read_anothers_request_history(self):
        """SECURITY FIX: the old check accepted `tenant_id = :tenant_id` as an
        alternative to ownership — ANY authenticated tenant user (e.g. an
        unrelated ALUMNI, or a STUDENT/PARENT) could read another alumnus's
        request history. Must now 404, same as a request that doesn't exist."""
        tenant_id = _make_tenant()
        alumni_id = _make_user(tenant_id)
        request_id = self._make_request(tenant_id, alumni_id)

        attacker_id = str(uuid.uuid4())
        resp = _as({"id": attacker_id, "roles": ["ALUMNI"], "tenant_id": tenant_id}).get(
            f"/api/v1/alumni/document-requests/{request_id}/history/", headers=HEADERS,
        )
        assert resp.status_code == 404, resp.text

        resp2 = _as({"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}).get(
            f"/api/v1/alumni/document-requests/{request_id}/history/", headers=HEADERS,
        )
        assert resp2.status_code == 404, resp2.text
