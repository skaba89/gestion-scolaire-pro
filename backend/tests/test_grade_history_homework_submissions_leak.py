"""GRADE-HISTORY-LEAK-01 et HOMEWORK-SUBMISSIONS-LEAK-01 (bout en bout, base réelle).

- GET /grade-history/ (alias) ne filtrait que par établissement : un élève, un
  parent ou un ancien élève (``grades:read``) lisait les 200 dernières
  modifications de notes de tout l'établissement. La route canonique
  /grades/history/ filtrait sur ``gh.student_id``, colonne inexistante
  (erreur pour élève/parent), et était masquée par /grades/{grade_id}/ (422).
- GET /homework-submissions/ (alias) ne filtrait que par établissement : un
  élève ou un parent (``homework:read``) lisait le contenu, la note et
  l'appréciation de toutes les remises.

Les tests unitaires existants simulaient la base et vérifiaient le texte SQL :
ils n'avaient pas vu la colonne inexistante. Ceux-ci exécutent les requêtes.
"""
import datetime
import uuid

import pytest
from conftest import get_test_client
from sqlalchemy import text

client = get_test_client()

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

# SQL brut des alias (identifiants UUID comparés en texte) : PostgreSQL uniquement.
pytestmark = pytest.mark.skipif(
    settings.DATABASE_URL.startswith("sqlite"), reason="SQL brut PostgreSQL",
)

HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user_id, roles, tenant_id):
    app.dependency_overrides[get_current_user] = lambda: {
        "id": user_id, "roles": roles, "tenant_id": tenant_id, "_cycle_ids": None,
    }
    return client


@pytest.fixture
def school():
    """Deux établissements ; dans le premier, deux élèves (A lié à un compte
    élève et à un parent, B sans lien), chacun avec une note modifiée et une
    remise de devoir ; dans le second, un élève avec les mêmes données."""
    data = {"tenant": str(uuid.uuid4()), "other_tenant": str(uuid.uuid4()),
            "student_user": str(uuid.uuid4()), "parent_user": str(uuid.uuid4())}
    marker = uuid.uuid4().hex[:8]
    with SessionLocal() as db:
        for key in ("tenant", "other_tenant"):
            db.add(Tenant(id=data[key], name=f"École {key}", slug=f"leak-{data[key][:8]}",
                          type="primary", country="GN", is_active=True, settings={}))
        db.commit()
        for key in ("student_user", "parent_user"):
            db.add(User(id=data[key], tenant_id=data["tenant"], email=f"{key}-{data[key]}@example.gn",
                        username=data[key], password_hash="x", is_active=True,
                        first_name=key, last_name="Test"))
        db.commit()
        for key, tenant, user_id in (("a", data["tenant"], data["student_user"]),
                                     ("b", data["tenant"], None),
                                     ("x", data["other_tenant"], None)):
            sid = str(uuid.uuid4())
            data[f"student_{key}"] = sid
            db.add(Student(id=sid, tenant_id=tenant, user_id=user_id, first_name=f"Eleve{key}",
                           last_name=marker, registration_number=f"LK-{marker}-{key}",
                           status=StudentStatus.ACTIVE, date_of_birth=datetime.date(2015, 1, 1),
                           gender=Gender.FEMALE))
        db.commit()
        db.execute(text(
            "INSERT INTO parent_students (id, tenant_id, parent_id, student_id, created_at, updated_at) "
            "VALUES (:id, :tid, :pid, :sid, now(), now())"
        ), {"id": str(uuid.uuid4()), "tid": data["tenant"], "pid": data["parent_user"], "sid": data["student_a"]})
        for key in ("a", "b", "x"):
            tenant = data["other_tenant"] if key == "x" else data["tenant"]
            grade_id, hw_id, sub_id = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
            data[f"grade_{key}"], data[f"submission_{key}"] = grade_id, sub_id
            db.execute(text(
                "INSERT INTO grades (id, tenant_id, student_id, score, max_score, created_at, updated_at) "
                "VALUES (:id, :tid, :sid, 12, 20, now(), now())"
            ), {"id": grade_id, "tid": tenant, "sid": data[f"student_{key}"]})
            db.execute(text(
                "INSERT INTO grade_history (id, tenant_id, grade_id, old_score, new_score, change_reason, created_at) "
                "VALUES (:id, :tid, :gid, 10, 12, :reason, now())"
            ), {"id": str(uuid.uuid4()), "tid": tenant, "gid": grade_id, "reason": f"motif-{marker}-{key}"})
            db.execute(text(
                "INSERT INTO homework (id, tenant_id, title, created_at, updated_at) "
                "VALUES (:id, :tid, :title, now(), now())"
            ), {"id": hw_id, "tid": tenant, "title": f"Devoir {marker}"})
            db.execute(text(
                "INSERT INTO homework_submissions (id, tenant_id, homework_id, student_id, content, grade, feedback, submitted_at) "
                "VALUES (:id, :tid, :hid, :sid, :content, 15, :feedback, now())"
            ), {"id": sub_id, "tid": tenant, "hid": hw_id, "sid": data[f"student_{key}"],
                "content": f"copie-{marker}-{key}", "feedback": f"appreciation-{marker}-{key}"})
        db.commit()
    data["marker"] = marker
    return data


