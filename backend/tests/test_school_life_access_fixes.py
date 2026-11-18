"""Vie scolaire — contrôles d'accès manquants (2026-11-18).

BADGES-ACCESS-01 : GET /student-badges/ (get_current_user seul : tout compte
  listait les badges de l'établissement), POST (classroom_id non vérifié,
  détail d'erreur de base renvoyé), DELETE (204 même si inexistant).
SCHOOL-LIFE-ACCESS-01 : GET /school-life/assessments/ et
  /school-life/gamification/stats/ ouverts à tout compte authentifié.
CHECKINS-TEACHER-SCOPE-01 : GET /school-life/check-ins/ ne limitait pas un
  enseignant aux élèves de ses classes.

Les refus (403) ne touchent pas la base : ils tournent partout. Les lectures
de `student_badges` (table opérationnelle PostgreSQL) et les affectations
enseignant (`teacher_assignments`) exigent PostgreSQL.
"""
import uuid
from datetime import date, datetime

import pytest
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.student import Student  # noqa: E402
from app.models.student_check_in import StudentCheckIn  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from test_enrollments_teacher_scope import _assign, _user  # noqa: E402

_pg = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="student_badges / teacher_assignments : tables PostgreSQL.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

BADGES = "/api/v1/student-badges/"
ASSESSMENTS = "/api/v1/school-life/assessments/"
GAMIF = "/api/v1/school-life/gamification/stats/"
CHECKINS = "/api/v1/school-life/check-ins/"

STAFF_ROLES = ["TENANT_ADMIN", "DIRECTOR", "SECRETARY"]
NON_STAFF_ROLES = ["STUDENT", "PARENT", "ALUMNI", "TEACHER"]


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(tenant_id: str, role: str, user_id: str = None) -> dict:
    user = {"id": user_id or str(uuid.uuid4()), "tenant_id": tenant_id, "roles": [role], "_cycle_ids": None}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": tenant_id, "roles": [role]})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def school():
    tag = uuid.uuid4().hex[:8]
    ids = {}
    with SessionLocal() as db:
        tenant = Tenant(name=f"École {tag}", slug=f"sl-acc-{tag}", type="university",
                        country="GN", is_active=True, settings={})
        other = Tenant(name=f"Autre {tag}", slug=f"sl-oth-{tag}", type="university",
                       country="GN", is_active=True, settings={})
        db.add_all([tenant, other])
        db.flush()
        year = AcademicYear(tenant_id=tenant.id, name="2024-2025", code=f"Y{tag}",
                            start_date=date(2024, 10, 1), end_date=date(2025, 7, 31))
        db.add(year)
        db.flush()
        ids["tenant_id"], ids["other_tenant_id"] = str(tenant.id), str(other.id)
        for key in ("mine", "other"):
            classroom = Classroom(tenant_id=tenant.id, name=f"Classe {key} {tag}")
            student = Student(tenant_id=tenant.id, registration_number=f"{key}-{tag}",
                              first_name="Awa", last_name=key, date_of_birth=date(2005, 1, 1),
                              gender="FEMALE")
            db.add_all([classroom, student])
            db.flush()
            db.add(Enrollment(tenant_id=tenant.id, student_id=student.id, class_id=classroom.id,
                              academic_year_id=year.id))
            db.add(StudentCheckIn(tenant_id=tenant.id, student_id=student.id,
                                  checked_at=datetime(2026, 11, 18, 8, 0), direction="IN"))
            ids[key], ids[f"student_{key}"] = str(classroom.id), str(student.id)
        foreign_class = Classroom(tenant_id=other.id, name=f"Classe étrangère {tag}")
        db.add(foreign_class)
        db.flush()
        ids["foreign_class"] = str(foreign_class.id)
        db.commit()
    return ids


