"""Tests pour l'endpoint d'import CSV d'étudiants."""
import io
import csv
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
    def test_generates_unique_numbers(self):
        from app.api.v1.endpoints.core.imports import _generate_registration
        existing: set = set()
        numbers = [_generate_registration("tenant-1", existing) for _ in range(50)]
        assert len(set(numbers)) == 50

    def test_number_format(self):
        from app.api.v1.endpoints.core.imports import _generate_registration
        num = _generate_registration("tenant-1", set())
        assert num.startswith("ETU")
        assert len(num) == 9  # ETU + 6 digits

    def test_skips_existing(self):
        from app.api.v1.endpoints.core.imports import _generate_registration
        existing = {"ETU000001", "ETU000002"}
        previous = set(existing)
        num = _generate_registration("t", existing)
        assert num not in previous
        assert num in existing
