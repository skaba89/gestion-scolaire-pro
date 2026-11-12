"""Constats de l'audit de recette par rôle (2026-11-12).

- Élève : « Carrières & Stages » et « Pré-inscription » appelaient des routes
  inexistantes (403) ; la pré-inscription soumettait par POST /admissions/
  (réservé à l'administration). → /students/me/, /students/me/reenroll/,
  /students/me/reenrollment/.
- Comptable : aucun destinataire dans la messagerie (liste users:read).
  → /communication/messaging/recipients/.
- Rapport ministériel par niveau : effectifs comptés en notes, et NULL/''
  en deux lignes « Non défini ».

Requêtes PostgreSQL (jsonb, array_agg, FILTER) : PostgreSQL uniquement.
"""
import os
import uuid
from datetime import date

import pytest
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.assessment import Assessment  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL", "").startswith("postgresql"),
    reason="requêtes PostgreSQL (jsonb, array_agg, FILTER)",
)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _id() -> str:
    return str(uuid.uuid4())


def _add(*objs):
    with SessionLocal() as db:
        for o in objs:
            db.add(o)
            db.flush()
        db.commit()


def _tenant() -> str:
    tid = _id()
    _add(Tenant(id=tid, name="École Audit", slug=f"au-{tid[:8]}", type="secondary",
                country="GN", is_active=True, settings={}))
    return tid


def _user(tid: str, role: str, email: str = None) -> str:
    uid = _id()
    _add(User(id=uid, tenant_id=tid, email=email or f"u.{uid[:8]}@ecole.gn", username=f"u.{uid[:8]}",
              first_name="Prénom", last_name=f"Nom{uid[:4]}", password_hash="x", is_active=True),
         UserRole(id=_id(), tenant_id=tid, user_id=uid, role=role))
    return uid


def _as(uid: str, tid: str, roles) -> dict:
    user = {"id": uid, "roles": list(roles), "tenant_id": tid}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": uid, "tenant_id": tid, "roles": list(roles)})
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tid}


def _student_account(tid: str):
    """Compte élève relié à une fiche, inscrit (ACTIVE) dans une classe de 6e."""
    uid = _user(tid, "STUDENT")
    year, next_year, level, cls, sid = _id(), _id(), _id(), _id(), _id()
    _add(AcademicYear(id=year, tenant_id=tid, name="2026-2027", code=f"Y{year[:6]}",
                      start_date=date(2026, 9, 1), end_date=date(2027, 7, 1), is_current=True),
         AcademicYear(id=next_year, tenant_id=tid, name="2027-2028", code=f"Y{next_year[:6]}",
                      start_date=date(2027, 9, 1), end_date=date(2028, 7, 1)),
         Level(id=level, tenant_id=tid, name="6ème", order_index=1),
         Classroom(id=cls, tenant_id=tid, name="6ème A", level_id=level, academic_year_id=year),
         Student(id=sid, tenant_id=tid, user_id=uid, registration_number=f"R{sid[:8]}", first_name="Aïssatou",
                 last_name="Diallo", date_of_birth=date(2013, 3, 1), gender=Gender.FEMALE,
                 status=StudentStatus.ACTIVE),
         Enrollment(id=_id(), tenant_id=tid, student_id=sid, class_id=cls, academic_year_id=year, status="ACTIVE"))
    return uid, sid, next_year, level


# ─── /students/me/ ────────────────────────────────────────────────────────

def test_student_reads_own_profile_with_current_enrollment():
    tid = _tenant()
    uid, sid, _, level = _student_account(tid)
    resp = client.get("/api/v1/students/me/", headers=_as(uid, tid, ["STUDENT"]))
    assert resp.status_code == 200, resp.text
    me = resp.json()
    assert me["id"] == sid and me["first_name"] == "Aïssatou" and me["gender"] == "FEMALE"
    current = [e for e in me["enrollments"] if e["is_current"]]
    assert current and current[0]["level_id"] == level and current[0]["level_name"] == "6ème"


@pytest.mark.parametrize("role", ["PARENT", "TEACHER"])
def test_accounts_without_student_record_are_refused(role):
    tid = _tenant()
    uid = _user(tid, role)
    assert client.get("/api/v1/students/me/", headers=_as(uid, tid, [role])).status_code == 403


