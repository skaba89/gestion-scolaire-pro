"""TEACHER-RECIPIENTS-STATUS-01 (2026-11-24) : destinataires de la messagerie enseignant.

``GET /communication/messaging/teacher-recipients/`` :
- comparait ``e.status = 'active'`` (statut stocké « ACTIVE ») : un enseignant ne voyait aucun
  parent de ses élèves ;
- ne filtrait l'établissement ni sur ``parent_students`` ni sur ``users`` : un lien parent-élève
  enregistré sous un autre établissement remontait ;
- n'exigeait aucune permission : un élève ou un parent obtenait tous les enseignants, e-mails
  compris (Q-T1 : réservé au personnel, ``users:read``).
PostgreSQL uniquement (``teacher_assignments`` créée hors ORM).
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client
from sqlalchemy import text

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import AcademicYear, Classroom, Enrollment, ParentStudent, Tenant, User, UserRole  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402

pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="teacher_assignments : PostgreSQL")
URL = "/api/v1/communication/messaging/teacher-recipients/"
HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user_id, tenant_id, role):
    user = {"id": str(user_id), "roles": [role], "tenant_id": str(tenant_id), "_cycle_ids": None}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _user(db, tenant_id, role, name):
    uid = uuid.uuid4()
    db.add(User(id=uid, tenant_id=tenant_id, email=f"{name}-{uid.hex[:8]}@example.gn", username=uid.hex,
                password_hash="x", is_active=True, first_name=name, last_name="Test"))
    db.flush()
    db.add(UserRole(tenant_id=tenant_id, user_id=uid, role=role))
    return uid


@pytest.fixture
def school():
    t, other = uuid.uuid4(), uuid.uuid4()
    with SessionLocal() as db:
        for tid in (t, other):
            db.add(Tenant(id=tid, name="École Messagerie", slug=f"msg-{tid.hex[:8]}", type="primary",
                          country="GN", is_active=True, settings={}))
        db.flush()
        ids = {
            "teacher": _user(db, t, "TEACHER", "enseignant"),
            "colleague": _user(db, t, "TEACHER", "collegue"),
            "parent": _user(db, t, "PARENT", "parent"),
            "pupil_user": _user(db, t, "STUDENT", "eleve"),
            "foreign_parent": _user(db, other, "PARENT", "etranger"),
        }
        year = AcademicYear(tenant_id=t, name="2026-2027", code=f"Y-{t.hex[:6]}", start_date=date(2026, 9, 1),
                            end_date=date(2027, 7, 1), is_current=True)
        klass = Classroom(tenant_id=t, name="CM1 A")
        db.add_all([year, klass])
        db.flush()
        student = Student(tenant_id=t, registration_number=f"R-{t.hex[:6]}", first_name="Fanta", last_name="Diallo",
                          date_of_birth=date(2016, 1, 1), gender=Gender.FEMALE, status=StudentStatus.ACTIVE)
        db.add(student)
        db.flush()
        db.add(Enrollment(tenant_id=t, student_id=student.id, class_id=klass.id, academic_year_id=year.id, status="ACTIVE"))
        db.add(ParentStudent(id=uuid.uuid4(), tenant_id=t, parent_id=ids["parent"], student_id=student.id))
        # Lien enregistré sous l'autre établissement : ne doit jamais remonter.
        db.add(ParentStudent(id=uuid.uuid4(), tenant_id=other, parent_id=ids["foreign_parent"], student_id=student.id))
        for teacher in ("teacher", "colleague"):
            db.execute(text("INSERT INTO teacher_assignments (tenant_id, user_id, classroom_id) "
                            "VALUES (CAST(:t AS uuid), CAST(:u AS uuid), CAST(:c AS uuid))"),
                       {"t": str(t), "u": str(ids[teacher]), "c": str(klass.id)})
        db.commit()
    return {"tenant": t, **ids}


def _ids(response):
    assert response.status_code == 200, response.text
    return {(item["id"], item["info"]) for item in response.json()}


def test_teacher_sees_the_parents_of_his_pupils_and_his_colleagues(school):
    seen = _ids(client.get(URL, headers=_as(school["teacher"], school["tenant"], "TEACHER")))
    assert (str(school["parent"]), "Parent") in seen
    assert (str(school["colleague"]), "Enseignant") in seen
    assert all(user_id != str(school["teacher"]) for user_id, _ in seen)


def test_a_parent_link_of_another_school_never_appears(school):
    seen = _ids(client.get(URL, headers=_as(school["teacher"], school["tenant"], "TEACHER")))
    assert all(user_id != str(school["foreign_parent"]) for user_id, _ in seen)


@pytest.mark.parametrize("role, who", [("STUDENT", "pupil_user"), ("PARENT", "parent")])
def test_families_no_longer_list_every_teacher(school, role, who):
    response = client.get(URL, headers=_as(school[who], school["tenant"], role))
    assert response.status_code == 403, response.text
