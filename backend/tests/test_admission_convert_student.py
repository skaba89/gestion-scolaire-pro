"""POST /admissions/{id}/convert/ — régression ADM-CONVERT-01 (recette B2).

Sur PostgreSQL, CHAQUE conversion d'une candidature acceptée en élève
échouait en 500 : l'INSERT SQL brut ne fournissait pas d'`id`
(`students.id` n'a pas de valeur par défaut en base, il est généré par
l'ORM). Le matricule automatique « nombre d'élèves + 1 » entrait aussi en
collision avec un matricule existant — y compris d'une autre école, la
contrainte d'unicité étant globale. Et une date de naissance manquante était
remplacée par la date du jour.
"""
import uuid
from datetime import date, datetime

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.admission import AdmissionApplication, AdmissionStatus  # noqa: E402
from app.models.student import Gender, Student  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

BASE = "/api/v1/admissions"
HEADERS = {"Authorization": "Bearer mock-token"}


# Établissements créés par ce module : tout ce qui leur appartient est
# supprimé après chaque test. Sans ce nettoyage, les candidatures restantes
# (reviewed_by → users) bloquaient le « DELETE FROM users » de
# test_bootstrap.py plus loin dans la suite (clé étrangère).
_CREATED_TENANTS: list[str] = []


def _tenant() -> str:
    tid = str(uuid.uuid4())
    _CREATED_TENANTS.append(tid)
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École Admissions", slug=f"adm-{tid[:12]}", type="primary",
                      country="GN", is_active=True, settings={}))
        db.commit()
    return tid


def _application(tid: str, *, status=AdmissionStatus.ACCEPTED, dob=datetime(2013, 4, 2), last="Bangoura") -> str:
    aid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(AdmissionApplication(
            id=aid, tenant_id=tid, student_first_name="Fanta", student_last_name=last,
            student_date_of_birth=dob, student_gender="female",
            parent_first_name="Mamadou", parent_last_name=last, parent_email=f"{aid[:8]}@example.com",
            parent_phone="+224620000000", status=status,
        ))
        db.commit()
    return aid


def _as(tid: str, roles=("TENANT_ADMIN",)):
    # Utilisateur réel : reviewed_by est une clé étrangère vers users.
    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=uid, tenant_id=tid, email=f"{uid[:12]}@example.com", username=uid, is_active=True))
        db.commit()
    user = {"id": uid, "tenant_id": tid, "roles": list(roles)}
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.pop(get_current_user, None)
    tenants = list(_CREATED_TENANTS)
    _CREATED_TENANTS.clear()
    if not tenants:
        return
    with SessionLocal() as db:
        db.query(AdmissionApplication).filter(AdmissionApplication.tenant_id.in_(tenants)).delete(synchronize_session=False)
        db.query(Student).filter(Student.tenant_id.in_(tenants)).delete(synchronize_session=False)
        db.query(User).filter(User.tenant_id.in_(tenants)).delete(synchronize_session=False)
        db.query(Tenant).filter(Tenant.id.in_(tenants)).delete(synchronize_session=False)
        db.commit()


def _convert(tid, aid, body=None):
    return _as(tid).post(f"{BASE}/{aid}/convert/", json=body if body is not None else {}, headers=HEADERS)


def test_accepted_application_becomes_a_student_linked_to_it():
    tid = _tenant()
    aid = _application(tid)

    response = _convert(tid, aid)

    assert response.status_code == 200, response.text
    body = response.json()
    with SessionLocal() as db:
        student = db.query(Student).filter(Student.id == body["student_id"]).one()
        application = db.query(AdmissionApplication).filter(AdmissionApplication.id == aid).one()
        assert str(student.tenant_id) == tid
        assert (student.first_name, student.last_name) == ("Fanta", "Bangoura")
        assert student.date_of_birth == date(2013, 4, 2)
        assert student.gender == Gender.FEMALE
        assert student.parent_name == "Mamadou Bangoura"
        assert application.status == AdmissionStatus.CONVERTED_TO_STUDENT
        assert str(application.converted_student_id) == body["student_id"]
    assert body["registration_number"] == student.registration_number


def test_generated_number_skips_one_already_taken_by_another_school():
    year = datetime.now().year
    other, tid = _tenant(), _tenant()
    taken = f"STU-{year}-0001"
    with SessionLocal() as db:
        # Le matricule a pu être pris par un test précédent : on le garantit.
        if not db.query(Student).filter(Student.registration_number == taken).first():
            db.add(Student(id=str(uuid.uuid4()), tenant_id=other, registration_number=taken,
                           first_name="Autre", last_name="École", date_of_birth=date(2010, 1, 1),
                           gender=Gender.MALE))
            db.commit()

    response = _convert(tid, _application(tid))

    assert response.status_code == 200, response.text
    assert response.json()["registration_number"] != taken


def test_explicit_number_already_used_is_a_clear_conflict_and_nothing_changes():
    tid = _tenant()
    first = _convert(tid, _application(tid), {"registration_number": f"MAN-{uuid.uuid4().hex[:8]}"})
    assert first.status_code == 200, first.text
    aid = _application(tid, last="Camara")

    response = _convert(tid, aid, {"registration_number": first.json()["registration_number"]})

    assert response.status_code == 409, response.text
    with SessionLocal() as db:
        application = db.query(AdmissionApplication).filter(AdmissionApplication.id == aid).one()
        assert application.status == AdmissionStatus.ACCEPTED
        assert application.converted_student_id is None


def test_missing_birth_date_is_never_invented():
    tid = _tenant()
    aid = _application(tid, dob=None)

    refused = _convert(tid, aid)
    assert refused.status_code == 400, refused.text
    assert "Date de naissance" in refused.json()["detail"]

    accepted = _convert(tid, aid, {"date_of_birth": "2014-09-30"})
    assert accepted.status_code == 200, accepted.text
    with SessionLocal() as db:
        assert db.query(Student).filter(Student.id == accepted.json()["student_id"]).one().date_of_birth == date(2014, 9, 30)


def test_an_application_is_converted_only_once():
    tid = _tenant()
    aid = _application(tid)
    assert _convert(tid, aid).status_code == 200

    again = _convert(tid, aid)

    assert again.status_code == 400
    with SessionLocal() as db:
        assert db.query(Student).filter(Student.tenant_id == tid).count() == 1


@pytest.mark.parametrize("status", [AdmissionStatus.SUBMITTED, AdmissionStatus.UNDER_REVIEW, AdmissionStatus.REJECTED])
def test_only_accepted_applications_are_converted(status):
    tid = _tenant()
    assert _convert(tid, _application(tid, status=status)).status_code == 400


def test_another_school_cannot_convert_the_application():
    tid, other = _tenant(), _tenant()
    aid = _application(tid)

    assert _convert(other, aid).status_code == 404
    with SessionLocal() as db:
        assert db.query(AdmissionApplication).filter(AdmissionApplication.id == aid).one().status == AdmissionStatus.ACCEPTED


def test_roles_without_admissions_write_are_refused():
    tid = _tenant()
    aid = _application(tid)
    for role in ("TEACHER", "PARENT", "STUDENT"):
        assert _as(tid, roles=(role,)).post(f"{BASE}/{aid}/convert/", json={}, headers=HEADERS).status_code == 403