def _add_badge(tenant_id: str, student_id: str, name: str = "Mérite") -> str:
    badge_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO student_badges (id, tenant_id, student_id, badge_type, badge_name, status)
            VALUES (:id, :tid, :sid, 'MERIT', :name, 'ACTIVE')
        """), {"id": badge_id, "tid": tenant_id, "sid": student_id, "name": name})
        db.commit()
    return badge_id


# ── P1 : GET /student-badges/ ────────────────────────────────────────────────

@pytest.mark.parametrize("role", NON_STAFF_ROLES)
def test_badges_list_refused_to_non_staff(school, role):
    headers = _as(school["tenant_id"], role)
    assert client.get(BADGES, headers=headers).status_code == 403
    resp = client.get(BADGES, params={"student_id": school["student_other"]}, headers=headers)
    assert resp.status_code == 403


@_pg
@pytest.mark.parametrize("role", STAFF_ROLES)
def test_badges_list_still_works_for_staff(school, role):
    _add_badge(school["tenant_id"], school["student_mine"], "Mon badge")
    resp = client.get(BADGES, headers=_as(school["tenant_id"], role))
    assert resp.status_code == 200, resp.text
    assert [b["badge_name"] for b in resp.json()] == ["Mon badge"]


@_pg
def test_badges_list_never_crosses_tenants(school):
    _add_badge(school["tenant_id"], school["student_mine"])
    resp = client.get(BADGES, headers=_as(school["other_tenant_id"], "TENANT_ADMIN"))
    assert resp.status_code == 200
    assert resp.json() == []


@_pg
def test_badges_list_malformed_id_is_422_not_swallowed(school):
    resp = client.get(BADGES, params={"student_id": "pas-un-uuid"},
                      headers=_as(school["tenant_id"], "TENANT_ADMIN"))
    assert resp.status_code == 422


# ── P5 : POST /student-badges/ ───────────────────────────────────────────────

@_pg
def test_badge_create_rejects_classroom_of_another_tenant(school):
    resp = client.post(BADGES, headers=_as(school["tenant_id"], "TENANT_ADMIN"),
                       json={"student_id": school["student_mine"], "badge_name": "X",
                             "classroom_id": school["foreign_class"]})
    assert resp.status_code == 404, resp.text


@_pg
def test_badge_create_with_own_classroom_still_works(school):
    resp = client.post(BADGES, headers=_as(school["tenant_id"], "TENANT_ADMIN"),
                       json={"student_id": school["student_mine"], "badge_name": "X",
                             "classroom_id": school["mine"]})
    assert resp.status_code == 201, resp.text


@_pg
def test_badge_create_does_not_leak_database_error(school):
    # badge_type trop long pour VARCHAR(100) : erreur de base.
    resp = client.post(BADGES, headers=_as(school["tenant_id"], "TENANT_ADMIN"),
                       json={"student_id": school["student_mine"], "badge_type": "x" * 300})
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "VARCHAR" not in detail and "student_badges" not in detail and "SQL" not in detail


# ── P6 : DELETE /student-badges/{id}/ ────────────────────────────────────────

@_pg
def test_badge_delete_unknown_or_malformed_is_404(school):
    headers = _as(school["tenant_id"], "TENANT_ADMIN")
    assert client.delete(f"{BADGES}{uuid.uuid4()}/", headers=headers).status_code == 404
    assert client.delete(f"{BADGES}pas-un-uuid/", headers=headers).status_code == 404


@_pg
def test_badge_delete_of_another_tenant_is_404_and_keeps_row(school):
    badge_id = _add_badge(school["tenant_id"], school["student_mine"])
    resp = client.delete(f"{BADGES}{badge_id}/", headers=_as(school["other_tenant_id"], "TENANT_ADMIN"))
    assert resp.status_code == 404
    with SessionLocal() as db:
        assert db.execute(text("SELECT 1 FROM student_badges WHERE id = :i"), {"i": badge_id}).first()


@_pg
def test_badge_delete_own_works(school):
    badge_id = _add_badge(school["tenant_id"], school["student_mine"])
    resp = client.delete(f"{BADGES}{badge_id}/", headers=_as(school["tenant_id"], "TENANT_ADMIN"))
    assert resp.status_code == 204


# ── P3 : GET /school-life/assessments/ ───────────────────────────────────────

def test_assessments_refused_without_settings_read(school):
    # STUDENT/PARENT/TEACHER détiennent settings:read (comme la canonique
    # GET /assessments/) : l'alignement ferme l'accès aux comptes qui ne l'ont
    # pas (ALUMNI, rôle inconnu).
    assert client.get(ASSESSMENTS, headers=_as(school["tenant_id"], "ALUMNI")).status_code == 403


@pytest.mark.parametrize("role", STAFF_ROLES)
def test_assessments_still_works_for_staff(school, role):
    resp = client.get(ASSESSMENTS, headers=_as(school["tenant_id"], role))
    assert resp.status_code == 200, resp.text


# ── P4 : GET /school-life/gamification/stats/ ────────────────────────────────

@pytest.mark.parametrize("role", ["STUDENT", "PARENT", "ALUMNI"])
def test_gamification_stats_refused_to_non_staff(school, role):
    assert client.get(GAMIF, headers=_as(school["tenant_id"], role)).status_code == 403


@_pg
@pytest.mark.parametrize("role", STAFF_ROLES)
def test_gamification_stats_still_works_for_staff(school, role):
    _add_badge(school["tenant_id"], school["student_mine"])
    resp = client.get(GAMIF, headers=_as(school["tenant_id"], role))
    assert resp.status_code == 200, resp.text
    assert resp.json()["totalAchievements"] == 1


@_pg
def test_gamification_stats_other_tenant_sees_nothing(school):
    _add_badge(school["tenant_id"], school["student_mine"])
    resp = client.get(GAMIF, headers=_as(school["other_tenant_id"], "TENANT_ADMIN"))
    assert resp.json()["totalAchievements"] == 0


# ── P7 : GET /school-life/check-ins/ pour un enseignant ──────────────────────

@_pg
def test_teacher_sees_only_check_ins_of_his_classes(school):
    teacher = _user(school["tenant_id"], "TEACHER")
    _assign(teacher["id"], school["tenant_id"], school["mine"])
    resp = client.get(CHECKINS, headers=_as(school["tenant_id"], "TEACHER", teacher["id"]))
    assert resp.status_code == 200, resp.text
    assert {c["student_id"] for c in resp.json()} == {school["student_mine"]}


@_pg
def test_teacher_requesting_a_foreign_class_student_gets_nothing(school):
    teacher = _user(school["tenant_id"], "TEACHER")
    _assign(teacher["id"], school["tenant_id"], school["mine"])
    resp = client.get(CHECKINS, params={"student_ids": [school["student_other"]]},
                      headers=_as(school["tenant_id"], "TEACHER", teacher["id"]))
    assert resp.status_code == 200
    assert resp.json() == []


@_pg
def test_teacher_keeps_check_ins_of_his_own_sessions(school):
    teacher = _user(school["tenant_id"], "TEACHER")
    _assign(teacher["id"], school["tenant_id"], school["mine"])
    session_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO check_in_sessions (id, tenant_id, teacher_id, classroom_id)
            VALUES (:id, :tid, :uid, :cid)
        """), {"id": session_id, "tid": school["tenant_id"], "uid": teacher["id"], "cid": school["mine"]})
        db.commit()
    headers = _as(school["tenant_id"], "TEACHER", teacher["id"])
    # Pointage d'un élève hors de ses classes, dans sa propre séance.
    resp = client.post(CHECKINS, headers=headers,
                       json={"student_id": school["student_other"], "session_id": session_id, "source": "QR_SCAN"})
    assert resp.status_code == 200, resp.text
    resp = client.get(CHECKINS, params={"session_id": session_id}, headers=headers)
    assert [c["student_id"] for c in resp.json()] == [school["student_other"]]


@_pg
def test_teacher_without_assignment_sees_no_check_in(school):
    teacher = _user(school["tenant_id"], "TEACHER")
    resp = client.get(CHECKINS, headers=_as(school["tenant_id"], "TEACHER", teacher["id"]))
    assert resp.status_code == 200
    assert resp.json() == []


@_pg
@pytest.mark.parametrize("role", STAFF_ROLES)
def test_staff_still_sees_all_check_ins(school, role):
    resp = client.get(CHECKINS, headers=_as(school["tenant_id"], role))
    assert resp.status_code == 200
    assert {c["student_id"] for c in resp.json()} == {school["student_mine"], school["student_other"]}


@_pg
def test_other_tenant_staff_sees_no_check_in(school):
    resp = client.get(CHECKINS, headers=_as(school["other_tenant_id"], "TENANT_ADMIN"))
    assert resp.status_code == 200
    assert resp.json() == []
