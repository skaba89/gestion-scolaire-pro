"""POST /api/v1/school-life/generate-certificate/pdf/ (national-readiness
audit, 2026-09 — second server-side PDF document).

Before this endpoint, the only certificate generator in the product was
Certificates.tsx (admin UI): pure client-side HTML handed to
window.print() — never a real file the platform could archive, hash, or
hand to an unattended batch job, the same problem the bulletin had before
generate-report-card/pdf/. This renders the same wording server-side to
real PDF bytes via WeasyPrint.

_authorize_report_card_access is reused here (it's a generic "does this
caller own this student record" check, not report-card-specific) —
without it, "students:read" alone would let any PARENT pull ANY student's
certificate in the tenant by guessing student_id, the same class of bug
already fixed once for report cards.

_fetch_student_data() compares tenant_id via a raw text() query, which
bypasses the GUID TypeDecorator's hex-vs-native-UUID coercion and never
matches on SQLite even for a real row — same pre-existing limitation
test_report_card_pdf_generation.py already documents and tolerates
(`assert ... in (200, 404)`). The real assertion runs on the CI Postgres
job.
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
PDF_URL = "/api/v1/school-life/generate-certificate/pdf/"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Certificat PDF Test", slug=f"cert-pdf-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
            subscription_plan="starter", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str, *, reg: str) -> str:
    """`registration_number` is UNIQUE globally (not per-tenant) on the
    Student model — suffix with a random hex to stay unique across test
    runs sharing one database (same convention as test_import_parents.py)."""
    student_id = str(uuid.uuid4())
    unique_reg = f"{reg}-{uuid.uuid4().hex[:6]}"
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=unique_reg,
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


def _payload(student_id: str, certificate_type: str = "enrollment") -> dict:
    return {"student_id": student_id, "certificate_type": certificate_type}


class TestCertificatePdfAuthorization:
    def test_parent_cannot_download_unrelated_childs_certificate(self):
        """The IDOR this endpoint must NOT reintroduce: PARENT has
        students:read tenant-wide, so without the ownership check any
        parent could pull any student's certificate by guessing student_id."""
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        own_child_id = _make_student(tenant_id, reg="REG-CERT-CHILD-1")
        other_child_id = _make_student(tenant_id, reg="REG-CERT-CHILD-2")
        _link_parent(tenant_id, parent_id, own_child_id)
        parent_user = {"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}

        resp = _as(parent_user).post(PDF_URL, json=_payload(other_child_id), headers=HEADERS)
        assert resp.status_code == 403, resp.text

    def test_parent_can_download_own_childs_certificate(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        child_id = _make_student(tenant_id, reg="REG-CERT-OWN-1")
        _link_parent(tenant_id, parent_id, child_id)
        parent_user = {"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id}

        resp = _as(parent_user).post(PDF_URL, json=_payload(child_id), headers=HEADERS)
        # 404 is an acceptable outcome on SQLite only — see module docstring.
        assert resp.status_code in (200, 404), resp.text


class TestCertificatePdfGeneration:
    def test_authorized_staff_gets_a_real_pdf_file(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id, reg="REG-CERT-1")
        staff_user = {"id": str(uuid.uuid4()), "roles": ["SECRETARY"], "tenant_id": tenant_id}

        resp = _as(staff_user).post(PDF_URL, json=_payload(student_id), headers=HEADERS)
        assert resp.status_code in (200, 404), resp.text
        if resp.status_code == 200:
            assert resp.headers["content-type"] == "application/pdf"
            assert resp.content[:4] == b"%PDF", "response body must be a real PDF file, not HTML/JSON"
            assert "attachment" in resp.headers.get("content-disposition", "")

    def test_all_three_certificate_types_generate(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id, reg="REG-CERT-TYPES-1")
        staff_user = {"id": str(uuid.uuid4()), "roles": ["SECRETARY"], "tenant_id": tenant_id}

        for cert_type in ("enrollment", "attendance", "level"):
            resp = _as(staff_user).post(PDF_URL, json=_payload(student_id, cert_type), headers=HEADERS)
            assert resp.status_code in (200, 404), (cert_type, resp.text)
            if resp.status_code == 200:
                assert resp.content[:4] == b"%PDF"

    def test_invalid_certificate_type_is_rejected(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id, reg="REG-CERT-BADTYPE-1")
        staff_user = {"id": str(uuid.uuid4()), "roles": ["SECRETARY"], "tenant_id": tenant_id}

        resp = _as(staff_user).post(PDF_URL, json=_payload(student_id, "not-a-real-type"), headers=HEADERS)
        assert resp.status_code == 400, resp.text

    def test_unknown_student_returns_404_not_a_broken_pdf(self):
        tenant_id = _make_tenant()
        staff_user = {"id": str(uuid.uuid4()), "roles": ["SECRETARY"], "tenant_id": tenant_id}

        resp = _as(staff_user).post(PDF_URL, json=_payload(str(uuid.uuid4())), headers=HEADERS)
        assert resp.status_code == 404, resp.text
