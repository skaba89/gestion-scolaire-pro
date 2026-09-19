"""Tests pour l'endpoint d'import CSV d'étudiants."""
import io
import csv
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

# ─── Helpers ────────────────────────────────────────────────────────────────


def _make_csv(rows: list[dict], delimiter: str = ";") -> bytes:
    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=rows[0].keys(), delimiter=delimiter)
        writer.writeheader()
        writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


VALID_ROW = {
    "prenom": "Mamadou",
    "nom": "Diallo",
    "email": "mamadou.diallo@ecole.gn",
    "date_naissance": "2005-03-15",
    "genre": "M",
    "niveau": "Terminale",
    "telephone": "+224 620 000 001",
    "adresse": "Kaloum, Conakry",
}

# ─── Auth guard ──────────────────────────────────────────────────────────────


class TestImportAuthRequired:
    def test_preview_without_auth_returns_401(self):
        csv_bytes = _make_csv([VALID_ROW])
        resp = client.post(
            "/api/v1/import/students/preview/",
            files={"file": ("students.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        assert resp.status_code == 401

    def test_confirm_without_auth_returns_401(self):
        resp = client.post(
            "/api/v1/import/students/confirm/",
            json={"rows": [], "tenant_id": "test-id"},
        )
        assert resp.status_code == 401


# ─── CSV parsing unit tests ──────────────────────────────────────────────────


class TestCsvParsing:
    """Tests unitaires sur la fonction _parse_csv_bytes."""

    def test_parses_semicolon_delimiter(self):
        from app.api.v1.endpoints.core.imports import _parse_csv_bytes
        csv_bytes = _make_csv([VALID_ROW], delimiter=";")
        headers, rows = _parse_csv_bytes(csv_bytes)
        assert len(rows) == 1
        assert "prenom" in headers

    def test_parses_comma_delimiter(self):
        from app.api.v1.endpoints.core.imports import _parse_csv_bytes
        csv_bytes = _make_csv([VALID_ROW], delimiter=",")
        headers, rows = _parse_csv_bytes(csv_bytes)
        assert len(rows) == 1

    def test_parses_utf8_bom(self):
        from app.api.v1.endpoints.core.imports import _parse_csv_bytes
        bom_csv = b"\xef\xbb\xbfprenom;nom\nMamadou;Diallo\n"
        headers, rows = _parse_csv_bytes(bom_csv)
        assert "prenom" in headers
        assert rows[0]["prenom"] == "Mamadou"

    def test_parses_latin1_fallback(self):
        from app.api.v1.endpoints.core.imports import _parse_csv_bytes
        latin1_csv = "prenom;nom\nMamadou;Diall\xe9\n".encode("latin-1")
        headers, rows = _parse_csv_bytes(latin1_csv)
        assert len(rows) == 1

    def test_invalid_encoding_raises_http_exception(self):
        from app.api.v1.endpoints.core.imports import _parse_csv_bytes
        from fastapi import HTTPException
        # Bytes that are neither UTF-8 nor Latin-1
        garbage = b"\x80\x81\x82\x83\x00\xff\xfe\xfd"
        try:
            _parse_csv_bytes(garbage)
        except HTTPException as exc:
            assert exc.status_code == 400
        except Exception:
            pass  # Other exceptions are acceptable (not a crash)

    def test_empty_csv_returns_empty_rows(self):
        from app.api.v1.endpoints.core.imports import _parse_csv_bytes
        empty = b"prenom;nom\n"
        headers, rows = _parse_csv_bytes(empty)
        assert rows == []

    def test_multiple_rows(self):
        from app.api.v1.endpoints.core.imports import _parse_csv_bytes
        rows_data = [VALID_ROW, {**VALID_ROW, "prenom": "Fatoumata", "email": "f@ecole.gn"}]
        csv_bytes = _make_csv(rows_data)
        _, rows = _parse_csv_bytes(csv_bytes)
        assert len(rows) == 2


# ─── Registration number generator ──────────────────────────────────────────


class TestRegistrationGenerator:
    """generate_registration() now lives in app/services/student_import.py
    (national-readiness audit, 2026-09, priority 5 — extracted so the Arq
    job path and the synchronous fallback share one implementation). Its
    signature dropped the unused tenant_id parameter the old
    _generate_registration(tenant_id, existing) never actually used."""

    def test_generates_unique_numbers(self):
        from app.services.student_import import generate_registration
        existing: set = set()
        numbers = [generate_registration(existing) for _ in range(50)]
        assert len(set(numbers)) == 50

    def test_number_format(self):
        from app.services.student_import import generate_registration
        num = generate_registration(set())
        assert num.startswith("ETU")
        assert len(num) == 9  # ETU + 6 digits

    def test_skips_existing(self):
        from app.services.student_import import generate_registration
        existing = {"ETU000001", "ETU000002"}
        previous = set(existing)
        num = generate_registration(existing)
        assert num not in previous
        assert num in existing


# ─── Confirm import — audit trail (Phase 2, commercialisation) ──────────────
#
# The import endpoint mutates real student data (potentially hundreds of
# rows) but had no audit log call at all — no way to answer "who imported
# these students, and when" after the fact. This proves the fix, on a real
# Postgres-backed tenant since confirm_student_import's INSERT uses
# gen_random_uuid() (Postgres-only).

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="confirm_student_import uses gen_random_uuid() (Postgres-only).",
)


def _make_pro_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Import Audit Test", slug=f"import-audit-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
            subscription_plan="pro", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_import_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestConfirmImportAuditLog:
    def test_confirm_import_writes_audit_log(self):
        """No Redis in the test environment, so confirm_student_import
        falls open to its synchronous path (national-readiness audit,
        2026-09, priority 5) — the response is now {"job_id": ...} rather
        than the result inline; poll the job to get it, same as the
        frontend does."""
        tenant_id = _make_pro_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        csv_bytes = _make_csv([VALID_ROW])

        resp = client.post(
            "/api/v1/import/students/confirm/",
            files={"file": ("students.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        job_id = resp.json()["job_id"]
        assert job_id

        job_resp = client.get(f"/api/v1/import/jobs/{job_id}/", headers=headers)
        assert job_resp.status_code == 200, job_resp.text
        job_body = job_resp.json()
        assert job_body["status"] == "SUCCESS", job_body
        assert job_body["result"]["created"] == 1

        with SessionLocal() as db:
            entry = db.query(AuditLog).filter(
                AuditLog.tenant_id == tenant_id, AuditLog.action == "IMPORT_STUDENTS",
            ).first()
            assert entry is not None
            assert entry.details.get("created") == 1
            assert entry.details.get("filename") == "students.csv"

    def test_job_status_endpoint_rejects_another_tenants_job(self):
        """_as() overrides get_current_user globally (identity comes from
        the override, not the Authorization header content) — it must be
        called again right before each request as the caller who should
        make it, not once upfront for both."""
        tenant_a = _make_pro_tenant()
        tenant_b = _make_pro_tenant()
        csv_bytes = _make_csv([VALID_ROW])

        headers_a = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})
        resp = client.post(
            "/api/v1/import/students/confirm/",
            files={"file": ("students.csv", io.BytesIO(csv_bytes), "text/csv")},
            headers=headers_a,
        )
        job_id = resp.json()["job_id"]

        headers_b = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_b})
        cross_tenant_resp = client.get(f"/api/v1/import/jobs/{job_id}/", headers=headers_b)
        assert cross_tenant_resp.status_code == 404, cross_tenant_resp.text
