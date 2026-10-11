"""Régression : imports CSV face à des données invalides (2026-10-11).

Trouvés en testant les imports avec des valeurs trop longues :

1. Élèves — la base acceptait un téléphone de 37 caractères que le schéma
   de lecture (max 20) refuse ensuite : GET /students/ répondait 500 pour
   tout l'établissement.
2. Enseignants / parents — une seule valeur trop longue faisait échouer
   l'INSERT, annulait la transaction PostgreSQL et donc TOUT le fichier,
   même avec « ignorer les erreurs ».
3. Sécurité — le message d'erreur renvoyé au client (HTTP 500 et statut
   du job) recopiait l'exception, requête SQL comprise.
"""
import uuid

import pytest
from conftest import get_test_client

from test_import_email_validation import (  # noqa: F401 — fixtures autouse
    STUDENT,
    _admin_headers,
    _clear_overrides,
    _confirm,
    _force_sync_fallback,
    _make_csv,
    _make_pro_tenant,
    postgres_only,
)

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.student_import import IMPORT_FAILED_MESSAGE, ROW_FAILED_MESSAGE  # noqa: E402

LONG_PHONE = "+224 620 00 00 01 / +224 655 00 00 02"  # 37 caractères, max 20
SQL_MARKERS = ("INSERT", "SELECT", "psycopg", "VARCHAR", "character varying")


def _assert_no_sql(text: str) -> None:
    for marker in SQL_MARKERS:
        assert marker not in text, f"détail SQL renvoyé au client : {marker!r}"


@postgres_only
class TestStudentImportInvalidData:
    def test_too_long_values_are_rejected_and_student_list_stays_up(self):
        tenant_id = _make_pro_tenant()
        headers = _admin_headers(tenant_id)
        s = uuid.uuid4().hex[:6]
        rows = [
            {**STUDENT, "matricule": f"A-{s}", "telephone": ""},
            {**STUDENT, "matricule": f"B-{s}", "telephone": LONG_PHONE},
            {**STUDENT, "matricule": f"C-{s}", "telephone": "", "prenom": "X" * 101},
            {**STUDENT, "matricule": f"D-{s}", "telephone": ""},
        ]

        result = _confirm("students", rows, headers)

        assert result["created"] == 2
        assert result["skipped"] == 2
        errors = [e["error"] for e in result["errors"]]
        assert any("phone trop long (37 caractères, max 20)" in e for e in errors)
        assert any("first_name trop long" in e for e in errors)

        listing = client.get("/api/v1/students/", headers=headers)
        assert listing.status_code == 200, listing.text
        assert sorted(x["registration_number"] for x in listing.json()["items"]) == [f"A-{s}", f"D-{s}"]

    def test_invalid_date_is_rejected_without_skip_errors(self):
        tenant_id = _make_pro_tenant()
        s = uuid.uuid4().hex[:6]
        rows = [{**STUDENT, "matricule": f"E-{s}", "date_naissance": "31/02/2005"}]

        result = _confirm("students", rows, _admin_headers(tenant_id))

        assert result["created"] == 0
        assert "Date naissance invalide" in result["errors"][0]["error"]


@postgres_only
class TestTeacherImportInvalidData:
    def test_one_bad_row_no_longer_fails_the_whole_file(self):
        tenant_id = _make_pro_tenant()
        s = uuid.uuid4().hex[:6]
        rows = [
            {"prenom": "Awa", "nom": "Camara", "email": f"a.{s}@example.com", "telephone": ""},
            {"prenom": "Sekou", "nom": "Keita", "email": f"b.{s}@example.com", "telephone": LONG_PHONE},
            {"prenom": "Hawa", "nom": "Conde", "email": f"{'c' * 95}.{s}@example.com", "telephone": ""},
            {"prenom": "Alpha", "nom": "Bah", "email": f"d.{s}@example.com", "telephone": ""},
        ]

        result = _confirm("teachers", rows, _admin_headers(tenant_id))

        assert result["created"] == 2
        errors = [e["error"] for e in result["errors"]]
        assert any("phone trop long" in e for e in errors)
        assert any("username trop long" in e for e in errors)  # e-mail > 100 = identifiant
        with SessionLocal() as db:
            created = {u.email for u in db.query(User).filter(User.tenant_id == tenant_id)}
        assert created == {f"a.{s}@example.com", f"d.{s}@example.com"}

    def test_unexpected_db_error_rejects_only_its_row_without_sql(self, monkeypatch):
        """Erreur que la validation ne voit pas (contrôle de longueur
        neutralisé) : le point de sauvegarde limite l'échec à la ligne et
        le message ne contient pas de SQL."""
        from app.services import teacher_import

        monkeypatch.setattr(teacher_import, "too_long_fields", lambda *a, **k: [])
        tenant_id = _make_pro_tenant()
        s = uuid.uuid4().hex[:6]
        rows = [
            {"prenom": "Awa", "nom": "Camara", "email": f"e.{s}@example.com", "telephone": ""},
            {"prenom": "Sekou", "nom": "Keita", "email": f"f.{s}@example.com", "telephone": LONG_PHONE},
            {"prenom": "Alpha", "nom": "Bah", "email": f"g.{s}@example.com", "telephone": ""},
        ]

        result = _confirm("teachers", rows, _admin_headers(tenant_id))

        assert result["created"] == 2
        assert [e["error"] for e in result["errors"]] == [ROW_FAILED_MESSAGE]


