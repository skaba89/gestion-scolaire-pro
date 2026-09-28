"""generate-report-card/pdf/ and generate-certificate/pdf/ — 10th
systematic audit sweep, SSRF via tenant-admin-controlled logo/signature
image URLs embedded in server-rendered PDFs.

Tenant.settings["logoUrl"] and Tenant.director_signature_url /
secretary_signature_url are writable by any TENANT_ADMIN (see
core/tenants.py::update_tenant ALLOWED_FIELDS_ADMIN) and were embedded
unvalidated as <img src="..."> in the HTML that WeasyPrint renders to
PDF. WeasyPrint fetches every such remote resource server-side during
rendering, so a malicious value (e.g. pointing at cloud metadata or an
internal service) was a blind SSRF vector reachable by any tenant admin
issuing a bulletin/certificate for one of their own students.

Fixed by passing a URLFetcher that SSRF-checks every resource
(get_weasyprint_safe_url_fetcher, app/core/ssrf_protection.py) to both
WeasyPrint HTML(...) calls. These tests prove the checker is actually
wired in and invoked at both endpoints' real rendering call site (not
just correct in isolation, already covered by
test_ssrf_protection_2026_09_28.py) by spying on
assert_safe_external_url with a wraps=<real function> mock: it must be
called with the tenant's malicious logoUrl during a real PDF render.
Without the fix, HTML() is never given a url_fetcher at all, so the spy
would never be called — proving this genuinely exercises the wiring, not
just the helper.

Same "404 on SQLite only" pre-existing limitation as
test_report_card_pdf_generation.py / test_certificate_pdf_generation.py
(_fetch_student_data's raw-SQL tenant_id comparison never matches there)
— tolerated the same way; the real assertion runs on the CI Postgres job.
"""
import uuid
from datetime import date
from unittest.mock import patch

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core import ssrf_protection  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
REPORT_CARD_PDF_URL = "/api/v1/school-life/generate-report-card/pdf/"
CERTIFICATE_PDF_URL = "/api/v1/school-life/generate-certificate/pdf/"

MALICIOUS_LOGO_URL = "http://169.254.169.254/latest/meta-data/iam/security-credentials/"


def _make_tenant_with_malicious_logo() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École PDF SSRF Test", slug=f"pdf-ssrf-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True,
            settings={"logoUrl": MALICIOUS_LOGO_URL},
            director_signature_url=MALICIOUS_LOGO_URL,
            secretary_signature_url=MALICIOUS_LOGO_URL,
            subscription_plan="starter", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str, *, reg: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"{reg}-{uuid.uuid4().hex[:6]}",
            first_name="Mamadou", last_name="Bah",
            date_of_birth=date(2010, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestReportCardPdfChecksLogoUrlBeforeFetching:
    def test_malicious_logo_url_is_passed_through_the_ssrf_guard(self):
        tenant_id = _make_tenant_with_malicious_logo()
        student_id = _make_student(tenant_id, reg="REG-PDF-SSRF-1")
        teacher_user = {"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}
        payload = {
            "student_id": student_id,
            "term_id": str(uuid.uuid4()),
            "classroom_id": str(uuid.uuid4()),
        }

        with patch.object(
            ssrf_protection, "assert_safe_external_url",
            wraps=ssrf_protection.assert_safe_external_url,
        ) as spy:
            resp = _as(teacher_user).post(REPORT_CARD_PDF_URL, json=payload, headers=HEADERS)

        # 404 is an acceptable outcome on SQLite only — see module
        # docstring. When the endpoint does reach PDF rendering, the SSRF
        # guard must have been consulted with the malicious logoUrl —
        # that's the actual proof the fix is wired in at this call site.
        assert resp.status_code in (200, 404), resp.text
        if resp.status_code == 200:
            assert resp.content[:4] == b"%PDF"
            called_urls = [c.args[0] for c in spy.call_args_list]
            assert MALICIOUS_LOGO_URL in called_urls


class TestCertificatePdfChecksLogoAndSignatureUrlsBeforeFetching:
    def test_malicious_logo_and_signature_urls_are_passed_through_the_ssrf_guard(self):
        tenant_id = _make_tenant_with_malicious_logo()
        student_id = _make_student(tenant_id, reg="REG-CERT-SSRF-1")
        staff_user = {"id": str(uuid.uuid4()), "roles": ["SECRETARY"], "tenant_id": tenant_id}
        payload = {"student_id": student_id, "certificate_type": "enrollment"}

        with patch.object(
            ssrf_protection, "assert_safe_external_url",
            wraps=ssrf_protection.assert_safe_external_url,
        ) as spy:
            resp = _as(staff_user).post(CERTIFICATE_PDF_URL, json=payload, headers=HEADERS)

        assert resp.status_code in (200, 404), resp.text
        if resp.status_code == 200:
            assert resp.content[:4] == b"%PDF"
            called_urls = [c.args[0] for c in spy.call_args_list]
            assert MALICIOUS_LOGO_URL in called_urls
