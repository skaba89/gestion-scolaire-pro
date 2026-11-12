"""E-learning : modules, leçons, progression (2026-11-12).

Tables opérationnelles (créées par migration) : PostgreSQL uniquement.
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
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL", "").startswith("postgresql"),
    reason="tables e-learning opérationnelles : PostgreSQL",
)

STAFF = "/api/v1/analytics/elearning"
ME = "/api/v1/me/elearning"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _id() -> str:
    return str(uuid.uuid4())


def _add(obj):
    with SessionLocal() as db:
        db.add(obj)
        db.commit()


def _tenant() -> str:
    tid = _id()
    _add(Tenant(id=tid, name="École E-learning", slug=f"el-{tid[:8]}", type="secondary",
                country="GN", is_active=True, settings={}))
    return tid


def _user(tid: str) -> str:
    uid = _id()
    _add(User(id=uid, tenant_id=tid, email=f"u.{uid[:8]}@ecole.gn", username=f"u.{uid[:8]}",
              first_name="A", last_name="B", password_hash="x", is_active=True))
    return uid


def _as(uid: str, tid: str, roles) -> dict:
    user = {"id": uid, "roles": list(roles), "tenant_id": tid}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": uid, "tenant_id": tid, "roles": list(roles)})
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tid}


def _level(tid: str, name="6ème") -> str:
    lid = _id()
    _add(Level(id=lid, tenant_id=tid, name=name, order_index=1))
    return lid


def _student_in_level(tid: str, level_id: str) -> str:
    """Compte élève inscrit (ACTIVE) dans une classe du niveau donné."""
    uid = _user(tid)
    year, cls, sid = _id(), _id(), _id()
    _add(AcademicYear(id=year, tenant_id=tid, name="2026-2027", code=f"Y{year[:6]}",
                      start_date=date(2026, 9, 1), end_date=date(2027, 7, 1), is_current=True))
    _add(Classroom(id=cls, tenant_id=tid, name="6ème A", level_id=level_id, academic_year_id=year))
    _add(Student(id=sid, tenant_id=tid, user_id=uid, registration_number=f"R{sid[:8]}", first_name="E",
                 last_name="L", date_of_birth=date(2012, 1, 1), gender=Gender.MALE, status=StudentStatus.ACTIVE))
    _add(Enrollment(id=_id(), tenant_id=tid, student_id=sid, class_id=cls, academic_year_id=year, status="ACTIVE"))
    return uid


def _course(tid: str, teacher_id: str, *, level_id=None, published=True) -> str:
    cid = _id()
    with SessionLocal() as db:
        db.execute(text(
            "INSERT INTO elearning_courses (id, tenant_id, title, teacher_id, level_id, is_published) "
            "VALUES (:id, :tid, 'Algèbre', :teacher, :level, :pub)"
        ), {"id": cid, "tid": tid, "teacher": teacher_id, "level": level_id, "pub": published})
        db.commit()
    return cid


def _build(tid: str, teacher: str, course: str, *, published_lesson=True) -> tuple[str, str]:
    h = _as(teacher, tid, ["TEACHER"])
    module = client.post(f"{STAFF}/courses/{course}/modules/", json={"title": "Équations"}, headers=h)
    assert module.status_code == 201, module.text
    lesson = client.post(f"{STAFF}/modules/{module.json()['id']}/lessons/", headers=h, json={
        "title": "Introduction", "content": "Une équation…", "resource_url": "https://exemple.org/v",
        "lesson_type": "video", "duration_minutes": 20, "is_published": published_lesson})
    assert lesson.status_code == 201, lesson.text
    return module.json()["id"], lesson.json()["id"]


# ─── Personnel ────────────────────────────────────────────────────────────

def test_author_teacher_builds_a_course_and_reads_it_back():
    tid = _tenant()
    teacher = _user(tid)
    course = _course(tid, teacher)
    module_id, lesson_id = _build(tid, teacher, course)
    content = client.get(f"{STAFF}/courses/{course}/content/", headers=_as(teacher, tid, ["TEACHER"])).json()
    assert content["modules"][0]["id"] == module_id
    assert content["modules"][0]["lessons"][0]["id"] == lesson_id
    assert content["modules"][0]["lessons"][0]["resource_url"] == "https://exemple.org/v"


def test_other_teacher_cannot_edit_but_admin_can():
    tid = _tenant()
    author, other = _user(tid), _user(tid)
    course = _course(tid, author)
    module_id, lesson_id = _build(tid, author, course)
    h_other = _as(other, tid, ["TEACHER"])
    assert client.post(f"{STAFF}/courses/{course}/modules/", json={"title": "X"}, headers=h_other).status_code == 403
    assert client.put(f"{STAFF}/lessons/{lesson_id}/", json={"title": "X"}, headers=h_other).status_code == 403
    assert client.delete(f"{STAFF}/modules/{module_id}/", headers=h_other).status_code == 403
    assert client.put(f"{STAFF}/courses/{course}/", json={"title": "X"}, headers=h_other).status_code == 403
    assert client.delete(f"{STAFF}/courses/{course}/", headers=h_other).status_code == 403
    h_admin = _as(_user(tid), tid, ["TENANT_ADMIN"])
    resp = client.put(f"{STAFF}/lessons/{lesson_id}/", json={"title": "Introduction (revue)"}, headers=h_admin)
    assert resp.status_code == 200 and resp.json()["title"] == "Introduction (revue)"


def test_other_school_cannot_see_or_touch_the_course():
    tid, other_tid = _tenant(), _tenant()
    teacher = _user(tid)
    course = _course(tid, teacher)
    module_id, lesson_id = _build(tid, teacher, course)
    h = _as(_user(other_tid), other_tid, ["TENANT_ADMIN"])
    assert client.get(f"{STAFF}/courses/{course}/content/", headers=h).status_code == 404
    assert client.post(f"{STAFF}/modules/{module_id}/lessons/", json={"title": "X"}, headers=h).status_code == 404
    assert client.delete(f"{STAFF}/lessons/{lesson_id}/", headers=h).status_code == 404


def test_lesson_link_must_be_https():
    tid = _tenant()
    teacher = _user(tid)
    course = _course(tid, teacher)
    module_id, _ = _build(tid, teacher, course)
    resp = client.post(f"{STAFF}/modules/{module_id}/lessons/", headers=_as(teacher, tid, ["TEACHER"]),
                       json={"title": "X", "resource_url": "javascript:alert(1)"})
    assert resp.status_code == 422, resp.text


def test_student_cannot_write_and_parent_has_no_student_space():
    tid = _tenant()
    teacher = _user(tid)
    course = _course(tid, teacher)
    student = _student_in_level(tid, _level(tid))
    h = _as(student, tid, ["STUDENT"])
    assert client.post(f"{STAFF}/courses/{course}/modules/", json={"title": "X"}, headers=h).status_code == 403
    assert client.get(f"{ME}/courses/", headers=_as(_user(tid), tid, ["PARENT"])).status_code == 403


def test_deleting_a_module_removes_its_lessons_and_is_audited():
    tid = _tenant()
    teacher = _user(tid)
    course = _course(tid, teacher)
    module_id, lesson_id = _build(tid, teacher, course)
    assert client.delete(f"{STAFF}/modules/{module_id}/", headers=_as(teacher, tid, ["TEACHER"])).status_code == 204
    with SessionLocal() as db:
        assert db.execute(text("SELECT count(*) FROM elearning_lessons WHERE id = :id"), {"id": lesson_id}).scalar() == 0
        assert db.execute(text("SELECT count(*) FROM audit_logs WHERE action = 'DELETE_ELEARNING_MODULE' "
                               "AND resource_id = :id"), {"id": module_id}).scalar() == 1


# ─── Élève ────────────────────────────────────────────────────────────────

def test_student_sees_published_lessons_of_courses_for_their_level_only():
    tid = _tenant()
    teacher = _user(tid)
    level, other_level = _level(tid), _level(tid, "5ème")
    student = _student_in_level(tid, level)
    mine = _course(tid, teacher, level_id=level)
    any_level = _course(tid, teacher)
    other = _course(tid, teacher, level_id=other_level)
    draft_course = _course(tid, teacher, level_id=level, published=False)
    _, published = _build(tid, teacher, mine)
    _, draft_lesson = _build(tid, teacher, mine, published_lesson=False)
    h = _as(student, tid, ["STUDENT"])

    listed = {c["id"]: c for c in client.get(f"{ME}/courses/", headers=h).json()}
    assert set(listed) == {mine, any_level}
    assert listed[mine]["lesson_count"] == 1 and listed[mine]["completed_count"] == 0

    detail = client.get(f"{ME}/courses/{mine}/", headers=h).json()
    lesson_ids = [l["id"] for m in detail["modules"] for l in m["lessons"]]
    assert lesson_ids == [published]
    assert draft_lesson not in lesson_ids
    for hidden in (other, draft_course):
        assert client.get(f"{ME}/courses/{hidden}/", headers=h).status_code == 404
    assert client.post(f"{ME}/lessons/{draft_lesson}/complete/", headers=h).status_code == 404


def test_completing_a_lesson_is_idempotent_and_counted():
    tid = _tenant()
    teacher = _user(tid)
    level = _level(tid)
    student = _student_in_level(tid, level)
    course = _course(tid, teacher, level_id=level)
    _, lesson = _build(tid, teacher, course)
    h = _as(student, tid, ["STUDENT"])
    for _ in range(2):
        resp = client.post(f"{ME}/lessons/{lesson}/complete/", headers=h)
        assert resp.status_code == 200, resp.text
    with SessionLocal() as db:
        assert db.execute(text("SELECT count(*) FROM elearning_lesson_progress WHERE lesson_id = :l"),
                          {"l": lesson}).scalar() == 1
    assert client.get(f"{ME}/courses/", headers=h).json()[0]["completed_count"] == 1
    detail = client.get(f"{ME}/courses/{course}/", headers=h).json()
    assert detail["modules"][0]["lessons"][0]["completed"] is True


def test_student_of_another_school_cannot_complete_the_lesson():
    tid, other_tid = _tenant(), _tenant()
    teacher = _user(tid)
    course = _course(tid, teacher)
    _, lesson = _build(tid, teacher, course)
    outsider = _student_in_level(other_tid, _level(other_tid))
    assert client.post(f"{ME}/lessons/{lesson}/complete/",
                       headers=_as(outsider, other_tid, ["STUDENT"])).status_code == 404


def test_course_published_from_the_admin_form_status_is_visible():
    """La page admin enregistre « Publié » dans `status`, pas dans `is_published`."""
    tid = _tenant()
    teacher = _user(tid)
    student = _student_in_level(tid, _level(tid))
    course = _course(tid, teacher, published=False)
    _build(tid, teacher, course)
    h = _as(student, tid, ["STUDENT"])
    assert client.get(f"{ME}/courses/", headers=h).json() == []
    with SessionLocal() as db:
        db.execute(text("UPDATE elearning_courses SET status = 'published' WHERE id = :id"), {"id": course})
        db.commit()
    assert [c["id"] for c in client.get(f"{ME}/courses/", headers=h).json()] == [course]


def test_admin_statistics_follow_real_lesson_progress():
    """Les participations viennent de la progression (elearning_enrollments
    n'est alimentée par aucune route : les statistiques restaient à 0)."""
    tid, other_tid = _tenant(), _tenant()
    teacher = _user(tid)
    level = _level(tid)
    student = _student_in_level(tid, level)
    course = _course(tid, teacher, level_id=level)
    _, lesson = _build(tid, teacher, course)
    _build(tid, teacher, course)  # 2e leçon publiée : 1 sur 2 terminée
    admin = _as(_user(tid), tid, ["TENANT_ADMIN"])
    assert client.get(f"{STAFF}/enrollments/", headers=admin).json() == []

    assert client.post(f"{ME}/lessons/{lesson}/complete/", headers=_as(student, tid, ["STUDENT"])).status_code == 200
    rows = client.get(f"{STAFF}/enrollments/", headers=_as(_user(tid), tid, ["TENANT_ADMIN"])).json()
    assert len(rows) == 1
    assert rows[0]["course_id"] == course and rows[0]["progress_pct"] == 50 and rows[0]["completed_at"] is None
    courses = client.get(f"{STAFF}/courses/", headers=_as(_user(tid), tid, ["TENANT_ADMIN"])).json()
    assert next(c for c in courses if str(c["id"]) == course)["enrolled_count"] == 1
    # Un autre établissement ne voit rien.
    assert client.get(f"{STAFF}/enrollments/", headers=_as(_user(other_tid), other_tid, ["TENANT_ADMIN"])).json() == []
