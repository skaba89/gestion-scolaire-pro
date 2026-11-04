"""Réinscription par un parent connecté (2026-11-03, API-01).

La page parent « Pré-inscription » appelait trois routes publiques
inexistantes : le parcours était bloqué. Les routes authentifiées
`GET /admissions/reenrollments/mine/` et `POST /admissions/reenrollments/`
la remplacent. Ce fichier vérifie surtout ce qu'elles REFUSENT : enfant d'une
autre famille, année ou niveau d'un autre établissement, doublon, rôle sans
`admissions:reenroll`, coordonnées du parent imposées par le client.

PostgreSQL uniquement (CAST … AS uuid, opérateurs JSON), comme les autres
tests de ce domaine.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user, get_password_hash  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.admission import AdmissionApplication  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="CAST … AS uuid et opérateurs JSON : PostgreSQL uniquement (job CI PostgreSQL).",
)

MINE = "/api/v1/admissions/reenrollments/mine/"
CREATE = "/api/v1/admissions/reenrollments/"


@pytest.fixture(autouse=True)
def _clean():
    from app.api.v1.endpoints.operational.admissions import limiter
    previous = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = previous
    app.dependency_overrides.pop(get_current_user, None)


def _school() -> dict:
    """Un établissement : un parent, son enfant, l'enfant d'une autre famille,
    l'année suivante et un niveau."""
    ids = {k: str(uuid.uuid4()) for k in ("tenant", "parent", "child", "other_child", "year", "level")}
    sfx = ids["tenant"][:8]
    with SessionLocal() as db:
        db.add(Tenant(id=ids["tenant"], name="École Réinscription", slug=f"reinscr-{sfx}",
                      type="primary", country="GN", is_active=True, settings={}))
        db.commit()
        db.add(User(id=ids["parent"], tenant_id=ids["tenant"], email=f"parent.{sfx}@ecole.gn",
                    username=f"parent.{sfx}", first_name="Mamadou", last_name="Sow", phone="+224620000000",
                    password_hash=get_password_hash("Parent@2026"), is_active=True, is_verified=True))
        for key, first in (("child", "Fatoumata"), ("other_child", "Ibrahima")):
            db.add(Student(id=ids[key], tenant_id=ids["tenant"], registration_number=f"REG-{uuid.uuid4().hex[:8]}",
                           first_name=first, last_name="Sow", date_of_birth=date(2014, 3, 1),
                           gender=Gender.FEMALE, status=StudentStatus.ACTIVE))
        db.add(AcademicYear(id=ids["year"], tenant_id=ids["tenant"], name="2027-2028", code=f"AY-{sfx}",
                            start_date=date(2027, 9, 1), end_date=date(2028, 7, 1)))
        db.add(Level(id=ids["level"], tenant_id=ids["tenant"], name="CM2", order_index=6))
        db.commit()
        db.add(ParentStudent(id=str(uuid.uuid4()), tenant_id=ids["tenant"], parent_id=ids["parent"],
                             student_id=ids["child"], is_primary=True, relation_type="FATHER"))
        db.commit()
    return ids


def _as(ids: dict, role: str = "PARENT", user_id: str | None = None) -> dict:
    uid = user_id or ids["parent"]
    user = {"id": uid, "roles": [role], "tenant_id": ids["tenant"]}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": uid, "tenant_id": ids["tenant"], "roles": [role]})
    return {"Authorization": f"Bearer {token}"}


def _body(ids: dict, **over) -> dict:
    return {"student_id": ids["child"], "academic_year_id": ids["year"], "level_id": ids["level"],
            "notes": "Passage en CM2", **over}


