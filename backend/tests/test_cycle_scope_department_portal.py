"""CYCLE-PORTAL-GAP-01 (2026-11-23) : portail de département × périmètre par cycle.

Département « Sciences » couvrant ``cls_cp`` (primaire) et ``cls_6e`` (collège). Le directeur,
limité au primaire, en est le chef : il ne voit que l'intersection département ∩ périmètre
(``cls_cp``). ``secretary_free`` (non restreint) en est membre et voit tout le département.

Aussi DEPT-CLASS-IDOR-01 : ``classroom_id`` reçu en filtre (élèves, présences, notes) n'était
pas vérifié dans le département — un membre listait les élèves de n'importe quelle classe.
PostgreSQL uniquement (tables du portail créées hors ORM).
"""
from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core.cycle_routes import Policy, policy_for  # noqa: E402
from app.core.database import SessionLocal, engine, switch_tenant_context  # noqa: E402
from app.models import AcademicYear  # noqa: E402
from app.models.attendance import Attendance  # noqa: E402
from app.models.term import Term  # noqa: E402
from test_cycle_scope_gate import school, structure  # noqa: E402,F401
from test_cycle_scope_students import call, world  # noqa: E402,F401

needs_postgres = pytest.mark.skipif(engine.dialect.name == "sqlite", reason="tables du portail : PostgreSQL")
P = "/department-portal"
RESTRICTED, FREE = "director", "secretary_free"

# Registre lu par test_cycle_scope_students::test_every_filtered_route_has_a_behavioural_test.
PORTAL_ROUTE_TESTS = {
    ("GET", f"{P}/dashboard/"): "test_dashboard_counts_only_the_classes_of_the_scope",
    ("GET", f"{P}/classrooms/"): "test_classrooms_are_the_intersection_of_department_and_scope",
    ("GET", f"{P}/students/"): "test_students_are_limited_and_a_foreign_class_filter_is_refused",
    ("GET", f"{P}/teachers/"): "test_teachers_schedule_and_stats_cover_only_the_scope",
    ("GET", f"{P}/schedule/"): "test_teachers_schedule_and_stats_cover_only_the_scope",
    ("GET", f"{P}/reports/stats/"): "test_teachers_schedule_and_stats_cover_only_the_scope",
    ("GET", f"{P}/attendance/"): "test_attendance_and_grades_reports_refuse_a_class_outside_the_scope",
    ("GET", f"{P}/reports/grades/"): "test_attendance_and_grades_reports_refuse_a_class_outside_the_scope",
    ("GET", f"{P}/exams/"): "test_exams_list_shows_scope_and_department_wide_exams",
    ("POST", f"{P}/exams/"): "test_exam_writes_need_a_class_of_the_scope",
    ("PUT", f"{P}/exams/{{exam_id}}/"): "test_exam_writes_need_a_class_of_the_scope",
    ("DELETE", f"{P}/exams/{{exam_id}}/"): "test_exam_writes_need_a_class_of_the_scope",
    ("GET", f"{P}/alerts/"): "test_alerts_need_every_class_in_the_scope",
    ("POST", f"{P}/alerts/"): "test_alerts_need_every_class_in_the_scope",
    ("POST", f"{P}/alerts/send/"): "test_alerts_need_every_class_in_the_scope",
}


def test_portal_routes_are_classified():
    for (method, path) in PORTAL_ROUTE_TESTS:
        assert policy_for(method, f"/api/v1{path}") is Policy.FILTERED, (method, path)
    for path in (f"{P}/my-department/", f"{P}/members/"):
        assert policy_for("GET", f"/api/v1{path}") is Policy.INDEPENDENT