def _reasons(resp):
    assert resp.status_code == 200, resp.text
    return {row["change_reason"] for row in resp.json()}


def _contents(resp):
    assert resp.status_code == 200, resp.text
    return {row["content"] for row in resp.json()}


# ── Historique des notes : alias et route canonique ────────────────────────────

@pytest.mark.parametrize("url", ["/api/v1/grade-history/", "/api/v1/grades/history/"])
def test_student_sees_only_own_grade_history(school, url):
    m = school["marker"]
    reasons = _reasons(_as(school["student_user"], ["STUDENT"], school["tenant"]).get(url, headers=HEADERS))
    assert reasons == {f"motif-{m}-a"}


@pytest.mark.parametrize("url", ["/api/v1/grade-history/", "/api/v1/grades/history/"])
def test_parent_sees_only_children_grade_history(school, url):
    m = school["marker"]
    reasons = _reasons(_as(school["parent_user"], ["PARENT"], school["tenant"]).get(url, headers=HEADERS))
    assert reasons == {f"motif-{m}-a"}


@pytest.mark.parametrize("url", ["/api/v1/grade-history/", "/api/v1/grades/history/"])
def test_parent_cannot_target_another_students_grade(school, url):
    resp = _as(school["parent_user"], ["PARENT"], school["tenant"]).get(
        url, params={"grade_id": school["grade_b"]}, headers=HEADERS)
    assert _reasons(resp) == set()


def test_alumni_without_record_sees_nothing(school):
    resp = _as(str(uuid.uuid4()), ["ALUMNI"], school["tenant"]).get("/api/v1/grade-history/", headers=HEADERS)
    assert _reasons(resp) == set()


@pytest.mark.parametrize("url", ["/api/v1/grade-history/", "/api/v1/grades/history/"])
def test_staff_keeps_the_whole_school_history_and_never_another_school(school, url):
    m = school["marker"]
    reasons = _reasons(_as(str(uuid.uuid4()), ["TENANT_ADMIN"], school["tenant"]).get(url, headers=HEADERS))
    assert {f"motif-{m}-a", f"motif-{m}-b"} <= reasons
    assert f"motif-{m}-x" not in reasons


def test_staff_filter_by_student_works(school):
    m = school["marker"]
    resp = _as(str(uuid.uuid4()), ["TENANT_ADMIN"], school["tenant"]).get(
        "/api/v1/grade-history/", params={"student_id": school["student_b"]}, headers=HEADERS)
    assert _reasons(resp) == {f"motif-{m}-b"}


# ── Remises de devoirs : alias ─────────────────────────────────────────────────

URL_SUBMISSIONS = "/api/v1/homework-submissions/"


def test_student_sees_only_own_submissions(school):
    m = school["marker"]
    resp = _as(school["student_user"], ["STUDENT"], school["tenant"]).get(URL_SUBMISSIONS, headers=HEADERS)
    assert _contents(resp) == {f"copie-{m}-a"}
    assert f"appreciation-{m}-b" not in resp.text


def test_parent_sees_only_children_submissions(school):
    m = school["marker"]
    resp = _as(school["parent_user"], ["PARENT"], school["tenant"]).get(URL_SUBMISSIONS, headers=HEADERS)
    assert _contents(resp) == {f"copie-{m}-a"}


def test_parent_cannot_target_another_student(school):
    resp = _as(school["parent_user"], ["PARENT"], school["tenant"]).get(
        URL_SUBMISSIONS, params={"student_id": school["student_b"]}, headers=HEADERS)
    assert _contents(resp) == set()


def test_staff_keeps_school_submissions_with_student_names(school):
    m = school["marker"]
    resp = _as(str(uuid.uuid4()), ["TENANT_ADMIN"], school["tenant"]).get(URL_SUBMISSIONS, headers=HEADERS)
    rows = resp.json()
    assert {f"copie-{m}-a", f"copie-{m}-b"} <= _contents(resp)
    assert f"copie-{m}-x" not in resp.text
    by_content = {row["content"]: row for row in rows}
    # Le nom vient de la fiche élève (la jointure visait users et renvoyait None).
    assert by_content[f"copie-{m}-a"]["student"]["first_name"] == "Elevea"
