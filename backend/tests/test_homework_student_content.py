"""Remises : contenu éditable par son propriétaire, jamais après notation.

PostgreSQL utilise les tables migrées ; SQLite utilise une base isolée avec
la même forme de tables opérationnelles pour jouer les contrôles HTTP.
"""
import uuid
from datetime import date
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from conftest import get_test_client

client = get_test_client()

from app.core.database import Base, SessionLocal, engine, get_db
from app.core.security import create_access_token, get_current_user
from app.main import app
from app.models.tenant import Tenant
from app.models.student import Student, Gender
from app.models.user import User
from app.api.v1.endpoints.academic import homework as endpoints


@pytest.fixture
def ctx():
    if engine.dialect.name == "sqlite":
        isolated = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(isolated)
        factory = sessionmaker(bind=isolated)
        with isolated.begin() as connection:
            connection.execute(text("CREATE TABLE homework (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, title TEXT)"))
            connection.execute(text("""CREATE TABLE homework_submissions (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                tenant_id TEXT NOT NULL, homework_id TEXT NOT NULL, student_id TEXT NOT NULL,
                content TEXT, grade NUMERIC, feedback TEXT, graded_at TEXT,
                graded_by TEXT, submitted_at TEXT DEFAULT CURRENT_TIMESTAMP)"""))
    else:
        isolated = None
        factory = SessionLocal
    tid, uid, sid, hid, submission_id = (str(uuid.uuid4()) for _ in range(5))
    with factory() as db:
        db.add(Tenant(id=tid, name="École Remises", slug=f"remises-{tid}", type="primary", country="GN", settings={}))
        db.flush()
        db.add(User(id=uid, tenant_id=tid, email=f"{uid}@example.com", username=uid, is_active=True))
        db.flush()
        db.add(Student(id=sid, tenant_id=tid, user_id=uid, registration_number=f"REG-{sid}",
                       first_name="Awa", last_name="Bah", gender=Gender.FEMALE, date_of_birth=date(2012, 1, 1)))
        db.flush()
        db.execute(text("INSERT INTO homework (id, tenant_id, title) VALUES (:id, :tid, 'Devoir')"), {"id": hid, "tid": tid})
        db.execute(text("""INSERT INTO homework_submissions (id,tenant_id,homework_id,student_id,content)
                           VALUES (:id,:tid,:hid,:sid,'Réponse initiale')"""),
                   {"id": submission_id, "tid": tid, "hid": hid, "sid": sid})
        db.commit()
    def database():
        with factory() as db:
            yield db
    user = {"id": uid, "tenant_id": tid, "roles": ["STUDENT"]}
    old_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user] = lambda: user
    yield dict(tid=tid, uid=uid, sid=sid, hid=hid, id=submission_id, factory=factory, user=user,
               url=f"/api/v1/homework/{hid}/submissions/{submission_id}/")
    app.dependency_overrides.clear()
    app.dependency_overrides.update(old_overrides)
    if isolated is not None:
        isolated.dispose()


def _saved(ctx):
    with ctx["factory"]() as db:
        return db.execute(text("SELECT * FROM homework_submissions WHERE id=:id"), {"id": ctx["id"]}).mappings().one()


def _headers(ctx):
    return {"Authorization": "Bearer " + create_access_token({
        "sub": ctx["user"]["id"], "tenant_id": ctx["user"]["tenant_id"], "roles": ctx["user"]["roles"],
    })}


def _put(ctx, body, url=None):
    return client.put(url or ctx["url"], json=body, headers=_headers(ctx))


def test_owner_can_edit_content_without_changing_identity_or_grade(ctx):
    response = _put(ctx, {"content": "Réponse corrigée", "grade": 20,
                                          "student_id": str(uuid.uuid4()), "graded_by": ctx["uid"]})
    assert response.status_code == 200, response.text
    saved = _saved(ctx)
    assert saved["content"] == "Réponse corrigée"
    assert saved["grade"] is None and saved["graded_by"] is None
    assert str(saved["student_id"]) == ctx["sid"]