@postgres_only
class TestParentImportInvalidData:
    def _tenant_with_student(self):
        tenant_id = _make_pro_tenant()
        headers = _admin_headers(tenant_id)
        matricule = f"P-{uuid.uuid4().hex[:6]}"
        assert _confirm("students", [{**STUDENT, "matricule": matricule}], headers)["created"] == 1
        return tenant_id, headers, matricule

    def test_one_bad_row_no_longer_fails_the_whole_file(self):
        tenant_id, headers, matricule = self._tenant_with_student()
        s = uuid.uuid4().hex[:6]
        rows = [
            {"prenom": "Oumar", "nom": "Bah", "email": f"p1.{s}@example.com", "profession": "", "matricule_eleve": matricule},
            {"prenom": "Kadiatou", "nom": "Bah", "email": f"p2.{s}@example.com", "profession": "X" * 101, "matricule_eleve": matricule},
            {"prenom": "Lansana", "nom": "Toure", "email": f"p3.{s}@example.com", "profession": "", "matricule_eleve": matricule},
        ]

        result = _confirm("parents", rows, headers)

        assert result["created_parents"] == 2
        assert result["created_links"] == 2
        assert any("occupation trop long" in e["error"] for e in result["errors"])

    def test_unexpected_db_error_rolls_back_the_row_and_its_counters(self, monkeypatch):
        from app.services import parent_import

        monkeypatch.setattr(parent_import, "too_long_fields", lambda *a, **k: [])
        tenant_id, headers, matricule = self._tenant_with_student()
        s = uuid.uuid4().hex[:6]
        rows = [
            {"prenom": "Oumar", "nom": "Bah", "email": f"p4.{s}@example.com", "telephone": LONG_PHONE, "matricule_eleve": matricule},
            {"prenom": "Lansana", "nom": "Toure", "email": f"p5.{s}@example.com", "telephone": "", "matricule_eleve": matricule},
        ]

        result = _confirm("parents", rows, headers)

        assert result["created_parents"] == 1
        assert result["created_links"] == 1
        assert [e["error"] for e in result["errors"]] == [ROW_FAILED_MESSAGE]
        with SessionLocal() as db:
            assert db.query(User).filter(User.email == f"p4.{s}@example.com").first() is None


@postgres_only
class TestImportFailureDoesNotLeakSql:
    @pytest.mark.parametrize("kind,service", [
        ("students", "run_student_import"),
        ("teachers", "run_teacher_import"),
        ("parents", "run_parent_import"),
    ])
    def test_500_and_job_status_carry_a_generic_message(self, monkeypatch, kind, service):
        from app.api.v1.endpoints.core import imports as imports_module

        def _boom(*args, **kwargs):
            raise RuntimeError('INSERT INTO users (email) VALUES (%(email)s) — psycopg secret detail')

        monkeypatch.setattr(imports_module, service, _boom)
        tenant_id = _make_pro_tenant()
        headers = _admin_headers(tenant_id)
        row = {"prenom": "A", "nom": "B", "email": f"x.{uuid.uuid4().hex[:6]}@example.com",
               "date_naissance": "2005-01-01", "matricule_eleve": "X"}

        resp = client.post(
            f"/api/v1/import/{kind}/confirm/",
            files={"file": (f"{kind}.csv", __import__("io").BytesIO(_make_csv([row])), "text/csv")},
            headers=headers,
        )

        assert resp.status_code == 500
        assert IMPORT_FAILED_MESSAGE in resp.text
        _assert_no_sql(resp.text)