class TestNominal:
    def test_parent_reenrolls_own_child_and_sees_the_request(self):
        ids = _school()
        h = _as(ids)
        assert client.get(MINE, params={"academic_year_id": ids["year"]}, headers=h).json() == []

        resp = client.post(CREATE, json=_body(ids), headers=h)

        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "SUBMITTED"
        mine = client.get(MINE, params={"academic_year_id": ids["year"]}, headers=h).json()
        assert [(m["student_id"], m["status"], m["level_name"]) for m in mine] == [(ids["child"], "SUBMITTED", "CM2")]

    def test_parent_contact_comes_from_the_account_not_the_request(self):
        ids = _school()
        h = _as(ids)
        resp = client.post(CREATE, json=_body(ids, parent_email="pirate@exemple.com", parent_phone="000"), headers=h)
        assert resp.status_code == 201, resp.text
        with SessionLocal() as db:
            row = db.query(AdmissionApplication).filter(AdmissionApplication.id == resp.json()["id"]).one()
            assert row.parent_email == f"parent.{ids['tenant'][:8]}@ecole.gn"
            assert row.parent_phone == "+224620000000"
            assert row.documents["type"] == "REINSCRIPTION"
            assert row.documents["student_id"] == ids["child"]

    def test_submission_is_audited_with_the_real_parent(self):
        ids = _school()
        resp = client.post(CREATE, json=_body(ids), headers=_as(ids))
        with SessionLocal() as db:
            entry = db.query(AuditLog).filter(AuditLog.resource_id == resp.json()["id"]).one()
            assert entry.action == "ADMISSION_SUBMITTED"
            assert entry.user_id == ids["parent"]


class TestRefusals:
    def test_another_familys_child_is_403_and_nothing_is_written(self):
        ids = _school()
        resp = client.post(CREATE, json=_body(ids, student_id=ids["other_child"]), headers=_as(ids))
        assert resp.status_code == 403, resp.text
        with SessionLocal() as db:
            assert db.query(AdmissionApplication).filter(AdmissionApplication.tenant_id == ids["tenant"]).count() == 0

    def test_academic_year_of_another_school_is_404(self):
        ids, other = _school(), _school()
        resp = client.post(CREATE, json=_body(ids, academic_year_id=other["year"]), headers=_as(ids))
        assert resp.status_code == 404, resp.text

    def test_level_of_another_school_is_404(self):
        ids, other = _school(), _school()
        resp = client.post(CREATE, json=_body(ids, level_id=other["level"]), headers=_as(ids))
        assert resp.status_code == 404, resp.text

    def test_second_request_for_same_child_and_year_is_409(self):
        ids = _school()
        h = _as(ids)
        assert client.post(CREATE, json=_body(ids), headers=h).status_code == 201
        assert client.post(CREATE, json=_body(ids), headers=h).status_code == 409

    def test_role_without_permission_is_403(self):
        ids = _school()
        h = _as(ids, role="TEACHER")
        assert client.post(CREATE, json=_body(ids), headers=h).status_code == 403
        assert client.get(MINE, headers=h).status_code == 403

    def test_malformed_identifier_is_422(self):
        ids = _school()
        resp = client.post(CREATE, json=_body(ids, student_id="1 OR 1=1"), headers=_as(ids))
        assert resp.status_code == 422, resp.text


class TestIsolation:
    def test_a_parent_never_sees_another_familys_requests(self):
        ids = _school()
        assert client.post(CREATE, json=_body(ids), headers=_as(ids)).status_code == 201
        # Autre parent du même établissement, sans enfant lié.
        stranger = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(User(id=stranger, tenant_id=ids["tenant"], email=f"autre.{stranger[:8]}@ecole.gn",
                        username=f"autre.{stranger[:8]}", first_name="A", last_name="B",
                        password_hash=get_password_hash("Parent@2026"), is_active=True, is_verified=True))
            db.commit()
        assert client.get(MINE, headers=_as(ids, user_id=stranger)).json() == []

    def test_requests_of_another_school_are_invisible(self):
        ids, other = _school(), _school()
        assert client.post(CREATE, json=_body(other), headers=_as(other)).status_code == 201
        assert client.get(MINE, headers=_as(ids)).json() == []
