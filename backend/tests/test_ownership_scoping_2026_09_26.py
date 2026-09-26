"""Ownership-check audit, follow-up to the ID-parameter methodology note in
docs/PERMISSIONS_MATRIX.md (the note that led to the ALUMNI document-request
history fix in PR #236). Systematic search for endpoints reachable by a
narrow, self-scoped role (STUDENT/PARENT/ALUMNI) that fetch a resource by id
or list resources with no check the resource actually belongs to the caller.

Real bugs found and fixed here:

- operational/school_life.py::read_grades and ::read_attendance had NO
  permission check at all (Depends(get_current_user) only) — any
  authenticated user of any role could omit the student filter and receive
  every grade/attendance record in the tenant.
- academic/students.py::list_students and ::get_student had no ownership
  scoping at all — PARENT (students:read) could list/read every student in
  the tenant, not just their own children. ALUMNI held students:read too,
  with no frontend consumer and no legitimate use — removed entirely.
- academic/grades.py::list_grades already scoped STUDENT/PARENT, but a
  pre-existing gap let ALUMNI (holds grades:read for their own report
  card) fall through to the unfiltered branch — fixed by folding ALUMNI
  into the same scoping helper. ::get_grade and ::get_student_average
  (single-record routes) had no scoping at all.
- academic/homework.py::get_homework returned every student's submission
  (content/grade/feedback) for a homework id regardless of caller.
- finance/payments.py::get_payment_receipt and
  finance/payment_schedules.py::get_payment_schedule fetched by id +
  tenant_id only — a PARENT could read another family's receipt or
  installment schedule by guessing/enumerating an id, unlike the sibling
  invoices-list endpoint which already scopes PARENT to their own
  children.

homework/homework_submissions and payment_schedules are raw-SQL
operational tables (app/core/operational_tables.py) — Postgres-only, same
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
from app.models.attendance import Attendance  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus, Payment, PaymentMethod, PaymentStatus  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from sqlalchemy import text  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="homework/homework_submissions/payment_schedules are raw-SQL "
           "operational tables whose DDL is Postgres-specific.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Ownership Test", slug=f"ownership-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@ownership-test.example",
            username=f"u-{user_id[:8]}", first_name="Test", last_name="User",
            password_hash="x", is_active=True,
        ))
        db.commit()
    return user_id


def _make_student(tenant_id: str, *, reg: str, user_id: str = None, status: str = "ACTIVE") -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"{reg}-{student_id[:8]}",
            first_name="Test", last_name="Élève",
            date_of_birth=date(2012, 1, 1), gender=Gender.MALE,
            status=StudentStatus(status), user_id=user_id,
        ))
        db.commit()
    return student_id


def _link_parent(tenant_id: str, parent_id: str, student_id: str) -> None:
    with SessionLocal() as db:
        db.add(ParentStudent(
            id=str(uuid.uuid4()), tenant_id=tenant_id, parent_id=parent_id,
            student_id=student_id, is_primary=True,
        ))
        db.commit()


def _make_grade(tenant_id: str, student_id: str, *, score: float = 15.0) -> str:
    grade_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Grade(
            id=grade_id, tenant_id=tenant_id, student_id=student_id,
            score=score, max_score=20.0, coefficient=1.0,
        ))
        db.commit()
    return grade_id


def _make_attendance(tenant_id: str, student_id: str, *, status: str = "ABSENT") -> str:
    att_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Attendance(
            id=att_id, tenant_id=tenant_id, student_id=student_id,
            date=date(2026, 9, 1), status=status, reason="Confidentiel",
        ))
        db.commit()
    return att_id


def _make_invoice(tenant_id: str, student_id: str) -> str:
    invoice_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Invoice(
            id=invoice_id, tenant_id=tenant_id, student_id=student_id,
            invoice_number=f"INV-{invoice_id[:8]}", issue_date=date(2026, 9, 1),
            due_date=date(2026, 10, 1), subtotal=500000, total_amount=500000,
            status=InvoiceStatus.PENDING,
        ))
        db.commit()
    return invoice_id


def _make_payment(tenant_id: str, student_id: str) -> str:
    payment_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Payment(
            id=payment_id, tenant_id=tenant_id, student_id=student_id,
            amount=100000, currency="GNF", payment_date=date(2026, 9, 5),
            payment_method=PaymentMethod.CASH, status=PaymentStatus.COMPLETED,
            reference=f"REC-{payment_id[:8]}",
        ))
        db.commit()
    return payment_id


def _make_payment_schedule(tenant_id: str, invoice_id: str) -> str:
    schedule_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO payment_schedules (id, tenant_id, invoice_id, installment_number, amount, due_date, status)
            VALUES (:id, :tid, :inv, 1, 250000, '2026-10-01', 'PENDING')
        """), {"id": schedule_id, "tid": tenant_id, "inv": invoice_id})
        db.commit()
    return schedule_id