def test_another_student_cannot_edit(ctx):
    ctx["user"]["id"] = str(uuid.uuid4())
    response = _put(ctx, {"content": "Usurpé"})
    assert response.status_code == 403
    assert _saved(ctx)["content"] == "Réponse initiale"


def test_other_tenant_cannot_edit(ctx):
    ctx["user"]["tenant_id"] = str(uuid.uuid4())
    response = _put(ctx, {"content": "Usurpé"})
    assert response.status_code == 404
    assert _saved(ctx)["content"] == "Réponse initiale"


def test_submission_must_match_homework_in_url(ctx):
    url = f"/api/v1/homework/{uuid.uuid4()}/submissions/{ctx['id']}/"
    assert _put(ctx, {"content": "Usurpé"}, url).status_code == 404
    assert _saved(ctx)["content"] == "Réponse initiale"


@pytest.mark.parametrize("grade", [0, 15])
def test_graded_submission_is_immutable(ctx, grade):
    with ctx["factory"]() as db:
        db.execute(text("UPDATE homework_submissions SET grade=:grade WHERE id=:id"), {"grade": grade, "id": ctx["id"]})
        db.commit()
    assert _put(ctx, {"content": "Trop tard"}).status_code == 409
    assert _saved(ctx)["content"] == "Réponse initiale"


@pytest.mark.parametrize("body", [{}, {"content": ""}, {"content": None}])
def test_invalid_content_is_rejected(ctx, body):
    assert _put(ctx, body).status_code == 422
    assert _saved(ctx)["content"] == "Réponse initiale"


def test_grade_recorded_between_read_and_write_blocks_edit(ctx):
    original = endpoints._can_submit_for_student
    def grade_after_authorization(*args, **kwargs):
        allowed = original(*args, **kwargs)
        with ctx["factory"]() as db:
            db.execute(text("UPDATE homework_submissions SET grade=0 WHERE id=:id"), {"id": ctx["id"]})
            db.commit()
        return allowed
    with patch.object(endpoints, "_can_submit_for_student", side_effect=grade_after_authorization):
        assert _put(ctx, {"content": "Trop tard"}).status_code == 409
    assert _saved(ctx)["content"] == "Réponse initiale"


def test_submission_cannot_target_unknown_homework(ctx):
    response = client.post(f"/api/v1/homework/{uuid.uuid4()}/submit/", json={
        "homework_id": str(uuid.uuid4()), "student_id": ctx["sid"], "content": "Réponse"}, headers=_headers(ctx))
    assert response.status_code == 404
    with ctx["factory"]() as db:
        assert db.execute(text("SELECT count(*) FROM homework_submissions")).scalar() >= 1
        assert db.execute(text("SELECT count(*) FROM homework_submissions WHERE tenant_id=:tid"), {"tid": ctx["tid"]}).scalar() == 1


def test_creation_uses_server_time_and_valid_references(ctx):
    response = client.post(f"/api/v1/homework/{ctx['hid']}/submit/", json={
        "homework_id": ctx["hid"], "student_id": ctx["sid"], "content": "Nouveau travail",
        "submitted_at": "1999-01-01T00:00:00Z", "grade": 20,
    }, headers=_headers(ctx))
    assert response.status_code == 201, response.text
    with ctx["factory"]() as db:
        row = db.execute(text("SELECT content, grade, submitted_at FROM homework_submissions WHERE id=:id"),
                         {"id": response.json()["id"]}).mappings().one()
    assert row["content"] == "Nouveau travail" and row["grade"] is None
    assert not str(row["submitted_at"]).startswith("1999")


