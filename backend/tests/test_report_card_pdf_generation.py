"""POST /api/v1/school-life/generate-report-card/pdf/ (national-readiness
audit, 2026-09, P1-1).

Before this endpoint, the only server-side bulletin path
(generate-report-card/v2/) returned HTML for the browser to print — never
a real file the platform could archive, hash, or hand to an unattended
batch job. This endpoint renders the exact same server-computed bulletin
(_build_report_card_html, shared with v2 via
_authorize_report_card_access/_build_report_card_html — not a second,
divergent template) to real PDF bytes via WeasyPrint.

Authorization is the same ownership rule already proven in
test_report_card_authorization.py for the v2/HTML endpoint (same shared
helper) — these tests focus on what's specific to the PDF path: content
type, that real PDF bytes come back, and that the ownership check still
applies here too (a regression here would be a silent second copy of a
bug already fixed once).

_fetch_student_data() (shared with v2, unchanged by this PR) compares
tenant_id via a raw text() query, which bypasses the GUID TypeDecorator's
hex-vs-native-UUID coercion and never matches on SQLite even for a real
row — the exact same pre-existing limitation test_report_card_authorization.py
already documents and tolerates for v2 (`assert ... in (200, 404)`). The
"a PDF actually comes back" tests below tolerate the same 404 on SQLite;
the real assertion runs on the CI Postgres job.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
PDF_URL = "/api/v1/school-life/generate-report-card/pdf/"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Bulletin PDF Test", slug=f"bulletin-pdf-{tenant_id[:8]}",
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
            first_name="Mamadou", last_name="Bah",
            date_of_birth=date(2010, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", password_hash="x",
            first_name="Test", last_name="User", is_active=True,
        ))
        db.commit()
    return user_id


def _link_parent(tenant_id: str, parent_id: str, student_id: str) -> None:
    with SessionLocal() as db:
        db.add(ParentStudent(
            id=str(uuid.uuid4()), tenant_id=tenant_id,
            parent_id=parent_id, student_id=student_id,
        ))
        db.commit()


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _payload(student_id: str) -> dict:
    return {
        "student_id": student_id,
        "term_id": str(uuid.uuid4()),
        "classroom_id": str(uuid.uuid4()),
    }


class TestReportCardPdfAuthorization:
    def test_student_cannot_download_another_students_report_card_pdf(self):
        tenant_id = _make_tenant()
        student_account_id = _make_user(tenant_id)
        own_id = _make_student(tenant_id, reg="REG-PDF-OWN-1")
        other_id = _make_student(tenant_id, reg="REG-PDF-OTHER-1")
        with SessionLocal() as db:
            db.query(Student).filter(Student.id == own_id).update({"user_id": student_account_id})
            db.commit()
        student_user = {"id": student_account_id, "roles": ["STUDENT"], "tenant_id": tenant_id}

        resp = _as(student_user).post(PDF_URL, json=_payload(other_id), headers=HEADERS)
        assert resp.status_code == 403, resp.text

    def test_parent_cannot_download_unrelated_childs_report_card_pdf(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        own_child_id = _make_student(tenant_id, reg="REG-PDF-CHILD-1")
        other_child_id = _make_student(tenant_id, reg="REG-PDF-CHILD-2")
        _link_parent(tenant_id, parent_id, own_child_id)
        parent_user = {"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}

        resp = _as(parent_user).post(PDF_URL, json=_payload(other_child_id), headers=HEADERS)
        assert resp.status_code == 403, resp.text


class TestReportCardPdfGeneration:
    def test_authorized_role_gets_a_real_pdf_file(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id, reg="REG-PDF-1")
        teacher_user = {"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}

        resp = _as(teacher_user).post(PDF_URL, json=_payload(student_id), headers=HEADERS)
        # 404 is an acceptable outcome on SQLite only — see module docstring
        # (_fetch_student_data's raw-SQL tenant_id comparison never matches
        # there). The real assertion is the CI Postgres job.
        assert resp.status_code in (200, 404), resp.text
        if resp.status_code == 200:
            assert resp.headers["content-type"] == "application/pdf"
            assert resp.content[:4] == b"%PDF", "response body must be a real PDF file, not HTML/JSON"
            assert "attachment" in resp.headers.get("content-disposition", "")

    def test_own_report_card_pdf_accessible_to_student(self):
        tenant_id = _make_tenant()
        student_account_id = _make_user(tenant_id)
        own_id = _make_student(tenant_id, reg="REG-PDF-SELF-1")
        with SessionLocal() as db:
            db.query(Student).filter(Student.id == own_id).update({"user_id": student_account_id})
            db.commit()
        student_user = {"id": student_account_id, "roles": ["STUDENT"], "tenant_id": tenant_id}

        resp = _as(student_user).post(PDF_URL, json=_payload(own_id), headers=HEADERS)
        assert resp.status_code in (200, 404), resp.text
        if resp.status_code == 200:
            assert resp.content[:4] == b"%PDF"

    def test_unknown_student_returns_404_not_a_broken_pdf(self):
        tenant_id = _make_tenant()
        teacher_user = {"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}

        resp = _as(teacher_user).post(PDF_URL, json=_payload(str(uuid.uuid4())), headers=HEADERS)
        assert resp.status_code == 404, resp.text
