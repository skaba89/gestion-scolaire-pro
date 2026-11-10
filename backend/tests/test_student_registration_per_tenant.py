"""Matricule unique par établissement, pas sur toute la plateforme (A2).

Un index unique global (ix_students_registration_number, 2026-02) survivait à
la migration qui devait rendre le matricule unique par établissement :
- créer l'élève « 0001 » échouait (HTTP 500) si une AUTRE école l'utilisait,
  ce qui révélait au passage que le matricule existait ailleurs ;
- l'import CSV ignorait silencieusement cet élève tout en le comptant « créé ».
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
    _make_pro_tenant,
    postgres_only,
)

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.models.student import Student  # noqa: E402

URL = "/api/v1/students/"


def _payload(registration: str, last_name: str = "Camara") -> dict:
    return {"registration_number": registration, "first_name": "Fatou", "last_name": last_name,
            "date_of_birth": "2012-05-01", "gender": "FEMALE"}


def _students(tenant_id: str, registration: str) -> list[Student]:
    with SessionLocal() as db:
        return db.query(Student).filter(Student.tenant_id == tenant_id,
                                        Student.registration_number == registration).all()


def test_two_schools_can_each_use_the_same_registration_number():
    reg = f"0001-{uuid.uuid4().hex[:6]}"
    school_a, school_b = _make_pro_tenant(), _make_pro_tenant()

    first = client.post(URL, json=_payload(reg), headers=_admin_headers(school_a))
    assert first.status_code in (200, 201), first.text
    second = client.post(URL, json=_payload(reg, "Sylla"), headers=_admin_headers(school_b))
    assert second.status_code in (200, 201), second.text

    assert [s.last_name for s in _students(school_a, reg)] == ["Camara"]
    assert [s.last_name for s in _students(school_b, reg)] == ["Sylla"]


def test_same_registration_number_twice_in_one_school_is_refused():
    reg = f"0002-{uuid.uuid4().hex[:6]}"
    school = _make_pro_tenant()
    headers = _admin_headers(school)
    assert client.post(URL, json=_payload(reg), headers=headers).status_code in (200, 201)

    again = client.post(URL, json=_payload(reg, "Sylla"), headers=headers)
    assert again.status_code == 400, again.text
    assert again.json()["detail"] == "Registration number already exists"
    assert len(_students(school, reg)) == 1


def test_concurrent_duplicate_in_one_school_is_400_not_500(monkeypatch):
    """Deux requêtes simultanées passent toutes deux le contrôle préalable ;
    la seconde heurte la contrainte : réponse claire, pas d'erreur serveur."""
    from app.crud import student as crud_student

    reg = f"0003-{uuid.uuid4().hex[:6]}"
    school = _make_pro_tenant()
    headers = _admin_headers(school)
    assert client.post(URL, json=_payload(reg), headers=headers).status_code in (200, 201)
    monkeypatch.setattr(crud_student, "get_student_by_registration", lambda *a, **k: None)

    resp = client.post(URL, json=_payload(reg, "Sylla"), headers=headers)
    assert resp.status_code == 400, resp.text
    assert len(_students(school, reg)) == 1


@postgres_only
def test_csv_import_creates_a_student_whose_number_exists_in_another_school():
    reg = f"IMP-{uuid.uuid4().hex[:6]}"
    other, school = _make_pro_tenant(), _make_pro_tenant()
    assert client.post(URL, json=_payload(reg), headers=_admin_headers(other)).status_code in (200, 201)

    result = _confirm("students", [{**STUDENT, "matricule": reg}], _admin_headers(school))

    assert result["created"] == 1 and result["skipped"] == 0, result
    assert [s.first_name for s in _students(school, reg)] == ["Mariama"]
    assert len(_students(other, reg)) == 1


class _BlindToExistingNumbers:
    """Session dont la lecture des matricules existants revient vide : simule
    un import concurrent qui a pris le matricule entre la lecture et l'INSERT."""

    def __init__(self, db):
        self._db = db

    def execute(self, statement, *args, **kwargs):
        if "SELECT registration_number FROM students" in str(statement):
            class _Empty:
                @staticmethod
                def fetchall():
                    return []
            return _Empty()
        return self._db.execute(statement, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._db, name)


@postgres_only
def test_csv_row_not_inserted_is_reported_not_counted_as_created():
    from app.core.tenant_resolution import enter_tenant_context_or_404
    from app.services.student_import import run_student_import

    reg = f"RACE-{uuid.uuid4().hex[:6]}"
    school = _make_pro_tenant()
    assert client.post(URL, json=_payload(reg), headers=_admin_headers(school)).status_code in (200, 201)

    headers = ["prenom", "nom", "date_naissance", "sexe", "matricule"]
    rows = [{"prenom": "Mariama", "nom": "Diallo", "date_naissance": "2005-03-14", "sexe": "F", "matricule": reg}]
    with SessionLocal() as db:
        enter_tenant_context_or_404(db, school)
        result = run_student_import(_BlindToExistingNumbers(db), school, headers, rows,
                                    skip_errors=False, default_academic_year="")

    assert result["created"] == 0, result
    assert result["skipped"] == 1
    assert any("Matricule déjà utilisé" in e["error"] for e in result["error_rows"])
    assert [s.last_name for s in _students(school, reg)] == ["Camara"]
