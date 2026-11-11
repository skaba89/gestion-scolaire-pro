"""Identifiants d'un autre établissement refusés sur les routes d'écriture.

Une contrainte de clé étrangère PostgreSQL ne passe pas par la RLS : sans
vérification explicite, une ligne de l'établissement A pouvait pointer vers
une donnée de B. Trouvé le 2026-11-11 par le parcours des routes d'écriture
(CRAWL-W) : POST /rooms/ avec le campus d'un autre établissement → 201.

Chaque cas : l'administrateur de A envoie l'identifiant d'une ligne qui
existe réellement dans B → 404 « introuvable dans cet établissement », et
rien n'est créé.
"""
import uuid
from datetime import date, datetime

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.assessment import Assessment  # noqa: E402
from app.models.campus import Campus  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.employee import Employee  # noqa: E402
from app.models.faculty import Faculty  # noqa: E402
from app.models.library import LibraryCategory  # noqa: E402
from app.models.semester import Semester  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

import os  # noqa: E402

IS_POSTGRES = os.environ.get("DATABASE_URL", "").startswith("postgresql")


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _tenant() -> str:
    tid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École FK", slug=f"fk-{tid[:8]}", type="primary",
                      country="GN", is_active=True, settings={}))
        db.commit()
    return tid


def _admin_headers(tenant_id: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": tenant_id, "roles": user["roles"]})
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


def _add(obj) -> str:
    with SessionLocal() as db:
        db.add(obj)
        db.commit()
        return str(obj.id)


def _foreign_rows() -> dict:
    """Une ligne de chaque table référencée, dans l'établissement B."""
    b = _tenant()
    rid = lambda: str(uuid.uuid4())  # noqa: E731
    ids = {}
    ids["user"] = _add(User(id=rid(), tenant_id=b, email=f"b.{rid()[:8]}@ecole.gn", username=f"b.{rid()[:8]}",
                            first_name="B", last_name="B", password_hash="x", is_active=True))
    ids["campus"] = _add(Campus(id=rid(), tenant_id=b, name="Campus B"))
    ids["year"] = _add(AcademicYear(id=rid(), tenant_id=b, name="2026-2027", code=f"Y{rid()[:6]}",
                                    start_date=date(2026, 9, 1), end_date=date(2027, 7, 1)))
    ids["semester"] = _add(Semester(id=rid(), tenant_id=b, academic_year_id=ids["year"], name="S1", number=1,
                                    start_date=date(2026, 9, 1), end_date=date(2027, 1, 31)))
    ids["faculty"] = _add(Faculty(id=rid(), tenant_id=b, name="Faculté B"))
    ids["employee"] = _add(Employee(id=rid(), tenant_id=b, employee_number=f"E{rid()[:6]}", first_name="B",
                                    last_name="B", hire_date=date(2020, 1, 1)))
    ids["student"] = _add(Student(id=rid(), tenant_id=b, registration_number=f"R{rid()[:8]}", first_name="B",
                                  last_name="B", date_of_birth=date(2012, 1, 1), gender=Gender.MALE,
                                  status=StudentStatus.ACTIVE))
    ids["class"] = _add(Classroom(id=rid(), tenant_id=b, name="Classe B"))
    ids["subject"] = _add(Subject(id=rid(), tenant_id=b, name="Maths B"))
    ids["assessment"] = _add(Assessment(id=rid(), tenant_id=b, name="Devoir B", max_score=20.0,
                                        date=datetime(2026, 10, 1), subject_id=ids["subject"]))
    ids["category"] = _add(LibraryCategory(id=rid(), tenant_id=b, name="Catégorie B"))
    return ids


TODAY = str(date.today())

# (route, corps avec l'identifiant étranger, clé de _foreign_rows)
CASES = [
    ("/api/v1/rooms/", lambda f: {"name": "Salle", "campus_id": f["campus"]}),
    ("/api/v1/infrastructure/rooms/", lambda f: {"name": "Salle", "campus_id": f["campus"]}),
    ("/api/v1/departments/", lambda f: {"name": "Dépt", "head_id": f["user"]}),
    ("/api/v1/departments/", lambda f: {"name": "Dépt", "faculty_id": f["faculty"]}),
    ("/api/v1/faculties/", lambda f: {"name": "Fac", "dean_id": f["user"]}),
    ("/api/v1/terms/", lambda f: {"name": "T1", "academic_year_id": f["year"],
                                  "start_date": "2026-09-01", "end_date": "2026-12-20"}),
    ("/api/v1/subjects/", lambda f: {"name": "Physique", "semester_id": f["semester"]}),
    ("/api/v1/hr/contracts/", lambda f: {"contract_number": "C1", "contract_type": "CDI", "start_date": TODAY,
                                         "job_title": "Prof", "gross_monthly_salary": 1.0,
                                         "employee_id": f["employee"]}),
    ("/api/v1/hr/leave-requests/", lambda f: {"leave_type": "ANNUAL", "start_date": TODAY, "end_date": TODAY,
                                              "total_days": 1, "employee_id": f["employee"]}),
    ("/api/v1/hr/payslips/", lambda f: {"period_month": 1, "period_year": 2026, "gross_salary": 1.0,
                                        "net_salary": 1.0, "pay_date": TODAY, "employee_id": f["employee"]}),
    ("/api/v1/school-life/assessments/", lambda f: {"name": "Devoir", "date": "2026-10-01T08:00:00",
                                                    "subject_id": f["subject"]}),
    ("/api/v1/school-life/grades/", lambda f: {"student_id": f["student"], "score": 10.0}),
    ("/api/v1/school-life/grades/", lambda f: {"student_id": None, "assessment_id": f["assessment"],
                                               "score": 10.0}),
    ("/api/v1/school-life/attendance/", lambda f: {"student_id": f["student"], "date": TODAY,
                                                   "status": "PRESENT"}),
    ("/api/v1/school-life/check-ins/", lambda f: {"student_id": f["student"], "direction": "IN"}),
    ("/api/v1/clubs/", lambda f: {"name": "Club", "advisor_id": f["user"]}),
    ("/api/v1/library/resources/", lambda f: {"title": "Livre", "category_id": f["category"]}),
]

# Tables opérationnelles créées par migration (absentes du schéma SQLite).
PG_ONLY_CASES = [
    ("/api/v1/school-life/check-ins/sessions/", lambda f: {"classroom_id": f["class"]}),
    ("/api/v1/school-life/check-ins/sessions/start/", lambda f: {"class_id": f["class"]}),
]


def _fill_own_student(body: dict, tenant_id: str) -> dict:
    """Le cas « évaluation étrangère » a besoin d'un élève de A."""
    if "student_id" in body and body["student_id"] is None:
        body["student_id"] = _add(Student(
            id=str(uuid.uuid4()), tenant_id=tenant_id, registration_number=f"A{uuid.uuid4().hex[:8]}",
            first_name="A", last_name="A", date_of_birth=date(2012, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE))
    return body


def _assert_refused(path: str, make_body) -> None:
    tenant_a = _tenant()
    body = _fill_own_student(make_body(_foreign_rows()), tenant_a)
    resp = client.post(path, json=body, headers=_admin_headers(tenant_a))
    assert resp.status_code == 404, f"{path} {body} -> {resp.status_code} {resp.text}"
    assert "introuvable dans cet établissement" in resp.text


@pytest.mark.parametrize("path,make_body", CASES, ids=[f"{p}#{i}" for i, (p, _) in enumerate(CASES)])
def test_foreign_tenant_reference_is_refused(path, make_body):
    _assert_refused(path, make_body)


@pytest.mark.skipif(not IS_POSTGRES, reason="check_in_sessions : table opérationnelle (PostgreSQL)")
@pytest.mark.parametrize("path,make_body", PG_ONLY_CASES, ids=[p for p, _ in PG_ONLY_CASES])
def test_foreign_tenant_class_refused_for_check_in_sessions(path, make_body):
    _assert_refused(path, make_body)


def test_own_tenant_reference_is_accepted():
    """Contrôle positif : le campus de son propre établissement est accepté."""
    tenant_a = _tenant()
    campus = _add(Campus(id=str(uuid.uuid4()), tenant_id=tenant_a, name="Campus A"))
    resp = client.post("/api/v1/rooms/", json={"name": "Salle A", "campus_id": campus},
                       headers=_admin_headers(tenant_a))
    assert resp.status_code == 201, resp.text


@pytest.mark.skipif(not IS_POSTGRES, reason="check_in_sessions : table opérationnelle (PostgreSQL)")
def test_teacher_cannot_start_session_for_a_class_they_do_not_teach():
    tenant_a = _tenant()
    class_id = _add(Classroom(id=str(uuid.uuid4()), tenant_id=tenant_a, name="Classe A"))
    teacher = {"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_a}
    app.dependency_overrides[get_current_user] = lambda: teacher
    token = create_access_token({"sub": teacher["id"], "tenant_id": tenant_a, "roles": ["TEACHER"]})
    resp = client.post("/api/v1/school-life/check-ins/sessions/start/", json={"class_id": class_id},
                       headers={"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_a})
    assert resp.status_code == 403, resp.text


# --- /schedule/ : corps typé et références du tenant (2026-11-11) ---------

from app.models.room import Room  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402


def _teacher(tenant_id: str) -> str:
    uid = str(uuid.uuid4())
    _add(User(id=uid, tenant_id=tenant_id, email=f"t.{uid[:8]}@ecole.gn", username=f"t.{uid[:8]}",
              first_name="T", last_name="T", password_hash="x", is_active=True))
    with SessionLocal() as db:
        db.add(UserRole(id=str(uuid.uuid4()), tenant_id=tenant_id, user_id=uid, role="TEACHER"))
        db.commit()
    return uid


def _schedule_refs(tenant_id: str) -> dict:
    rid = lambda: str(uuid.uuid4())  # noqa: E731
    return {
        "class_id": _add(Classroom(id=rid(), tenant_id=tenant_id, name="Classe")),
        "subject_id": _add(Subject(id=rid(), tenant_id=tenant_id, name="Matière")),
        "room_id": _add(Room(id=rid(), tenant_id=tenant_id, name="Salle")),
        "teacher_id": _teacher(tenant_id),
    }


@pytest.mark.parametrize("field", ["class_id", "subject_id", "room_id", "teacher_id"])
def test_schedule_slot_refuses_foreign_reference(field):
    tenant_a, tenant_b = _tenant(), _tenant()
    body = {**_schedule_refs(tenant_a), "day_of_week": 1, "start_time": "08:00:00", "end_time": "09:00:00"}
    body[field] = _schedule_refs(tenant_b)[field]
    resp = client.post("/api/v1/schedule/", json=body, headers=_admin_headers(tenant_a))
    assert resp.status_code == 404, resp.text
    assert "introuvable dans cet établissement" in resp.text


def test_schedule_slot_incomplete_body_is_422_not_500():
    tenant_a = _tenant()
    resp = client.post("/api/v1/schedule/", json={}, headers=_admin_headers(tenant_a))
    assert resp.status_code == 422, resp.text


def test_schedule_slot_own_references_created_and_returned():
    tenant_a = _tenant()
    body = {**_schedule_refs(tenant_a), "day_of_week": "2", "start_time": "10:00:00", "end_time": "11:00:00"}
    resp = client.post("/api/v1/schedule/", json=body, headers=_admin_headers(tenant_a))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["class_id"] == body["class_id"] and data["start_time"] == "10:00"
    # Le frontend invalide le cache avec tenant_id/class_id de la réponse.
    assert data["tenant_id"] == tenant_a


def test_schedule_slot_update_refuses_foreign_room():
    tenant_a, tenant_b = _tenant(), _tenant()
    body = {**_schedule_refs(tenant_a), "day_of_week": 3, "start_time": "08:00:00", "end_time": "09:00:00"}
    headers = _admin_headers(tenant_a)
    slot_id = client.post("/api/v1/schedule/", json=body, headers=headers).json()["id"]
    resp = client.put(f"/api/v1/schedule/{slot_id}/", json={"room_id": _schedule_refs(tenant_b)["room_id"]},
                      headers=headers)
    assert resp.status_code == 404, resp.text


# --- Second parcours (champs *_id texte remplis d'UUID), 2026-11-11 -------

PG_ONLY_SECOND = [
    # Tables opérationnelles créées par migration.
    ("/api/v1/admissions/", lambda f: {"student_first_name": "A", "student_last_name": "B",
                                        "parent_first_name": "P", "parent_last_name": "Q",
                                        "parent_email": "p@ecole.gn", "parent_phone": "+224600000000",
                                        "academic_year_id": f["year"]}),
    ("/api/v1/analytics/elearning/courses/", lambda f: {"title": "Cours", "subject_id": f["subject"]}),
    ("/api/v1/communication/conversations/", lambda f: {"recipient_id": f["user"]}),
    ("/api/v1/inventory/orders/", lambda f: {"student_id": f["student"], "items": [],
                                              "total_amount": 0, "payment_method": "CASH"}),
]


@pytest.mark.skipif(not IS_POSTGRES, reason="tables opérationnelles (PostgreSQL)")
@pytest.mark.parametrize("path,make_body", PG_ONLY_SECOND, ids=[p for p, _ in PG_ONLY_SECOND])
def test_foreign_reference_refused_operational_tables(path, make_body):
    tenant_a = _tenant()
    resp = client.post(path, json=make_body(_foreign_rows()), headers=_admin_headers(tenant_a))
    assert resp.status_code in (400, 404), f"{path} -> {resp.status_code} {resp.text}"
    assert "invalide" in resp.text or "introuvable" in resp.text


def test_malformed_reference_is_422_not_500():
    tenant_a = _tenant()
    resp = client.post("/api/v1/communication/conversations/", json={"recipient_id": "pas-un-uuid"},
                       headers=_admin_headers(tenant_a))
    assert resp.status_code == 422, resp.text


@pytest.mark.skipif(not IS_POSTGRES, reason="inventory_categories : table opérationnelle (PostgreSQL)")
def test_inventory_item_refuses_foreign_category():
    from sqlalchemy import text
    tenant_a, tenant_b = _tenant(), _tenant()
    category = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("INSERT INTO inventory_categories (id, tenant_id, name) VALUES (:id, :tid, 'Fournitures B')"),
                   {"id": category, "tid": tenant_b})
        db.commit()
    resp = client.post("/api/v1/inventory/items/", json={"name": "Cahier", "category_id": category},
                       headers=_admin_headers(tenant_a))
    assert resp.status_code == 404, resp.text
