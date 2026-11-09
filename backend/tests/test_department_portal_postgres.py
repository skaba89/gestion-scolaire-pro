"""Portail chef de département — régression R3 (recette E2E des portails).

Sur PostgreSQL, trois routes répondaient 500 :
- /dashboard/ : `attendance.class_id` (la colonne est `classroom_id`) ;
- /classrooms/ : `c.section` (colonne inexistante) ;
- /schedule/ : table `schedules` (la table est `schedule`).
Six requêtes comparaient aussi le statut d'inscription à 'active' (stocké
'ACTIVE') : élèves et rapports toujours vides. Et les « activités récentes »
du tableau de bord listaient les notes de TOUT l'établissement.
"""
import uuid
from datetime import date, datetime, time

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.assessment import Assessment  # noqa: E402
from app.models.associations import classroom_departments  # noqa: E402
from app.models.attendance import Attendance  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.department import Department  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.schedule import ScheduleSlot  # noqa: E402
from app.models.student import Gender, Student  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.term import Term  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Tables opérationnelles (department_members, teacher_assignments) "
           "PostgreSQL uniquement ; ces erreurs n'apparaissent qu'en PostgreSQL.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

BASE = "/api/v1/department-portal"


@pytest.fixture
def ctx():
    keys = ["tid", "other_tid", "head", "other_head", "dept", "other_dept", "year", "term", "level",
            "class_in", "class_out", "other_class", "subject", "pupil_in", "pupil_out", "other_pupil", "teacher",
            "other_year"]
    x = {k: str(uuid.uuid4()) for k in keys}
    with SessionLocal() as db:
        for tid in ("tid", "other_tid"):
            db.add(Tenant(id=x[tid], name=f"École {tid}", slug=f"deptp-{x[tid][:12]}", type="secondary",
                          country="GN", is_active=True, settings={}))
        db.flush()
        for uid, tid in (("head", "tid"), ("other_head", "other_tid"), ("teacher", "tid")):
            db.add(User(id=x[uid], tenant_id=x[tid], email=f"{x[uid][:12]}@example.com",
                        username=f"u-{x[uid][:12]}", first_name="Prof", last_name=uid, is_active=True))
        db.add(AcademicYear(id=x["year"], tenant_id=x["tid"], name="2026-2027", code=f"Y-{x['year'][:6]}",
                            start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True))
        db.add(AcademicYear(id=x["other_year"], tenant_id=x["other_tid"], name="2026-2027",
                            code=f"X-{x['other_year'][:6]}", start_date=date(2026, 9, 1),
                            end_date=date(2027, 6, 30), is_current=True))
        db.add(Level(id=x["level"], tenant_id=x["tid"], name="Terminale", order_index=1))
        db.flush()
        db.add(Department(id=x["dept"], tenant_id=x["tid"], name="Sciences", head_id=x["head"]))
        db.add(Department(id=x["other_dept"], tenant_id=x["other_tid"], name="Lettres", head_id=x["other_head"]))
        db.add(Term(id=x["term"], tenant_id=x["tid"], academic_year_id=x["year"], name="Trimestre 1",
                    start_date=date(2026, 9, 1), end_date=date(2026, 12, 20), sequence_number=1))
        db.add(Subject(id=x["subject"], tenant_id=x["tid"], name="Physique", coefficient=3))
        for cid, tid, name in (("class_in", "tid", "TS1"), ("class_out", "tid", "TL1"),
                               ("other_class", "other_tid", "Autre école")):
            db.add(Classroom(id=x[cid], tenant_id=x[tid], name=name,
                             level_id=x["level"] if cid == "class_in" else None,
                             academic_year_id=x["year"] if tid == "tid" else x["other_year"]))
        db.flush()
        db.execute(classroom_departments.insert().values(
            tenant_id=x["tid"], class_id=x["class_in"], department_id=x["dept"]))
        db.execute(classroom_departments.insert().values(
            tenant_id=x["other_tid"], class_id=x["other_class"], department_id=x["other_dept"]))
        for sid, tid, cid, last in (("pupil_in", "tid", "class_in", "Camara"),
                                    ("pupil_out", "tid", "class_out", "Sylla"),
                                    ("other_pupil", "other_tid", "other_class", "Bah")):
            db.add(Student(id=x[sid], tenant_id=x[tid], registration_number=f"DP-{x[sid][:12]}",
                           first_name="Élève", last_name=last, date_of_birth=date(2008, 1, 1),
                           gender=Gender.MALE))
            db.flush()
            db.add(Enrollment(id=str(uuid.uuid4()), tenant_id=x[tid], student_id=x[sid], class_id=x[cid],
                              academic_year_id=x["year"] if tid == "tid" else x["other_year"], status="ACTIVE"))
        for sid, cid, score in (("pupil_in", "class_in", 16), ("pupil_out", "class_out", 4)):
            aid = str(uuid.uuid4())
            db.add(Assessment(id=aid, tenant_id=x["tid"], name=f"Devoir {score}", subject_id=x["subject"],
                              term_id=x["term"], academic_year_id=x["year"], class_id=x[cid],
                              date=datetime(2026, 10, 1), max_score=20, weight=1))
            db.flush()
            db.add(Grade(id=str(uuid.uuid4()), tenant_id=x["tid"], student_id=x[sid], assessment_id=aid,
                         subject_id=x["subject"], score=score, max_score=20, coefficient=1))
        db.add(Attendance(id=str(uuid.uuid4()), tenant_id=x["tid"], student_id=x["pupil_in"],
                          classroom_id=x["class_in"], status="PRESENT", date=date.today()))
        db.add(ScheduleSlot(id=str(uuid.uuid4()), tenant_id=x["tid"], class_id=x["class_in"], subject_id=x["subject"],
                        teacher_id=x["teacher"], day_of_week=1, start_time=time(8, 0), end_time=time(10, 0)))
        db.commit()
    yield x
    app.dependency_overrides.pop(get_current_user, None)


