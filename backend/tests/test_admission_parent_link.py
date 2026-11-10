"""A3 : la conversion d'une candidature rattache le parent à l'élève.

Avant : seules les coordonnées du parent étaient recopiées en texte ; aucun
compte parent ni lien `parent_students`, donc le parent ne voyait pas son
enfant dans le portail.
"""
import uuid

import pytest
from conftest import get_test_client

from test_admission_convert_student import (  # noqa: F401 — fixture autouse de nettoyage
    BASE,
    HEADERS,
    _as,
    _application,
    _clear,
    _convert,
    _tenant,
)

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.models.admission import AdmissionApplication, AdmissionStatus  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Student  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402


def _email() -> str:
    return f"parent.{uuid.uuid4().hex[:10]}@example.com"


def _account(tid: str, email: str, role: str) -> str:
    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=uid, tenant_id=tid, email=email, username=email, is_active=True))
        db.flush()
        db.add(UserRole(tenant_id=tid, user_id=uid, role=role))
        db.commit()
    return uid


def _links(student_id: str) -> list[str]:
    with SessionLocal() as db:
        return [str(r.parent_id) for r in db.query(ParentStudent).filter(ParentStudent.student_id == student_id)]


def _users(email: str) -> list[User]:
    with SessionLocal() as db:
        return db.query(User).filter(User.email == email).all()


def test_new_parent_gets_a_pending_account_linked_to_the_child():
    tid, email = _tenant(), _email()
    response = _convert(tid, _application(tid, parent_email=email))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["parent_link"] == {"status": "created"}
    [parent] = _users(email)
    assert str(parent.tenant_id) == tid
    assert (parent.first_name, parent.last_name) == ("Mamadou", "Bangoura")
    assert parent.is_active is False and parent.password_hash is None and parent.must_change_password is True
    with SessionLocal() as db:
        roles = [r.role for r in db.query(UserRole).filter(UserRole.user_id == parent.id)]
    assert roles == ["PARENT"]
    assert _links(body["student_id"]) == [str(parent.id)]


def test_existing_parent_of_the_school_is_linked_without_new_account():
    tid, email = _tenant(), _email()
    parent_id = _account(tid, email, "PARENT")

    body = _convert(tid, _application(tid, parent_email=email.upper())).json()

    assert body["parent_link"] == {"status": "linked"}
    assert _links(body["student_id"]) == [parent_id]
    assert len(_users(email)) == 1


def test_siblings_share_one_parent_account():
    tid, email = _tenant(), _email()
    first = _convert(tid, _application(tid, parent_email=email)).json()
    second = _convert(tid, _application(tid, parent_email=email, last="Bangoura-Diallo")).json()

    assert first["parent_link"]["status"] == "created"
    assert second["parent_link"]["status"] == "linked"
    [parent] = _users(email)
    assert _links(first["student_id"]) == _links(second["student_id"]) == [str(parent.id)]


def test_account_of_another_school_is_never_linked_nor_named():
    other, tid, email = _tenant(), _tenant(), _email()
    foreign_id = _account(other, email, "PARENT")

    response = _convert(tid, _application(tid, parent_email=email))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["parent_link"] == {"status": "skipped", "reason": "email_in_use"}
    assert _links(body["student_id"]) == []
    assert [str(u.id) for u in _users(email)] == [foreign_id]
    assert other not in response.text and foreign_id not in response.text
    with SessionLocal() as db:
        assert db.query(Student).filter(Student.id == body["student_id"]).one().parent_email == email


def test_non_parent_account_of_the_school_is_not_linked():
    tid, email = _tenant(), _email()
    _account(tid, email, "TEACHER")

    body = _convert(tid, _application(tid, parent_email=email)).json()

    assert body["parent_link"] == {"status": "skipped", "reason": "email_in_use"}
    assert _links(body["student_id"]) == []


def test_missing_parent_email_is_reported():
    tid = _tenant()
    body = _convert(tid, _application(tid, parent_email="  ")).json()

    assert body["parent_link"] == {"status": "skipped", "reason": "no_email"}
    assert _links(body["student_id"]) == []


def test_secretary_converts_but_creates_no_account_nor_link():
    """`admissions:write` (secrétariat) n'inclut pas `settings:write` : la
    conversion ne doit pas devenir un moyen détourné de créer des comptes."""
    tid, email = _tenant(), _email()
    aid = _application(tid, parent_email=email)

    response = _as(tid, roles=("SECRETARY",)).post(f"{BASE}/{aid}/convert/", json={}, headers=HEADERS)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["parent_link"] == {"status": "skipped", "reason": "not_permitted"}
    assert _users(email) == []
    assert _links(body["student_id"]) == []


@pytest.mark.skipif(engine.dialect.name != "postgresql",
                    reason="pysqlite valide le point de sauvegarde du matricule ; la production est sur PostgreSQL")
def test_failure_while_linking_leaves_nothing_half_done(monkeypatch):
    from app.services import admission_parent_link

    def broken(*args, **kwargs):
        raise RuntimeError("panne simulée")

    monkeypatch.setattr(admission_parent_link, "attach_parent", broken)
    tid, email = _tenant(), _email()
    aid = _application(tid, parent_email=email)

    assert _convert(tid, aid).status_code == 500

    with SessionLocal() as db:
        assert db.query(Student).filter(Student.tenant_id == tid).count() == 0
        application = db.query(AdmissionApplication).filter(AdmissionApplication.id == aid).one()
        assert application.status == AdmissionStatus.ACCEPTED
    assert _users(email) == []