def test_foreign_homework_is_rejected_before_insert(ctx):
    foreign_tid, foreign_hid = str(uuid.uuid4()), str(uuid.uuid4())
    with ctx["factory"]() as db:
        db.add(Tenant(id=foreign_tid, name="Autre école", slug=f"autre-{foreign_tid}", type="primary", country="GN"))
        db.flush()
        db.execute(text("INSERT INTO homework (id,tenant_id,title) VALUES (:id,:tid,'Autre devoir')"),
                   {"id": foreign_hid, "tid": foreign_tid})
        db.commit()
    response = client.post(f"/api/v1/homework/{foreign_hid}/submit/", json={
        "homework_id": foreign_hid, "student_id": ctx["sid"], "content": "Usurpé",
    }, headers=_headers(ctx))
    assert response.status_code == 404


def test_teacher_cannot_create_for_foreign_student(ctx):
    # Sur les deux moteurs, un étudiant d'un autre tenant est refusé,
    # même si homework:write dispense le professeur du lien de propriété.
    other_tid, other_sid = str(uuid.uuid4()), str(uuid.uuid4())
    with ctx["factory"]() as db:
        db.add(Tenant(id=other_tid, name="Autre école", slug=f"autre-{other_tid}", type="primary", country="GN"))
        db.flush()
        db.add(Student(id=other_sid, tenant_id=other_tid, registration_number=f"REG-{other_sid}",
                       first_name="Mamadou", last_name="Bah", gender=Gender.MALE, date_of_birth=date(2012, 1, 1)))
        db.commit()
    ctx["user"]["roles"] = ["TEACHER"]
    response = client.post(f"/api/v1/homework/{ctx['hid']}/submit/", json={
        "homework_id": ctx["hid"], "student_id": other_sid, "content": "Usurpé",
    }, headers=_headers(ctx))
    assert response.status_code == 404


def test_body_cannot_select_a_different_homework(ctx):
    response = client.post(f"/api/v1/homework/{ctx['hid']}/submit/", json={
        "homework_id": str(uuid.uuid4()), "student_id": ctx["sid"], "content": "Usurpé",
    }, headers=_headers(ctx))
    assert response.status_code == 422


def test_recorded_grading_metadata_also_locks_content(ctx):
    with ctx["factory"]() as db:
        db.execute(text("UPDATE homework_submissions SET graded_at=CURRENT_TIMESTAMP WHERE id=:id"), {"id": ctx["id"]})
        db.commit()
    assert _put(ctx, {"content": "Trop tard"}).status_code == 409
    assert _saved(ctx)["content"] == "Réponse initiale"


def test_database_failure_does_not_report_success_or_change_content(ctx):
    from sqlalchemy.exc import SQLAlchemyError
    from sqlalchemy.orm import Session
    original = Session.execute
    def unavailable(self, statement, *args, **kwargs):
        if str(statement).lstrip().startswith("UPDATE homework_submissions SET content"):
            raise SQLAlchemyError("Simulated database outage")
        return original(self, statement, *args, **kwargs)
    with patch.object(Session, "execute", unavailable):
        assert _put(ctx, {"content": "Non enregistré"}).status_code == 503
    assert _saved(ctx)["content"] == "Réponse initiale"


def test_missing_authentication_is_rejected(ctx):
    assert client.put(ctx["url"], json={"content": "Usurpé"}).status_code == 401


def test_caller_without_homework_permission_cannot_edit(ctx):
    ctx["user"]["roles"] = []
    assert _put(ctx, {"content": "Usurpé"}).status_code == 403
    assert _saved(ctx)["content"] == "Réponse initiale"


def test_linked_parent_can_edit_own_childs_submission(ctx):
    from app.models.parent_student import ParentStudent
    parent_id = str(uuid.uuid4())
    with ctx["factory"]() as db:
        db.add(User(id=parent_id, tenant_id=ctx["tid"], email=f"{parent_id}@example.com", username=parent_id, is_active=True))
        db.flush()
        db.add(ParentStudent(id=str(uuid.uuid4()), tenant_id=ctx["tid"], parent_id=parent_id, student_id=ctx["sid"]))
        db.commit()
    ctx["user"].update(id=parent_id, roles=["PARENT"])
    assert _put(ctx, {"content": "Réponse de mon enfant"}).status_code == 200
    assert _saved(ctx)["content"] == "Réponse de mon enfant"