@pytest.fixture
def portal(school, world):
    t = school["tenant"]
    people = school["people"]
    term, year = uuid4(), uuid4()
    with SessionLocal() as db:
        switch_tenant_context(db, str(t))
        db.execute(text("UPDATE departments SET head_id = CAST(:u AS uuid) WHERE id = CAST(:d AS uuid)"),
                   {"u": str(people[RESTRICTED]), "d": str(world["dept"])})
        db.execute(text("INSERT INTO department_members (id, tenant_id, department_id, user_id) "
                        "VALUES (CAST(:i AS uuid), CAST(:t AS uuid), CAST(:d AS uuid), CAST(:u AS uuid))"),
                   {"i": str(uuid4()), "t": str(t), "d": str(world["dept"]), "u": str(people[FREE])})
        for teacher, klass in (("teacher", "cls_cp"), ("teacher_residual", "cls_6e")):
            db.execute(text("INSERT INTO teacher_assignments (tenant_id, user_id, classroom_id, subject_id) "
                            "VALUES (CAST(:t AS uuid), CAST(:u AS uuid), CAST(:c AS uuid), CAST(:s AS uuid))"),
                       {"t": str(t), "u": str(people[teacher]), "c": str(world[klass]), "s": str(world["subject"])})
        db.commit()
        db.add(AcademicYear(id=year, tenant_id=t, name="AY-portal", code=f"AY-{year}",
                            start_date=date(2026, 9, 1), end_date=date(2027, 7, 1), is_current=False))
        db.flush()
        db.add(Term(id=term, tenant_id=t, academic_year_id=year, name="T1",
                    start_date=date(2026, 9, 1), end_date=date(2026, 12, 1)))
        for student, klass, status in (("s_cp", "cls_cp", "ABSENT"), ("s_6e", "cls_6e", "PRESENT")):
            db.add(Attendance(tenant_id=t, student_id=world[student], classroom_id=world[klass],
                              date=date.today(), status=status))
        db.commit()

    exams = {}
    for key, klass in (("exam_cp", "cls_cp"), ("exam_6e", "cls_6e"), ("exam_dept", None)):
        response = call(school, FREE, "POST", f"{P}/exams/", json={
            "name": key, "exam_date": (date.today() + timedelta(days=7)).isoformat(),
            "subject_id": str(world["subject"]), "term_id": str(term),
            "class_id": str(world[klass]) if klass else None,
        })
        assert response.status_code == 201, response.text
        exams[key] = response.json()["id"]

    yield {**world, "term": term, "exams": exams}

    with SessionLocal() as db:
        switch_tenant_context(db, str(t))
        for table in ("department_alerts", "exams", "teacher_assignments", "department_members"):
            db.execute(text(f"DELETE FROM {table} WHERE tenant_id = CAST(:t AS uuid)"), {"t": str(t)})
        db.query(Attendance).filter(Attendance.tenant_id == t).delete()
        db.query(Term).filter(Term.tenant_id == t).delete()
        db.query(AcademicYear).filter(AcademicYear.id == year).delete()
        db.commit()


def ok(school, who, method, url, **kwargs):
    response = call(school, who, method, url, **kwargs)
    assert response.status_code in (200, 201, 204), (who, method, url, response.text)
    return response.json() if response.status_code != 204 else None


def exam_count(school):
    with SessionLocal() as db:
        switch_tenant_context(db, str(school["tenant"]))
        return db.execute(text("SELECT COUNT(*) FROM exams WHERE tenant_id = CAST(:t AS uuid)"),
                          {"t": str(school["tenant"])}).scalar()


# --- Lectures ---------------------------------------------------------------------------------

@needs_postgres
def test_dashboard_counts_only_the_classes_of_the_scope(school, portal):
    restricted = ok(school, RESTRICTED, "GET", f"{P}/dashboard/")["stats"]
    free = ok(school, FREE, "GET", f"{P}/dashboard/")["stats"]
    assert (restricted["totalStudents"], restricted["totalTeachers"], restricted["upcomingExams"]) == (1, 1, 2)
    assert (free["totalStudents"], free["totalTeachers"], free["upcomingExams"]) == (2, 2, 3)


@needs_postgres
def test_classrooms_are_the_intersection_of_department_and_scope(school, portal):
    assert [c["name"] for c in ok(school, RESTRICTED, "GET", f"{P}/classrooms/")] == ["cls_cp"]
    assert sorted(c["name"] for c in ok(school, FREE, "GET", f"{P}/classrooms/")) == ["cls_6e", "cls_cp"]


@needs_postgres
def test_students_are_limited_and_a_foreign_class_filter_is_refused(school, portal):
    body = ok(school, RESTRICTED, "GET", f"{P}/students/")
    assert [s["id"] for s in body["students"]] == [str(portal["s_cp"])]
    assert [c["name"] for c in body["classrooms"]] == ["cls_cp"]
    # Classe du département mais hors périmètre : refusée, jamais listée.
    assert call(school, RESTRICTED, "GET", f"{P}/students/", params={"classroom_id": str(portal["cls_6e"])}).status_code == 404
    # DEPT-CLASS-IDOR-01 : classe hors du département, même pour un compte non restreint.
    assert call(school, FREE, "GET", f"{P}/students/", params={"classroom_id": str(portal["cls_nocycle"])}).status_code == 404
    assert len(ok(school, FREE, "GET", f"{P}/students/", params={"classroom_id": str(portal["cls_6e"])})["students"]) == 1


@needs_postgres
def test_teachers_schedule_and_stats_cover_only_the_scope(school, portal):
    teachers = ok(school, RESTRICTED, "GET", f"{P}/teachers/")["teachers"]
    assert [t["id"] for t in teachers] == [str(school["people"]["teacher"])]
    assert len(ok(school, FREE, "GET", f"{P}/teachers/")["teachers"]) == 2
    assert ok(school, RESTRICTED, "GET", f"{P}/schedule/")["schedule"] == []
    stats = ok(school, RESTRICTED, "GET", f"{P}/reports/stats/", params={"class_ids": str(portal["cls_6e"])})
    # Une classe hors périmètre demandée explicitement est ignorée : retour au périmètre seul.
    assert (stats["studentCount"], stats["teacherCount"]) == (1, 1)
    assert [c["name"] for c in stats["studentsPerClass"]] == ["cls_cp"]
    assert [e["name"] for e in stats["exams"]] == ["exam_cp"]


