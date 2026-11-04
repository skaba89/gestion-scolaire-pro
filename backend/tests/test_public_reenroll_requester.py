"""Réinscription publique : le demandeur doit prouver son lien avec l'élève
(SEC-ADM-01, 2026-11-03) — et la vérification doit fonctionner.

Constats :
- `POST /admissions/public/reenroll/` (sans authentification) acceptait tout
  `student_id` avec n'importe quel e-mail : une personne disposant de
  l'identifiant d'un élève déposait une demande en son nom.
- `POST /admissions/public/verify-student/` joignait `students.parent_id`,
  colonne qui n'existe ni dans le modèle ni dans les migrations : 1re étape
  du parcours en erreur pour tout parent.
- `POST /admissions/public/apply/` acceptait une année ou un niveau d'un
  autre établissement (règle d'or n° 2).

PostgreSQL uniquement (gen_random_uuid, jsonb), comme
test_admission_reenroll_cast.py.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.admission import AdmissionApplication  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="admission_applications INSERT uses gen_random_uuid()/jsonb, Postgres-only.",
)

BASE = "/api/v1/admissions/public"


@pytest.fixture(autouse=True)
def _no_rate_limit():
    from app.api.v1.endpoints.operational.admissions import limiter
    previous = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = previous


def _school() -> dict:
    ids = {k: str(uuid.uuid4()) for k in ("tenant", "parent", "student", "year", "level")}
    sfx = ids["tenant"][:8]
    ids["reg"] = f"REG-{sfx}"
    ids["email"] = f"maman.{sfx}@exemple.gn"
    with SessionLocal() as db:
        db.add(Tenant(id=ids["tenant"], name="École Publique", slug=f"pub-{sfx}",
                      type="primary", country="GN", is_active=True, settings={}))
        db.commit()
        db.add(User(id=ids["parent"], tenant_id=ids["tenant"], email=ids["email"], username=f"maman.{sfx}",
                    first_name="Aminata", last_name="Condé",
                    password_hash=get_password_hash("Parent@2026"), is_active=True, is_verified=True))
        db.add(Student(id=ids["student"], tenant_id=ids["tenant"], registration_number=ids["reg"],
                       first_name="Moussa", last_name="Condé", date_of_birth=date(2013, 5, 2),
                       gender=Gender.MALE, status=StudentStatus.ACTIVE))
        db.add(AcademicYear(id=ids["year"], tenant_id=ids["tenant"], name="2026-2027", code=f"AY-{sfx}",
                            start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True))
        db.add(Level(id=ids["level"], tenant_id=ids["tenant"], name="6e", code=f"6E-{sfx}"))
        db.commit()
        db.add(ParentStudent(id=str(uuid.uuid4()), tenant_id=ids["tenant"], parent_id=ids["parent"],
                             student_id=ids["student"], is_primary=True, relation_type="MOTHER"))
        db.commit()
    return ids


def _reenroll(ids: dict, **over) -> dict:
    return {"tenant_id": ids["tenant"], "student_id": ids["student"], "registration_number": ids["reg"],
            "academic_year_id": ids["year"], "level_id": ids["level"], "parent_email": ids["email"], **over}


def _applications(tenant_id: str) -> int:
    with SessionLocal() as db:
        return db.query(AdmissionApplication).filter(AdmissionApplication.tenant_id == tenant_id).count()


class TestVerifyStudentWorks:
    def test_linked_parent_is_verified(self):
        ids = _school()
        resp = client.post(f"{BASE}/verify-student/", json={
            "tenant_id": ids["tenant"], "registration_number": ids["reg"].lower(), "parent_email": ids["email"].upper()})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["student_id"] == ids["student"]
        assert "***" in body["masked_email"]  # jamais l'adresse en clair

    def test_unrelated_email_is_404(self):
        ids = _school()
        resp = client.post(f"{BASE}/verify-student/", json={
            "tenant_id": ids["tenant"], "registration_number": ids["reg"], "parent_email": "inconnu@exemple.com"})
        assert resp.status_code == 404, resp.text


class TestReenrollRequiresProof:
    def test_linked_parent_can_reenroll(self):
        ids = _school()
        resp = client.post(f"{BASE}/reenroll/", json=_reenroll(ids))
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "SUBMITTED"

    def test_arbitrary_email_is_refused_and_nothing_is_written(self):
        ids = _school()
        resp = client.post(f"{BASE}/reenroll/", json=_reenroll(ids, parent_email="pirate@exemple.com"))
        assert resp.status_code == 404, resp.text
        assert _applications(ids["tenant"]) == 0

    def test_wrong_registration_number_is_refused(self):
        ids = _school()
        resp = client.post(f"{BASE}/reenroll/", json=_reenroll(ids, registration_number="REG-AUTRE"))
        assert resp.status_code == 404, resp.text
        assert _applications(ids["tenant"]) == 0

    def test_missing_registration_number_is_422(self):
        ids = _school()
        body = _reenroll(ids)
        body.pop("registration_number")
        assert client.post(f"{BASE}/reenroll/", json=body).status_code == 422

    def test_level_of_another_school_is_400(self):
        ids, other = _school(), _school()
        resp = client.post(f"{BASE}/reenroll/", json=_reenroll(ids, level_id=other["level"]))
        assert resp.status_code == 400, resp.text
        assert _applications(ids["tenant"]) == 0


class TestApplyForeignKeys:
    def _apply(self, ids: dict, **over) -> dict:
        return {"tenant_id": ids["tenant"], "academic_year_id": ids["year"], "level_id": ids["level"],
                "student_first_name": "Awa", "student_last_name": "Diallo",
                "parent_first_name": "Kadiatou", "parent_last_name": "Diallo",
                "parent_email": "kadiatou@exemple.gn", "parent_phone": "+224621000000", **over}

    def test_own_year_and_level_are_accepted(self):
        ids = _school()
        assert client.post(f"{BASE}/apply/", json=self._apply(ids)).status_code == 201

    def test_year_of_another_school_is_400(self):
        ids, other = _school(), _school()
        resp = client.post(f"{BASE}/apply/", json=self._apply(ids, academic_year_id=other["year"]))
        assert resp.status_code == 400, resp.text
        assert _applications(ids["tenant"]) == 0

    def test_malformed_level_is_400_not_500(self):
        ids = _school()
        resp = client.post(f"{BASE}/apply/", json=self._apply(ids, level_id="pas-un-uuid"))
        assert resp.status_code == 400, resp.text
