"""POST/PUT /department-portal/exams/ (operational/departments.py) —
institutional-readiness audit, 2026-09.

Two bugs found together. (a) class_id/subject_id/term_id were inserted
verbatim with no check they even belong to the caller's tenant, let alone
(for class_id) the caller's own department — any department head/member
could attach an exam to another department's classroom or a cross-tenant
UUID. (b) the `exams` table as migrated only has
title/subject_id/classroom_id/academic_year_id/exam_date/max_score — none
of name/department_id/class_id/term_id/room_name/status/start_time/
end_time/created_by that this router's INSERT/UPDATE/SELECT reference, so
every call raised UndefinedColumn on real Postgres; fixed by adding those
columns additively in app/core/operational_tables.py, same pattern as
incidents.assigned_to.

department_members/exams are raw-SQL operational tables — Postgres-only,
same pattern as test_message_reactions_authorization.py."""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.associations import classroom_departments  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.department import Department  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.term import Term  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="department_members/exams are raw-SQL operational tables whose "
           "DDL is Postgres-specific and never created on SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

BASE = "/api/v1/department-portal/exams"


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Département Examens Test", slug=f"dept-exam-{tenant_id[:8]}",
            type="secondary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_department_head(tenant_id: str) -> tuple:
    """Returns (head_user_id, department_id), and registers the head as
    the department's own department_members row too (matches
    _get_user_department's dual lookup)."""
    head_id = str(uuid.uuid4())
    dept_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=head_id, tenant_id=tenant_id, email=f"{head_id[:8]}@example.com",
            username=f"head-{head_id[:8]}", is_active=True,
        ))
        db.commit()
        db.add(Department(id=dept_id, tenant_id=tenant_id, name="Sciences", head_id=head_id))
        db.commit()
    return head_id, dept_id


def _make_classroom(tenant_id: str, department_id: str | None = None, name: str = "6eme A") -> str:
    classroom_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Classroom(id=classroom_id, tenant_id=tenant_id, name=name))
        db.commit()
        if department_id:
            db.execute(classroom_departments.insert().values(
                tenant_id=tenant_id, class_id=classroom_id, department_id=department_id,
            ))
            db.commit()
    return classroom_id


def _make_subject(tenant_id: str, name: str = "Mathématiques") -> str:
    subject_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name=name))
        db.commit()
    return subject_id


def _make_term(tenant_id: str) -> str:
    term_id = str(uuid.uuid4())
    year_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(AcademicYear(
            id=year_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
            start_date=date(2026, 9, 1), end_date=date(2027, 7, 1),
        ))
        db.commit()
        db.add(Term(
            id=term_id, tenant_id=tenant_id, academic_year_id=year_id, name="Trimestre 1",
            start_date=date(2026, 9, 1), end_date=date(2026, 12, 1),
        ))
        db.commit()
    return term_id


def _valid_payload(subject_id: str, term_id: str, class_id: str | None = None) -> dict:
    return {
        "name": "Examen final", "exam_date": "2026-12-15",
        "subject_id": subject_id, "term_id": term_id, "class_id": class_id,
    }


class TestCreateExamValidatesForeignKeys:
    def test_class_from_another_department_is_rejected(self):
        tenant_id = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_id)
        other_dept_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Department(id=other_dept_id, tenant_id=tenant_id, name="Lettres"))
            db.commit()
        foreign_class_id = _make_classroom(tenant_id, department_id=other_dept_id, name="Autre classe")
        subject_id = _make_subject(tenant_id)
        term_id = _make_term(tenant_id)
        headers = _as({"id": head_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/", json=_valid_payload(subject_id, term_id, foreign_class_id), headers=headers)
        assert resp.status_code == 404, resp.text

    def test_subject_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_a)
        foreign_subject_id = _make_subject(tenant_b)
        term_id = _make_term(tenant_a)
        headers = _as({"id": head_id, "roles": ["TEACHER"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/", json=_valid_payload(foreign_subject_id, term_id), headers=headers)
        assert resp.status_code == 404, resp.text

    def test_term_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_a)
        subject_id = _make_subject(tenant_a)
        foreign_term_id = _make_term(tenant_b)
        headers = _as({"id": head_id, "roles": ["TEACHER"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/", json=_valid_payload(subject_id, foreign_term_id), headers=headers)
        assert resp.status_code == 404, resp.text

    def test_valid_exam_with_own_departments_classroom_is_created(self):
        tenant_id = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_id)
        class_id = _make_classroom(tenant_id, department_id=dept_id)
        subject_id = _make_subject(tenant_id)
        term_id = _make_term(tenant_id)
        headers = _as({"id": head_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/", json=_valid_payload(subject_id, term_id, class_id), headers=headers)
        assert resp.status_code == 201, resp.text

    def test_valid_exam_without_a_class_is_created(self):
        tenant_id = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_id)
        subject_id = _make_subject(tenant_id)
        term_id = _make_term(tenant_id)
        headers = _as({"id": head_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/", json=_valid_payload(subject_id, term_id), headers=headers)
        assert resp.status_code == 201, resp.text


class TestUpdateExamValidatesForeignKeys:
    def test_update_rejects_class_from_another_department(self):
        tenant_id = _make_tenant()
        head_id, dept_id = _make_department_head(tenant_id)
        subject_id = _make_subject(tenant_id)
        term_id = _make_term(tenant_id)
        headers = _as({"id": head_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        created = client.post(f"{BASE}/", json=_valid_payload(subject_id, term_id), headers=headers)
        assert created.status_code == 201, created.text
        exam_id = created.json()["id"]

        other_dept_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Department(id=other_dept_id, tenant_id=tenant_id, name="Lettres"))
            db.commit()
        foreign_class_id = _make_classroom(tenant_id, department_id=other_dept_id, name="Autre classe")

        updated = client.put(f"{BASE}/{exam_id}/", json=_valid_payload(subject_id, term_id, foreign_class_id), headers=headers)
        assert updated.status_code == 404, updated.text
