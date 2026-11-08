"""Official enrollment certificates require a current, tenant-safe school enrollment."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints.operational import school_life as api


def _request():
    return Request({
        "type": "http", "method": "POST",
        "path": "/school-life/generate-certificate/pdf/",
        "headers": [], "query_string": b"",
        "scheme": "http", "server": ("testserver", 80),
        "client": ("127.0.0.1", 10000),
    })


def test_current_enrollment_requires_active_same_tenant_class_and_year():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.first.return_value = {
        "class_name": "Première", "level_name": "Lycée", "year_name": "2026-2027",
    }
    student, tenant = str(uuid4()), str(uuid4())
    result = api._fetch_current_enrollment(db, student, tenant)
    assert result["class_name"] == "Première"
    statement, params = db.execute.call_args.args
    sql = str(statement)
    assert "c.tenant_id = e.tenant_id" in sql
    assert "ay.tenant_id = e.tenant_id" in sql
    assert "l.tenant_id = e.tenant_id" in sql
    assert "c.academic_year_id = e.academic_year_id" in sql
    assert "e.status = 'ACTIVE'" in sql
    assert "ay.is_current = true" in sql
    assert params == {"sid": student, "tid": tenant}


def test_certificate_denied_when_no_current_active_enrollment():
    student, tenant = str(uuid4()), str(uuid4())
    db = MagicMock()
    with patch.object(api, "resolve_current_tenant_id", return_value=tenant), \
         patch.object(api, "_authorize_report_card_access"), \
         patch.object(api, "_authorize_certificate_teacher_scope"), \
         patch.object(api, "_fetch_student_data", return_value={
             "student": {"first_name": "Aminata", "last_name": "Bah"},
             "tenant": {"name": "Lycée"},
         }), \
         patch.object(api, "_fetch_current_enrollment", return_value=None), \
         patch.object(api, "_build_certificate_html") as render:
        with pytest.raises(HTTPException) as denied:
            api.generate_certificate_pdf(
                _request(), api.CertificateRequest(student_id=student), db,
                {"id": str(uuid4()), "roles": ["DIRECTOR"]},
            )
    assert denied.value.status_code == 404
    render.assert_not_called()


def test_current_enrollment_absent_returns_none():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.first.return_value = None
    assert api._fetch_current_enrollment(db, str(uuid4()), str(uuid4())) is None