def _make_homework(tenant_id: str) -> str:
    homework_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO homework (id, tenant_id, title, status)
            VALUES (:id, :tid, 'Devoir de maths', 'ACTIVE')
        """), {"id": homework_id, "tid": tenant_id})
        db.commit()
    return homework_id


def _make_submission(tenant_id: str, homework_id: str, student_id: str, *, content: str) -> str:
    submission_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO homework_submissions (id, tenant_id, homework_id, student_id, content)
            VALUES (:id, :tid, :hid, :sid, :content)
        """), {"id": submission_id, "tid": tenant_id, "hid": homework_id, "sid": student_id, "content": content})
        db.commit()
    return submission_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@requires_postgres
class TestSchoolLifeGradesAttendanceNowRequirePermission:
    def test_role_without_grades_read_is_rejected(self):
        """Regression guard: previously Depends(get_current_user) only —
        any authenticated user, whatever their role, could call this."""
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": [], "tenant_id": tenant_id}).get(
            "/api/v1/school-life/grades/", headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text

    def test_student_sees_only_their_own_grades(self):
        tenant_id = _make_tenant()
        student_user = _make_user(tenant_id)
        my_student = _make_student(tenant_id, reg="G-1", user_id=student_user)
        other_student = _make_student(tenant_id, reg="G-2")
        _make_grade(tenant_id, my_student, score=18.0)
        _make_grade(tenant_id, other_student, score=5.0)

        resp = _as({"id": student_user, "roles": ["STUDENT"], "tenant_id": tenant_id}).get(
            "/api/v1/school-life/grades/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        grades = resp.json()
        assert len(grades) == 1
        assert grades[0]["student_id"] == my_student

    def test_role_without_attendance_read_is_rejected(self):
        tenant_id = _make_tenant()
        resp = _as({"id": str(uuid.uuid4()), "roles": [], "tenant_id": tenant_id}).get(
            "/api/v1/school-life/attendance/", headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text

    def test_parent_sees_only_their_childs_attendance(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        my_child = _make_student(tenant_id, reg="A-1")
        _link_parent(tenant_id, parent_id, my_child)
        other_child = _make_student(tenant_id, reg="A-2")
        _make_attendance(tenant_id, my_child, status="ABSENT")
        _make_attendance(tenant_id, other_child, status="LATE")

        resp = _as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}).get(
            "/api/v1/school-life/attendance/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        records = resp.json()
        assert len(records) == 1
        assert records[0]["student_id"] == my_child


@requires_postgres
class TestStudentsOwnershipScoping:
    def test_parent_lists_only_their_own_children(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        my_child = _make_student(tenant_id, reg="S-1")
        _link_parent(tenant_id, parent_id, my_child)
        other_student = _make_student(tenant_id, reg="S-2")

        resp = _as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}).get(
            "/api/v1/students/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        ids = {item["id"] for item in body["items"]}
        assert ids == {my_child}, "must never include a student outside the parent's own children"

    def test_parent_cannot_fetch_another_students_profile_by_id(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        my_child = _make_student(tenant_id, reg="S-3")
        _link_parent(tenant_id, parent_id, my_child)
        other_student = _make_student(tenant_id, reg="S-4")

        headers = _as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id})
        own = headers.get(f"/api/v1/students/{my_child}/", headers=HEADERS)
        assert own.status_code == 200, own.text

        other = headers.get(f"/api/v1/students/{other_student}/", headers=HEADERS)
        assert other.status_code == 404, other.text

    def test_alumni_has_no_students_read_access_at_all(self):
        """SECURITY FIX: ALUMNI held students:read with no ownership scoping
        and no frontend consumer — removed entirely."""
        tenant_id = _make_tenant()
        _make_student(tenant_id, reg="S-5")
        resp = _as({"id": str(uuid.uuid4()), "roles": ["ALUMNI"], "tenant_id": tenant_id}).get(
            "/api/v1/students/", headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text


@requires_postgres
class TestGradesByIdOwnershipScoping:
    def test_student_cannot_fetch_another_students_grade_by_id(self):
        tenant_id = _make_tenant()
        student_user = _make_user(tenant_id)
        me = _make_student(tenant_id, reg="GB-1", user_id=student_user)
        other = _make_student(tenant_id, reg="GB-2")
        my_grade = _make_grade(tenant_id, me)
        other_grade = _make_grade(tenant_id, other)

        headers = _as({"id": student_user, "roles": ["STUDENT"], "tenant_id": tenant_id})
        mine = headers.get(f"/api/v1/grades/{my_grade}/", headers=HEADERS)
        assert mine.status_code == 200, mine.text

        theirs = headers.get(f"/api/v1/grades/{other_grade}/", headers=HEADERS)
        assert theirs.status_code == 404, theirs.text

    def test_student_cannot_fetch_another_students_average(self):
        tenant_id = _make_tenant()
        student_user = _make_user(tenant_id)
        me = _make_student(tenant_id, reg="GB-3", user_id=student_user)
        other = _make_student(tenant_id, reg="GB-4")

        resp = _as({"id": student_user, "roles": ["STUDENT"], "tenant_id": tenant_id}).get(
            f"/api/v1/grades/student/{other}/average/", headers=HEADERS,
        )
        assert resp.status_code == 404, resp.text

    def test_alumni_sees_only_their_own_historical_grades_via_list(self):
        """Pre-existing gap: ALUMNI (grades:read for their own report card)
        wasn't in the privileged bypass set NOR the self-scope set in
        list_grades, so it fell through to the unfiltered query."""
        tenant_id = _make_tenant()
        alumni_user = _make_user(tenant_id)
        my_record = _make_student(tenant_id, reg="GB-5", user_id=alumni_user, status="GRADUATED")
        other_student = _make_student(tenant_id, reg="GB-6")
        _make_grade(tenant_id, my_record, score=17.0)
        _make_grade(tenant_id, other_student, score=9.0)

        resp = _as({"id": alumni_user, "roles": ["ALUMNI"], "tenant_id": tenant_id}).get(
            "/api/v1/grades/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["student_id"] == my_record


@requires_postgres
class TestHomeworkSubmissionsOwnershipScoping:
    def test_student_sees_only_their_own_submission(self):
        tenant_id = _make_tenant()
        homework_id = _make_homework(tenant_id)
        student_user = _make_user(tenant_id)
        me = _make_student(tenant_id, reg="H-1", user_id=student_user)
        other = _make_student(tenant_id, reg="H-2")
        _make_submission(tenant_id, homework_id, me, content="Ma réponse")
        _make_submission(tenant_id, homework_id, other, content="Réponse confidentielle d'un autre élève")

        resp = _as({"id": student_user, "roles": ["STUDENT"], "tenant_id": tenant_id}).get(
            f"/api/v1/homework/{homework_id}/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        submissions = resp.json()["submissions"]
        assert len(submissions) == 1
        assert submissions[0]["student_id"] == me
        assert submissions[0]["content"] == "Ma réponse"

    def test_parent_with_no_child_submission_sees_empty_list_not_others(self):
        tenant_id = _make_tenant()
        homework_id = _make_homework(tenant_id)
        parent_id = _make_user(tenant_id)
        my_child = _make_student(tenant_id, reg="H-3")
        _link_parent(tenant_id, parent_id, my_child)
        other_student = _make_student(tenant_id, reg="H-4")
        _make_submission(tenant_id, homework_id, other_student, content="Pas pour ce parent")

        resp = _as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}).get(
            f"/api/v1/homework/{homework_id}/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["submissions"] == []


@requires_postgres
class TestPaymentsOwnershipScoping:
    def test_parent_cannot_read_another_familys_receipt(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        my_child = _make_student(tenant_id, reg="PAY-1")
        _link_parent(tenant_id, parent_id, my_child)
        other_child = _make_student(tenant_id, reg="PAY-2")
        my_payment = _make_payment(tenant_id, my_child)
        other_payment = _make_payment(tenant_id, other_child)

        headers = _as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id})
        mine = headers.get(f"/api/v1/payments/{my_payment}/receipt/", headers=HEADERS)
        assert mine.status_code == 200, mine.text

        theirs = headers.get(f"/api/v1/payments/{other_payment}/receipt/", headers=HEADERS)
        assert theirs.status_code == 404, theirs.text

    def test_parent_cannot_read_another_familys_payment_schedule(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        my_child = _make_student(tenant_id, reg="PAY-3")
        _link_parent(tenant_id, parent_id, my_child)
        other_child = _make_student(tenant_id, reg="PAY-4")
        my_invoice = _make_invoice(tenant_id, my_child)
        other_invoice = _make_invoice(tenant_id, other_child)
        my_schedule = _make_payment_schedule(tenant_id, my_invoice)
        other_schedule = _make_payment_schedule(tenant_id, other_invoice)

        headers = _as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id})
        mine = headers.get(f"/api/v1/payment-schedules/{my_schedule}", headers=HEADERS)
        assert mine.status_code == 200, mine.text

        theirs = headers.get(f"/api/v1/payment-schedules/{other_schedule}", headers=HEADERS)
        assert theirs.status_code == 404, theirs.text