@needs_postgres
def test_attendance_and_grades_reports_refuse_a_class_outside_the_scope(school, portal):
    att = ok(school, RESTRICTED, "GET", f"{P}/attendance/")
    assert att["stats"]["total"] == 1 and att["stats"]["absent"] == 1
    for route in ("attendance/", "reports/grades/"):
        assert call(school, RESTRICTED, "GET", f"{P}/{route}", params={"classroom_id": str(portal["cls_6e"])}).status_code == 404
        assert call(school, FREE, "GET", f"{P}/{route}", params={"classroom_id": str(portal["cls_nocycle"])}).status_code == 404
    grades = ok(school, RESTRICTED, "GET", f"{P}/reports/grades/")["grades"]
    assert [g["student_id"] for g in grades] == [str(portal["s_cp"])]


@needs_postgres
def test_exams_list_shows_scope_and_department_wide_exams(school, portal):
    names = sorted(e["name"] for e in ok(school, RESTRICTED, "GET", f"{P}/exams/")["exams"])
    assert names == ["exam_cp", "exam_dept"]
    assert len(ok(school, FREE, "GET", f"{P}/exams/")["exams"]) == 3


# --- Écritures --------------------------------------------------------------------------------

@needs_postgres
def test_exam_writes_need_a_class_of_the_scope(school, portal):
    exams = portal["exams"]
    base = {"name": "x", "exam_date": "2026-12-20", "subject_id": str(portal["subject"]), "term_id": str(portal["term"])}
    before = exam_count(school)
    assert call(school, RESTRICTED, "POST", f"{P}/exams/", json={**base, "class_id": str(portal["cls_6e"])}).status_code == 404
    assert call(school, RESTRICTED, "POST", f"{P}/exams/", json={**base, "class_id": None}).status_code == 403
    assert exam_count(school) == before
    for target in ("exam_6e", "exam_dept"):
        assert call(school, RESTRICTED, "PUT", f"{P}/exams/{exams[target]}/",
                    json={**base, "class_id": str(portal["cls_cp"])}).status_code == 404, target
        assert call(school, RESTRICTED, "DELETE", f"{P}/exams/{exams[target]}/").status_code == 404, target
    assert exam_count(school) == before
    ok(school, RESTRICTED, "POST", f"{P}/exams/", json={**base, "class_id": str(portal["cls_cp"])})
    ok(school, RESTRICTED, "PUT", f"{P}/exams/{exams['exam_cp']}/", json={**base, "class_id": str(portal["cls_cp"])})
    ok(school, RESTRICTED, "DELETE", f"{P}/exams/{exams['exam_cp']}/")
    # Compte non restreint : inchangé (examen sans classe toujours modifiable).
    ok(school, FREE, "DELETE", f"{P}/exams/{exams['exam_dept']}/")


@needs_postgres
def test_alerts_need_every_class_in_the_scope(school, portal):
    alert = lambda name: {"classroomName": name, "rate": 40, "absent": 3, "total": 5}  # noqa: E731
    assert call(school, RESTRICTED, "POST", f"{P}/alerts/",
                json={"alerts_data": [alert("cls_cp"), alert("cls_6e")]}).status_code == 404
    assert call(school, RESTRICTED, "POST", f"{P}/alerts/send/", json={"alerts": [alert("cls_6e")]}).status_code == 404
    ok(school, RESTRICTED, "POST", f"{P}/alerts/", json={"alerts_data": [alert("cls_cp")]})
    ok(school, FREE, "POST", f"{P}/alerts/", json={"alerts_data": [alert("cls_cp"), alert("cls_6e")]})
    # Historique : l'alerte qui cite une classe hors périmètre est invisible au compte restreint.
    assert len(ok(school, RESTRICTED, "GET", f"{P}/alerts/")) == 1
    assert len(ok(school, FREE, "GET", f"{P}/alerts/")) == 2


@needs_postgres
def test_alert_email_escapes_client_supplied_text(school, portal):
    from app.core.config import settings
    sent = {}

    def fake_send(self, to, subject, html):
        sent["html"] = html
        return True

    with patch.object(settings, "SMTP_HOST", "smtp.example.test"), \
            patch("app.services.notifications.EmailSender.send", fake_send):
        ok(school, FREE, "POST", f"{P}/alerts/send/", json={
            "alerts": [{"classroomName": "<img src=x onerror=alert(1)>", "rate": "<b>9</b>"}],
            "periodLabel": "<script>x</script>",
        })
    assert "<script>" not in sent["html"] and "<img" not in sent["html"]
    assert "&lt;script&gt;" in sent["html"]