def _get(x, path, head="head", tid="tid"):
    user = {"id": x[head], "roles": ["DEPARTMENT_HEAD"], "tenant_id": x[tid]}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user["tenant_id"], "roles": user["roles"]})
    return client.get(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"})


def test_dashboard_counts_department_only_and_does_not_leak_other_grades(ctx):
    response = _get(ctx, "/dashboard/")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["stats"]["totalStudents"] == 1  # ACTIVE, élève de TS1 seulement
    assert body["stats"]["attendanceRate"] == 100
    descriptions = [a["description"] for a in body["recent_activities"]]
    assert any("Camara" in d for d in descriptions)
    assert not any("Sylla" in d for d in descriptions), "note d'un élève hors département exposée"


def test_classrooms_lists_department_classes_with_level(ctx):
    response = _get(ctx, "/classrooms/")
    assert response.status_code == 200, response.text
    assert [(c["name"], c["level_name"], c["section"]) for c in response.json()] == [("TS1", "Terminale", None)]


def test_schedule_reads_the_real_schedule_table(ctx):
    response = _get(ctx, "/schedule/")
    assert response.status_code == 200, response.text
    slots = response.json()["schedule"]
    assert [(s["classroom"]["name"], s["subject"]["name"], s["start_time"]) for s in slots] == [
        ("TS1", "Physique", "08:00:00"),
    ]


def test_students_lists_active_enrolled_pupils(ctx):
    response = _get(ctx, "/students/")
    assert response.status_code == 200, response.text
    names = [s.get("last_name") for s in response.json()["students"]]
    assert names == ["Camara"]


def test_other_school_head_sees_only_their_own_department(ctx):
    for path in ("/classrooms/", "/schedule/", "/students/"):
        response = _get(ctx, path, head="other_head", tid="other_tid")
        assert response.status_code == 200, (path, response.text)
        text = response.text
        assert "TS1" not in text and "Camara" not in text and "Physique" not in text, path