def test_student_reenrollment_is_created_once_and_visible():
    tid = _tenant()
    uid, sid, next_year, level = _student_account(tid)
    parent = _user(tid, "PARENT", email="maman.diallo@exemple.gn")
    _add(ParentStudent(id=_id(), tenant_id=tid, parent_id=parent, student_id=sid))
    h = _as(uid, tid, ["STUDENT"])
    assert client.get(f"/api/v1/students/me/reenrollment/?academic_year_id={next_year}", headers=h).json() is None

    resp = client.post("/api/v1/students/me/reenroll/", headers=h,
                       json={"academic_year_id": next_year, "level_id": level, "notes": "Passage en 5e"})
    assert resp.status_code == 201, resp.text
    again = client.post("/api/v1/students/me/reenroll/", headers=h, json={"academic_year_id": next_year})
    assert again.status_code == 409

    mine = client.get(f"/api/v1/students/me/reenrollment/?academic_year_id={next_year}", headers=h).json()
    assert mine["status"] == "SUBMITTED" and "Passage en 5e" in mine["notes"]
    with SessionLocal() as db:
        row = db.execute(text(
            "SELECT parent_email, documents->>'student_id' AS sid FROM admission_applications WHERE id = :id"
        ), {"id": resp.json()["id"]}).mappings().first()
        assert row["sid"] == sid and row["parent_email"] == "maman.diallo@exemple.gn"
        assert db.execute(text("SELECT count(*) FROM audit_logs WHERE action = 'STUDENT_REENROLL_REQUEST' "
                               "AND resource_id = :id"), {"id": resp.json()["id"]}).scalar() == 1


def test_student_cannot_reenroll_into_another_schools_year():
    tid, other = _tenant(), _tenant()
    uid, _, _, _ = _student_account(tid)
    _, _, other_year, _ = _student_account(other)
    resp = client.post("/api/v1/students/me/reenroll/", headers=_as(uid, tid, ["STUDENT"]),
                       json={"academic_year_id": other_year})
    assert resp.status_code == 400, resp.text


# ─── Destinataires de la messagerie ───────────────────────────────────────

def test_accountant_gets_staff_and_parents_without_email():
    tid = _tenant()
    accountant = _user(tid, "ACCOUNTANT")
    teacher, parent = _user(tid, "TEACHER"), _user(tid, "PARENT")
    student, _, _, _ = _student_account(tid)
    rows = client.get("/api/v1/communication/messaging/recipients/",
                      headers=_as(accountant, tid, ["ACCOUNTANT"])).json()
    ids = {r["id"] for r in rows}
    assert {teacher, parent} <= ids and student not in ids
    assert all("email" not in r for r in rows)


def test_admin_keeps_full_list_with_emails_and_student_is_refused():
    tid = _tenant()
    admin = _user(tid, "TENANT_ADMIN")
    student, _, _, _ = _student_account(tid)
    rows = client.get("/api/v1/communication/messaging/recipients/",
                      headers=_as(admin, tid, ["TENANT_ADMIN"])).json()
    assert student in {r["id"] for r in rows} and all("email" in r for r in rows)
    assert client.get("/api/v1/communication/messaging/recipients/",
                      headers=_as(student, tid, ["STUDENT"])).status_code == 403


# ─── Rapport ministériel par niveau ───────────────────────────────────────

def test_ministry_level_stats_count_students_not_grades():
    tid = _tenant()
    sids = [_id(), _id(), _id()]
    _add(*[Student(id=sid, tenant_id=tid, registration_number=f"R{sid[:8]}", first_name="E", last_name="L",
                   date_of_birth=date(2012, 1, 1), gender=Gender.MALE if i else Gender.FEMALE,
                   status=StudentStatus.ACTIVE) for i, sid in enumerate(sids)])
    with SessionLocal() as db:
        db.execute(text("UPDATE students SET level = :lvl WHERE id = :id"), {"lvl": "", "id": sids[1]})
        db.execute(text("UPDATE students SET level = NULL WHERE id = :id"), {"id": sids[2]})
        db.execute(text("UPDATE students SET level = '6ème' WHERE id = :id"), {"id": sids[0]})
        db.commit()
    subject, assessment = _id(), _id()
    _add(Subject(id=subject, tenant_id=tid, name="Maths"))
    from datetime import datetime
    _add(Assessment(id=assessment, tenant_id=tid, name="D1", max_score=20.0, date=datetime(2026, 10, 1),
                    subject_id=subject))
    _add(*[Grade(id=_id(), tenant_id=tid, student_id=sids[0], assessment_id=assessment, subject_id=subject,
                 score=s) for s in (10.0, 12.0, 14.0)])
    rows = client.get("/api/v1/analytics/ministry-stats/levels/",
                      headers=_as(_user(tid, "TENANT_ADMIN"), tid, ["TENANT_ADMIN"])).json()
    by_level = {r["level"]: r for r in rows}
    assert set(by_level) == {"6ème", "Non défini"}
    assert by_level["6ème"]["total"] == 1 and by_level["6ème"]["female"] == 1
    assert by_level["Non défini"]["total"] == 2 and by_level["Non défini"]["male"] == 2
