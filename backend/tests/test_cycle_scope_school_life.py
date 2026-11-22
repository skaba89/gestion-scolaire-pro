"""Périmètre par cycle (lot B2c-2) : vie scolaire, pointages, cartes et badges, bulletins et
attestations, alertes précoces, incidents, rendez-vous, inscriptions aux événements.

JWT réel, lecture réelle des affectations (fixtures de ``test_cycle_scope_gate``, ``..._students``
et ``..._schooling``). Un compte restreint au cycle « primaire » :

- ne voit une **donnée d'élève** (pointage, carte, badge, alerte, incident, rendez-vous,
  inscription à un événement, bulletin) que si l'élève est dans le périmètre ;
- ne voit une **donnée de classe** (séance de pointage, synthèse de classe, lot de bulletins)
  que si la classe y est ;
- n'écrit qu'avec TOUS les identifiants reçus ou résolus (élève, classe, séance, incident) dans
  le périmètre, vérifiés AVANT toute écriture et avant toute mise en file ARQ ;
- reçoit le même 404 pour un objet inexistant et pour un objet hors périmètre.

Les comptes non restreints, administrateurs, enseignants et parents gardent leur comportement.
Les routes en SQL brut sur UUID en texte ne fonctionnent que sur PostgreSQL.
"""
from datetime import date, datetime, timedelta
from uuid import uuid4

import pytest

from conftest import get_test_client

client = get_test_client()

from sqlalchemy import text  # noqa: E402

from app.core import cycle_scope  # noqa: E402
from app.core.cycle_routes import Policy, policy_for  # noqa: E402
from app.core.database import SessionLocal, engine, switch_tenant_context  # noqa: E402
from app.models import Assessment, Attendance, Grade, Student, Term  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.models.school_event import SchoolEvent  # noqa: E402
from app.models.student_check_in import StudentCheckIn  # noqa: E402
from test_cycle_scope_gate import _assert_denied, school, structure  # noqa: E402,F401
from test_cycle_scope_schooling import (  # noqa: E402,F401
    TODAY, _error_body, _insert_raw, assessment_body, attendance_body, count, get_assessment,
    get_attendance, get_grade, grade_body, grading_assignment, raw_count, raw_value, schooling,
)
from test_cycle_scope_students import call, ids, world  # noqa: E402,F401

IS_SQLITE = engine.dialect.name == "sqlite"
needs_postgres = pytest.mark.skipif(IS_SQLITE, reason="SQL brut sur UUID en texte : PostgreSQL uniquement")


# --- Registre : les 65 routes du lot ----------------------------------------------------------

FILTERED = [
    ("GET", "/incidents/"), ("POST", "/incidents/"), ("PUT", "/incidents/{incident_id}/"),
    ("PUT", "/incidents/{incident_id}/assign/"), ("PUT", "/incidents/{incident_id}/resolve/"),
    ("GET", "/school-life/appointment-slots/appointments/"),
    ("PATCH", "/school-life/appointment-slots/appointments/{appointment_id}/"),
    ("DELETE", "/school-life/appointment-slots/{slot_id}/"),
    ("POST", "/school-life/appointment-slots/"), ("POST", "/school-life/appointment-slots/bulk/"),
    ("GET", "/school-life/assessments/"), ("POST", "/school-life/assessments/"),
    ("PUT", "/school-life/assessments/{assessment_id}/"), ("DELETE", "/school-life/assessments/{assessment_id}/"),
    ("GET", "/school-life/attendance/"), ("POST", "/school-life/attendance/"),
    ("PUT", "/school-life/attendance/{attendance_id}/"), ("DELETE", "/school-life/attendance/{attendance_id}/"),
    ("GET", "/school-life/badges/"),
    ("GET", "/school-life/check-ins/"), ("POST", "/school-life/check-ins/"),
    ("GET", "/school-life/check-ins/assignments/"), ("GET", "/school-life/check-ins/badges/"),
    ("GET", "/school-life/check-ins/sessions/"), ("POST", "/school-life/check-ins/sessions/"),
    ("POST", "/school-life/check-ins/sessions/start/"),
    ("PATCH", "/school-life/check-ins/sessions/{session_id}/end/"),
    ("GET", "/school-life/early-warnings/"), ("POST", "/school-life/early-warnings/"),
    ("GET", "/school-life/early-warnings/paginated/"), ("GET", "/school-life/early-warnings/summary/"),
    ("PUT", "/school-life/early-warnings/{warning_id}/"),
    ("GET", "/school-life/event-registrations/"), ("POST", "/school-life/event-registrations/"),
    ("POST", "/school-life/generate-certificate/pdf/"), ("POST", "/school-life/generate-report-card/pdf/"),
    ("POST", "/school-life/generate-report-card/v2/"), ("POST", "/school-life/generate-report-cards/batch/"),
    ("GET", "/school-life/grades/"), ("POST", "/school-life/grades/"),
    ("PUT", "/school-life/grades/{grade_id}/"), ("DELETE", "/school-life/grades/{grade_id}/"),
    ("GET", "/school-life/jobs/{job_id}/"), ("GET", "/school-life/report-cards/class-summary/"),
    ("GET", "/school-life/student-cards/"), ("POST", "/school-life/student-cards/issue/"),
    ("DELETE", "/school-life/student-cards/{student_id}/"), ("GET", "/school-life/students-without-badges/"),
    ("GET", "/student-badges/"), ("POST", "/student-badges/"), ("DELETE", "/student-badges/{badge_id}/"),
]
INDEPENDENT = [
    ("GET", "/school-life/appointment-slots/"), ("GET", "/school-life/bookable-resources/"),
    ("GET", "/school-life/bookings/"), ("GET", "/school-life/events/"), ("GET", "/school-life/events/export.ics"),
]
DENIED = [
    ("POST", "/school-life/bookable-resources/"), ("PUT", "/school-life/bookable-resources/{resource_id}/"),
    ("PATCH", "/school-life/bookable-resources/{resource_id}/"), ("POST", "/school-life/bookings/"),
    ("PUT", "/school-life/bookings/{booking_id}/"), ("POST", "/school-life/events/"),
    ("PUT", "/school-life/events/{event_id}/"), ("DELETE", "/school-life/events/{event_id}/"),
    ("GET", "/school-life/gamification/stats/"),
]


def test_the_65_routes_of_the_lot_are_classified_as_decided():
    assert (len(FILTERED), len(INDEPENDENT), len(DENIED)) == (51, 5, 9)
    for routes, expected in ((FILTERED, Policy.FILTERED), (INDEPENDENT, Policy.INDEPENDENT), (DENIED, Policy.DENY)):
        for method, path in routes:
            assert policy_for(method, f"/api/v1{path}") is expected, (method, path)


def test_new_siblings_of_the_lot_stay_denied():
    for method, path in (
        ("PUT", "/school-life/events/{event_id}/export/"), ("GET", "/school-life/nouvelle-route/"),
        ("DELETE", "/school-life/bookings/{booking_id}/"), ("POST", "/incidents/{incident_id}/delete/"),
    ):
        assert policy_for(method, f"/api/v1{path}") is Policy.DENY, (method, path)


# --- Données --------------------------------------------------------------------------------

LIFE_KEYS = (
    "bdg_cp", "bdg_6e", "bdg_none", "bdg_foreign",
    "ses_cp", "ses_6e", "ses_nocls", "ses_foreign",
    "asg_cp", "asg_6e", "asg_none",
    "ev", "ev_foreign", "reg_cp", "reg_6e", "reg_alumni", "reg_foreign",
    "slot_free", "slot_cp", "slot_6e", "apt_cp", "apt_6e", "apt_free",
    "inc_cp", "inc_6e", "inc_none", "inc_foreign",
    "ew_cp", "ew_6e", "ew_cp_done", "ew_foreign",
    "ci_cp", "ci_6e", "res", "booking", "sevent",
    "job_mine", "job_other", "job_nouser", "job_6e",
)


@pytest.fixture
def life(school, world, schooling):
    """Pointages, séances, badges, cartes, rendez-vous, incidents, alertes, inscriptions à un
    événement, tâches : répartis entre les deux cycles, un élève sans inscription, un autre
    établissement. Les tables en SQL brut n'existent que sur PostgreSQL."""
    t, o, people = school["tenant"], school["other"], school["people"]
    k = {name: uuid4() for name in LIFE_KEYS}
    when = datetime(2026, 11, 2, 8, 0)
    with SessionLocal() as db:
        db.query(Student).filter(Student.id == world["s_cp"]).update({"card_uid": "SF-CP"})
        db.query(Student).filter(Student.id == world["s_6e"]).update({"card_uid": "SF-6E"})
        db.add(StudentCheckIn(id=k["ci_cp"], tenant_id=t, student_id=world["s_cp"], checked_at=when, direction="IN"))
        db.add(StudentCheckIn(id=k["ci_6e"], tenant_id=t, student_id=world["s_6e"], checked_at=when, direction="IN"))
        db.add(SchoolEvent(id=k["sevent"], tenant_id=t, title="Fête de l'école", start_date=when))
        for key, owner, user_id, klass in (
            ("job_mine", t, people["director"], "cls_cp"), ("job_other", t, people["secretary"], "cls_cp"),
            ("job_nouser", t, None, "cls_cp"), ("job_6e", t, people["director"], "cls_6e"),
        ):
            payload = {"classroom_id": str(world[klass]), "term_id": str(uuid4())}
            if user_id:
                payload["user_id"] = str(user_id)
            db.add(Job(id=k[key], tenant_id=owner, job_type="generate_report_cards_batch", status="SUCCESS",
                       payload=payload, result={"html": "eA==", "format": "html", "count": 1}))
        db.commit()

    if not IS_SQLITE:
        with SessionLocal() as db:
            for tid in (t, o):
                switch_tenant_context(db, str(tid))
                foreign = tid == o
                for key, student in (("bdg_cp", "s_cp"), ("bdg_6e", "s_6e"), ("bdg_none", "s_none"),
                                     ("bdg_foreign", "s_foreign")):
                    if (key == "bdg_foreign") != foreign:
                        continue
                    _insert_raw(db, """INSERT INTO student_badges (id, tenant_id, student_id, badge_type, badge_name, status)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:sid AS uuid), 'MERIT', :n, 'ACTIVE')""",
                                id=k[key], tid=tid, sid=world[student], n=key)
                for key, klass in (("ses_cp", "cls_cp"), ("ses_6e", "cls_6e"), ("ses_nocls", None),
                                   ("ses_foreign", "foreign_class")):
                    if (key == "ses_foreign") != foreign:
                        continue
                    _insert_raw(db, """INSERT INTO check_in_sessions (id, tenant_id, teacher_id, classroom_id, status)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:teacher AS uuid),
                                               CAST(:cid AS uuid), 'ACTIVE')""",
                                id=k[key], tid=tid, teacher=people["teacher"], cid=world[klass] if klass else None)
                if foreign:
                    _insert_raw(db, """INSERT INTO career_events (id, tenant_id, title, start_datetime)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), 'Forum', NOW())""", id=k["ev_foreign"], tid=tid)
                    _insert_raw(db, """INSERT INTO career_event_registrations (id, tenant_id, event_id, student_id)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:ev AS uuid), CAST(:sid AS uuid))""",
                                id=k["reg_foreign"], tid=tid, ev=k["ev_foreign"], sid=world["s_foreign"])
                    _insert_raw(db, """INSERT INTO incidents (id, tenant_id, student_id, title, incident_type, status, occurred_at)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:sid AS uuid), 'inc_foreign', 'DISCIPLINE', 'OPEN', NOW())""",
                                id=k["inc_foreign"], tid=tid, sid=world["s_foreign"])
                    _insert_raw(db, """INSERT INTO early_warnings (id, tenant_id, student_id, alert_type, severity, title, description,
                                       recommended_actions, status)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:sid AS uuid), 'academic', 'low', 'ew_foreign',
                                               'x', CAST('[]' AS json), 'new')""",
                                id=k["ew_foreign"], tid=tid, sid=world["s_foreign"])
                    continue
                for key, session, student in (("asg_cp", "ses_cp", "s_cp"), ("asg_6e", "ses_cp", "s_6e"),
                                              ("asg_none", "ses_nocls", "s_none")):
                    _insert_raw(db, """INSERT INTO check_in_assignments (id, tenant_id, student_id, session_id, status)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:sid AS uuid), CAST(:ses AS uuid), 'PENDING')""",
                                id=k[key], tid=tid, sid=world[student], ses=k[session])
                _insert_raw(db, """INSERT INTO career_events (id, tenant_id, title, start_datetime)
                                   VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), 'Forum', NOW())""", id=k["ev"], tid=tid)
                for key, student, alumni in (("reg_cp", "s_cp", None), ("reg_6e", "s_6e", None),
                                             ("reg_alumni", None, people["parent"])):
                    _insert_raw(db, """INSERT INTO career_event_registrations (id, tenant_id, event_id, student_id, alumni_id)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:ev AS uuid), CAST(:sid AS uuid),
                                               CAST(:alumni AS uuid))""",
                                id=k[key], tid=tid, ev=k["ev"], sid=world[student] if student else None, alumni=alumni)
                for key in ("slot_free", "slot_cp", "slot_6e"):
                    _insert_raw(db, """INSERT INTO appointment_slots (id, tenant_id, teacher_id, date, start_time, end_time, max_appointments)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:teacher AS uuid), :d, '09:00', '09:30', 3)""",
                                id=k[key], tid=tid, teacher=people["director"], d=str(TODAY + timedelta(days=3)))
                for key, slot, student in (("apt_cp", "slot_cp", "s_cp"), ("apt_6e", "slot_6e", "s_6e"),
                                           ("apt_free", "slot_free", None)):
                    _insert_raw(db, """INSERT INTO appointments (id, tenant_id, parent_id, teacher_id, student_id, appointment_date,
                                       slot_id, status)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:parent AS uuid), CAST(:teacher AS uuid),
                                               CAST(:sid AS uuid), :d, CAST(:slot AS uuid), 'REQUESTED')""",
                                id=k[key], tid=tid, parent=people["parent"], teacher=people["director"],
                                sid=world[student] if student else None, d=str(TODAY + timedelta(days=3)), slot=k[slot])
                for key, student in (("inc_cp", "s_cp"), ("inc_6e", "s_6e"), ("inc_none", None)):
                    _insert_raw(db, """INSERT INTO incidents (id, tenant_id, student_id, title, incident_type, status, occurred_at)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:sid AS uuid), :title, 'DISCIPLINE', 'OPEN', NOW())""",
                                id=k[key], tid=tid, sid=world[student] if student else None, title=key)
                for key, student, status in (("ew_cp", "s_cp", "new"), ("ew_6e", "s_6e", "new"), ("ew_cp_done", "s_cp", "resolved")):
                    _insert_raw(db, """INSERT INTO early_warnings (id, tenant_id, student_id, alert_type, severity, title, description,
                                       recommended_actions, status)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:sid AS uuid), 'academic', 'low', :title,
                                               'x', CAST('[]' AS json), :status)""",
                                id=k[key], tid=tid, sid=world[student], title=key, status=status)
                _insert_raw(db, """INSERT INTO bookable_resources (id, tenant_id, name) VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), 'Salle A')""",
                            id=k["res"], tid=tid)
                _insert_raw(db, """INSERT INTO bookings (id, tenant_id, resource_id, user_id, title, start_time, end_time, status)
                                   VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:res AS uuid), CAST(:uid AS uuid), 'Réunion',
                                           NOW() + interval '1 day', NOW() + interval '1 day 1 hour', 'approved')""",
                            id=k["booking"], tid=tid, res=k["res"], uid=people["director"])
            db.commit()

    yield {**schooling, **k}

    with SessionLocal() as db:
        for tid in (t, o):
            switch_tenant_context(db, str(tid))
            if not IS_SQLITE:
                for table in ("bookings", "bookable_resources", "appointments", "appointment_slots", "check_in_assignments",
                              "check_in_sessions", "career_event_registrations", "career_events", "student_badges",
                              "early_warnings", "incidents"):
                    db.execute(text(f"DELETE FROM {table} WHERE tenant_id = :tid"), {"tid": str(tid)})
            for model in (StudentCheckIn, SchoolEvent, Job):
                db.query(model).filter(model.tenant_id == tid).delete()
        db.commit()


def sid(life, *names):
    return {str(life[name]) for name in names}


def jobs_count(tenant):
    return count(Job, tenant)


# --- Briques ----------------------------------------------------------------------------------

def test_batch_helpers_carry_the_route_message_without_oracle(school, schooling):
    restricted = {"_cycle_ids": [str(school["cycles"]["primaire"])]}
    t = school["tenant"]
    with SessionLocal() as db:
        for fn, bad, detail in (
            (cycle_scope.require_students_in_scope, [schooling["s_6e"]], "Alert not found"),
            (cycle_scope.require_students_in_scope, ["pas-un-uuid"], "Alert not found"),
            (cycle_scope.require_students_in_scope, [uuid4()], "Alert not found"),
            (cycle_scope.require_classes_in_scope, [schooling["cls_6e"]], "Job introuvable"),
            (cycle_scope.require_classes_in_scope, [None], "Job introuvable"),
        ):
            with pytest.raises(Exception) as caught:
                fn(db, t, restricted, bad, detail=detail)
            assert caught.value.status_code == 404 and caught.value.detail == detail
        with pytest.raises(Exception) as caught:  # message par défaut inchangé
            cycle_scope.require_students_in_scope(db, t, restricted, [schooling["s_6e"]])
        assert caught.value.detail == "Élève introuvable"


# --- Jumelles /school-life/{assessments,grades,attendance}/ ----------------------------------------

def test_school_life_assessment_list_is_limited_to_classes_of_the_cycle(school, schooling):
    mine = {str(schooling["a_cp"]), str(schooling["a_cp_empty"])}
    assert ids(call(school, "director", "GET", "/school-life/assessments/")) == mine
    everything = mine | {str(schooling["a_6e"]), str(schooling["a_nocls"])}
    for who in ("secretary_free", "admin_residual", "teacher"):
        assert ids(call(school, who, "GET", "/school-life/assessments/")) == everything, who


def test_school_life_assessment_writes_need_the_class_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    before = count(Assessment, t)
    body = {"subject_id": str(schooling["subject"]), "name": "Nouvelle", "max_score": 20, "date": "2026-11-20T08:00:00"}
    # Ce schéma ne porte pas de classe : l'évaluation créée n'en aurait pas, donc hors de tout cycle.
    assert call(school, "director", "POST", "/school-life/assessments/", json=body).status_code == 404
    assert count(Assessment, t) == before
    assert call(school, "admin_residual", "POST", "/school-life/assessments/", json=body).status_code == 200
    assert count(Assessment, t) == before + 1
    for name in ("a_6e", "a_nocls", "a_foreign"):
        name_before = get_assessment(schooling[name]).name
        assert call(school, "director", "PUT", f"/school-life/assessments/{schooling[name]}/",
                    json={"name": "Pirate"}).status_code == 404, name
        assert call(school, "director", "DELETE", f"/school-life/assessments/{schooling[name]}/").status_code == 404, name
        assert get_assessment(schooling[name]).name == name_before
    ok = call(school, "director", "PUT", f"/school-life/assessments/{schooling['a_cp_empty']}/", json={"name": "Renommée"})
    assert ok.status_code == 200 and get_assessment(schooling["a_cp_empty"]).name == "Renommée"
    assert call(school, "director", "DELETE", f"/school-life/assessments/{schooling['a_cp_empty']}/").status_code == 200
    assert get_assessment(schooling["a_cp_empty"]) is None
    assert call(school, "admin_residual", "PUT", f"/school-life/assessments/{schooling['a_6e']}/",
                json={"name": "Libre"}).status_code == 200


def test_school_life_grade_list_follows_the_student(school, schooling):
    assert ids(call(school, "director", "GET", "/school-life/grades/")) == sid(schooling, "g_cp", "g_cp_old")
    assert ids(call(school, "director", "GET", "/school-life/grades/", params={"student_id": str(schooling["s_6e"])})) == set()
    everything = sid(schooling, "g_cp", "g_cp_old", "g_6e", "g_none")
    for who in ("secretary_free", "admin_residual", "teacher"):
        assert ids(call(school, who, "GET", "/school-life/grades/")) == everything, who


@needs_postgres
def test_school_life_grade_list_keeps_the_parent_view(school, schooling):
    assert ids(call(school, "parent", "GET", "/school-life/grades/")) == sid(schooling, "g_cp", "g_cp_old", "g_6e", "g_none")


def test_school_life_grade_writes_need_student_and_assessment_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    before = count(Grade, t)
    for student, assessment in (("s_6e", "a_cp_empty"), ("s_cp", "a_6e"), ("s_cp", "a_nocls"), ("s_none", "a_cp_empty"),
                                ("s_cp", None), ("s_foreign", "a_cp_empty")):
        response = call(school, "director", "POST", "/school-life/grades/", json=grade_body(schooling, student, assessment))
        assert response.status_code == 404, (student, assessment)
    assert count(Grade, t) == before
    ok = call(school, "director", "POST", "/school-life/grades/", json=grade_body(schooling, "s_cp", "a_cp_empty"))
    assert ok.status_code == 200, ok.text
    assert call(school, "admin_residual", "POST", "/school-life/grades/", json=grade_body(schooling, "s_6e", "a_6e")).status_code == 200
    for name in ("g_6e", "g_none", "g_cp_old", "g_foreign"):
        score = get_grade(schooling[name]).score
        assert call(school, "director", "PUT", f"/school-life/grades/{schooling[name]}/", json={"score": 1.0}).status_code == 404, name
        assert call(school, "director", "DELETE", f"/school-life/grades/{schooling[name]}/").status_code == 404, name
        assert get_grade(schooling[name]).score == score
    in_scope = call(school, "director", "PUT", f"/school-life/grades/{schooling['g_cp']}/", json={"score": 16.0})
    assert in_scope.status_code == 200, in_scope.text
    assert in_scope.json()["score"] == 16.0
    assert in_scope.json()["assessment"]["id"] == str(schooling["a_cp"])
    assert get_grade(schooling["g_cp"]).score == 16.0
    before = count(Grade, t)
    assert call(school, "director", "DELETE", f"/school-life/grades/{schooling['g_cp']}/").status_code == 200
    assert count(Grade, t) == before - 1
    assert call(school, "admin_residual", "PUT", f"/school-life/grades/{schooling['g_6e']}/", json={"score": 11.0}).status_code == 200
    assert get_grade(schooling["g_6e"]).score == 11.0


def test_school_life_grade_partial_update_respects_scale(school, schooling):
    grade_id = schooling["g_cp"]
    url = f"/school-life/grades/{grade_id}/"
    updated = call(school, "director", "PUT", url, json={"score": 0, "comments": "À reprendre"})
    assert updated.status_code == 200
    assert updated.json()["score"] == 0
    assert call(school, "director", "PUT", url, json={"score": 16}).status_code == 200
    for invalid in ({"score": 21}, {"score": -1}, {"max_score": 15}, {"coefficient": 0},
                    {"max_score": "Infinity"},
                    {"score": None}, {"max_score": None}, {"coefficient": None}, {"comments": "x" * 501}):
        assert call(school, "director", "PUT", url, json=invalid).status_code == 422
        saved = get_grade(grade_id)
        assert (saved.score, saved.max_score, saved.coefficient, saved.comments) == (16, 20, 1, "À reprendre")
    cleared = call(school, "director", "PUT", url, json={"comments": None})
    assert cleared.status_code == 200
    assert get_grade(grade_id).comments is None


@needs_postgres
def test_school_life_grade_update_uses_teaching_assignment(school, schooling, grading_assignment):
    own = f"/school-life/grades/{schooling['g_6e']}/"
    assert call(school, "teacher", "PUT", own, json={"score": 11}).status_code == 200
    assert get_grade(schooling["g_6e"]).score == 11
    other = schooling["g_cp"]
    assert call(school, "teacher", "PUT", f"/school-life/grades/{other}/", json={"score": 16}).status_code == 403
    assert get_grade(other).score == 15


def test_school_life_closed_session_keeps_grade(school, schooling):
    from app.models.exam_session import ExamSession

    with SessionLocal() as db:
        switch_tenant_context(db, str(school["tenant"]))
        session = db.get(ExamSession, schooling["session"])
        session.status = "CLOSED"
        db.commit()
    grade_id = schooling["g_cp"]
    closed = call(school, "director", "PUT", f"/school-life/grades/{grade_id}/", json={"score": 16})
    assert closed.status_code == 409
    assert get_grade(grade_id).score == 15


def test_school_life_attendance_list_follows_the_student(school, schooling):
    assert ids(call(school, "secretary", "GET", "/school-life/attendance/")) == sid(schooling, "att_cp", "att_cp_old")
    hidden = call(school, "secretary", "GET", "/school-life/attendance/", params={"student_ids": str(schooling["s_6e"])})
    assert ids(hidden) == set()
    everything = sid(schooling, "att_cp", "att_cp_old", "att_6e", "att_none")
    for who in ("secretary_free", "admin_residual", "teacher"):
        assert ids(call(school, who, "GET", "/school-life/attendance/")) == everything, who


def test_school_life_attendance_writes_need_student_and_class_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    before = count(Attendance, t)
    for student, klass in (("s_6e", "cls_6e"), ("s_cp", "cls_6e"), ("s_none", "cls_cp"), ("s_cp", None), ("s_foreign", "cls_cp")):
        response = call(school, "secretary", "POST", "/school-life/attendance/", json=attendance_body(schooling, student, klass))
        assert response.status_code == 404, (student, klass)
    assert count(Attendance, t) == before
    ok = call(school, "secretary", "POST", "/school-life/attendance/", json=attendance_body(schooling, "s_cp", "cls_cp"))
    assert ok.status_code == 200, ok.text
    for name in ("att_6e", "att_cp_old", "att_none", "att_foreign"):
        status = get_attendance(schooling[name]).status
        assert call(school, "secretary", "PUT", f"/school-life/attendance/{schooling[name]}/",
                    json={"status": "EXCUSED"}).status_code == 404, name
        assert call(school, "director", "DELETE", f"/school-life/attendance/{schooling[name]}/").status_code == 404, name
        row = get_attendance(schooling[name])
        assert row is not None and row.status == status
    assert call(school, "secretary", "PUT", f"/school-life/attendance/{schooling['att_cp']}/",
                json={"status": "LATE"}).status_code == 200
    assert get_attendance(schooling["att_cp"]).status == "LATE"
    assert call(school, "director", "DELETE", f"/school-life/attendance/{schooling['att_cp']}/").status_code == 200
    assert call(school, "admin_residual", "PUT", f"/school-life/attendance/{schooling['att_6e']}/",
                json={"status": "EXCUSED"}).status_code == 200
    assert call(school, "admin_residual", "POST", "/school-life/attendance/",
                json=attendance_body(schooling, "s_6e", "cls_6e", 3)).status_code == 200


def test_school_life_twin_404s_have_no_existence_oracle(school, schooling):
    unknown = uuid4()
    for method, path, hidden, kwargs in (
        ("PUT", "/school-life/grades/{}/", "g_6e", {"json": {"score": 1.0}}),
        ("DELETE", "/school-life/grades/{}/", "g_6e", {}),
        ("PUT", "/school-life/attendance/{}/", "att_6e", {"json": {"status": "LATE"}}),
        ("DELETE", "/school-life/attendance/{}/", "att_6e", {}),
    ):
        missing = call(school, "director", method, path.format(unknown), **kwargs)
        masked = call(school, "director", method, path.format(schooling[hidden]), **kwargs)
        assert missing.status_code == masked.status_code == 404, (method, path)
        assert _error_body(missing) == _error_body(masked), (method, path)


# --- Pointages -------------------------------------------------------------------------------

def test_check_in_list_follows_the_student(school, life):
    assert ids(call(school, "secretary", "GET", "/school-life/check-ins/")) == sid(life, "ci_cp")
    hidden = call(school, "secretary", "GET", "/school-life/check-ins/", params={"student_ids": str(life["s_6e"])})
    assert ids(hidden) == set()
    for who in ("secretary_free", "admin_residual"):
        assert ids(call(school, who, "GET", "/school-life/check-ins/")) == sid(life, "ci_cp", "ci_6e"), who
    # CHECKINS-TEACHER-SCOPE-01 (#570) : un enseignant ne voit que les élèves de
    # ses classes (et ses propres séances) ; celui du jeu de test n'en a aucune.
    # Lit teacher_assignments, table PostgreSQL uniquement.
    if not IS_SQLITE:
        assert ids(call(school, "teacher", "GET", "/school-life/check-ins/")) == set()


@needs_postgres
def test_check_in_create_needs_student_and_session_in_scope_without_effect(school, life):
    t = school["tenant"]
    before = count(StudentCheckIn, t)

    def body(student, session=None):
        data = {"student_id": str(life[student]), "direction": "IN"}
        if session:
            data["session_id"] = str(life[session])
        return data

    for student, session in (("s_6e", None), ("s_none", None), ("s_foreign", None), ("s_cp", "ses_6e"),
                             ("s_cp", "ses_nocls"), ("s_cp", "ses_foreign")):
        response = call(school, "secretary", "POST", "/school-life/check-ins/", json=body(student, session))
        assert response.status_code == 404, (student, session)
    assert count(StudentCheckIn, t) == before
    ok = call(school, "secretary", "POST", "/school-life/check-ins/", json=body("s_cp", "ses_cp"))
    assert ok.status_code == 200, ok.text
    free = call(school, "secretary_free", "POST", "/school-life/check-ins/", json=body("s_6e", "ses_6e"))
    assert free.status_code == 200, free.text
    assert count(StudentCheckIn, t) == before + 2


@needs_postgres
def test_check_in_badge_lookup_hides_out_of_scope_cards_like_unknown_codes(school, life):
    ok = call(school, "secretary", "GET", "/school-life/check-ins/badges/", params={"qr_code_data": "SF-CP"})
    assert ok.status_code == 200 and ok.json()["student_id"] == str(life["s_cp"])
    for code in ("SF-6E", "SF-INCONNU"):
        response = call(school, "secretary", "GET", "/school-life/check-ins/badges/", params={"qr_code_data": code})
        assert response.status_code == 200 and response.json() is None, code
    free = call(school, "secretary_free", "GET", "/school-life/check-ins/badges/", params={"qr_code_data": "SF-6E"})
    assert free.json()["student_id"] == str(life["s_6e"])


@needs_postgres
def test_check_in_sessions_are_limited_to_classes_of_the_cycle_with_exact_total(school, life):
    listed = call(school, "secretary", "GET", "/school-life/check-ins/sessions/")
    assert ids(listed) == sid(life, "ses_cp") and listed.json()["total"] == 1
    hidden = call(school, "secretary", "GET", "/school-life/check-ins/sessions/", params={"class_id": str(life["cls_6e"])})
    assert hidden.json()["total"] == 0 and hidden.json()["items"] == []
    for who in ("secretary_free", "admin_residual", "teacher"):
        free = call(school, who, "GET", "/school-life/check-ins/sessions/")
        assert ids(free) == sid(life, "ses_cp", "ses_6e", "ses_nocls") and free.json()["total"] == 3, who


@needs_postgres
def test_check_in_session_writes_need_the_class_in_scope_without_effect(school, life):
    t = school["tenant"]
    before = raw_count("check_in_sessions", t)
    for klass in ("cls_6e", "foreign_class"):
        assert call(school, "secretary", "POST", "/school-life/check-ins/sessions/",
                    json={"classroom_id": str(life[klass])}).status_code == 404, klass
        assert call(school, "secretary", "POST", "/school-life/check-ins/sessions/start/",
                    json={"class_id": str(life[klass])}).status_code == 404, klass
    # Une séance sans classe n'appartient à aucun cycle.
    assert call(school, "secretary", "POST", "/school-life/check-ins/sessions/", json={}).status_code == 404
    assert raw_count("check_in_sessions", t) == before
    assert call(school, "secretary", "POST", "/school-life/check-ins/sessions/",
                json={"classroom_id": str(life["cls_cp"])}).status_code == 200
    assert call(school, "secretary", "POST", "/school-life/check-ins/sessions/start/",
                json={"class_id": str(life["cls_cp"])}).status_code == 200
    assert raw_count("check_in_sessions", t) == before + 2
    for name in ("ses_6e", "ses_nocls", "ses_foreign"):
        response = call(school, "secretary", "PATCH", f"/school-life/check-ins/sessions/{life[name]}/end/", json={})
        assert response.status_code == 404, name
        assert raw_value("SELECT status FROM check_in_sessions WHERE id = CAST(:i AS uuid)", i=life[name]) == "ACTIVE"
    missing = call(school, "secretary", "PATCH", f"/school-life/check-ins/sessions/{uuid4()}/end/", json={})
    masked = call(school, "secretary", "PATCH", f"/school-life/check-ins/sessions/{life['ses_6e']}/end/", json={})
    assert _error_body(missing) == _error_body(masked)
    assert call(school, "secretary", "PATCH", f"/school-life/check-ins/sessions/{life['ses_cp']}/end/", json={}).status_code == 200
    assert raw_value("SELECT status FROM check_in_sessions WHERE id = CAST(:i AS uuid)", i=life["ses_cp"]) == "COMPLETED"
    assert call(school, "secretary_free", "PATCH", f"/school-life/check-ins/sessions/{life['ses_6e']}/end/", json={}).status_code == 200
    assert call(school, "secretary_free", "POST", "/school-life/check-ins/sessions/", json={}).status_code == 200


@needs_postgres
def test_check_in_assignments_follow_the_student_with_exact_total(school, life):
    listed = call(school, "secretary", "GET", "/school-life/check-ins/assignments/")
    assert ids(listed) == sid(life, "asg_cp") and listed.json()["total"] == 1
    hidden = call(school, "secretary", "GET", "/school-life/check-ins/assignments/", params={"student_id": str(life["s_6e"])})
    assert hidden.json()["total"] == 0
    for who in ("secretary_free", "admin_residual"):
        free = call(school, who, "GET", "/school-life/check-ins/assignments/")
        assert ids(free) == sid(life, "asg_cp", "asg_6e", "asg_none") and free.json()["total"] == 3, who


# --- Cartes, badges, élèves sans badge ---------------------------------------------------------

@needs_postgres
def test_badge_lists_follow_the_student(school, life):
    assert ids(call(school, "secretary", "GET", "/school-life/badges/")) == sid(life, "bdg_cp")
    assert ids(call(school, "secretary", "GET", "/student-badges/")) == sid(life, "bdg_cp")
    hidden = call(school, "secretary", "GET", "/student-badges/", params={"student_id": str(life["s_6e"])})
    assert ids(hidden) == set()
    for who in ("secretary_free", "admin_residual"):
        assert ids(call(school, who, "GET", "/school-life/badges/")) == sid(life, "bdg_cp", "bdg_6e", "bdg_none"), who
        assert ids(call(school, who, "GET", "/student-badges/")) == sid(life, "bdg_cp", "bdg_6e", "bdg_none"), who


@needs_postgres
def test_students_without_badges_follow_the_student(school, life):
    with SessionLocal() as db:  # s_cp a déjà un badge ACTIVE : on le retire pour qu'il apparaisse
        db.execute(text("UPDATE student_badges SET status = 'REVOKED' WHERE id = CAST(:i AS uuid)"), {"i": str(life["bdg_cp"])})
        db.commit()
    listed = call(school, "secretary", "GET", "/school-life/students-without-badges/")
    assert ids(listed) == {str(life["s_cp"])}
    free = call(school, "secretary_free", "GET", "/school-life/students-without-badges/")
    assert str(life["s_cp"]) in ids(free) and str(life["s_old_only"]) in ids(free)
    assert str(life["s_foreign"]) not in ids(free)


@needs_postgres
def test_student_badge_writes_need_student_and_class_in_scope_without_effect(school, life):
    t = school["tenant"]
    before = raw_count("student_badges", t)
    ok_item = {"student_id": str(life["s_cp"]), "badge_name": "Bravo"}
    for batch in ({"student_id": str(life["s_6e"])}, {"student_id": str(life["s_none"])},
                  {"student_id": str(life["s_foreign"])}, {"student_id": "pas-un-uuid"},
                  {"student_id": str(life["s_cp"]), "classroom_id": str(life["cls_6e"])}):
        response = call(school, "secretary", "POST", "/student-badges/", json=batch)
        assert response.status_code == 404, batch
        assert raw_count("student_badges", t) == before
    # La signature ``body: dict`` de la route refuse déjà un lot en liste (422, préexistant) ; le code
    # de périmètre vérifie néanmoins chaque élément avant la première insertion (voir le handler).
    assert call(school, "secretary", "POST", "/student-badges/", json=[ok_item]).status_code == 422
    ok = call(school, "secretary", "POST", "/student-badges/", json={**ok_item, "classroom_id": str(life["cls_cp"])})
    assert ok.status_code == 201 and len(ok.json()) == 1
    assert raw_count("student_badges", t) == before + 1
    free = call(school, "secretary_free", "POST", "/student-badges/", json={"student_id": str(life["s_6e"])})
    assert free.status_code == 201


@needs_postgres
def test_student_badge_delete_needs_the_student_in_scope_without_effect(school, life):
    t = school["tenant"]
    before = raw_count("student_badges", t)
    for name in ("bdg_6e", "bdg_none", "bdg_foreign"):
        assert call(school, "secretary", "DELETE", f"/student-badges/{life[name]}/").status_code == 404, name
    for bad in (str(uuid4()), "pas-un-uuid"):
        assert call(school, "secretary", "DELETE", f"/student-badges/{bad}/").status_code == 404
    missing = call(school, "secretary", "DELETE", f"/student-badges/{uuid4()}/")
    masked = call(school, "secretary", "DELETE", f"/student-badges/{life['bdg_6e']}/")
    assert _error_body(missing) == _error_body(masked)
    assert raw_count("student_badges", t) == before
    assert call(school, "secretary", "DELETE", f"/student-badges/{life['bdg_cp']}/").status_code == 204
    assert raw_count("student_badges", t) == before - 1
    assert call(school, "secretary_free", "DELETE", f"/student-badges/{life['bdg_6e']}/").status_code == 204
    assert raw_count("student_badges", t) == before - 2


@needs_postgres
def test_student_card_list_follows_the_student(school, life):
    listed = call(school, "secretary", "GET", "/school-life/student-cards/")
    assert ids(listed, "student_id") == {str(life["s_cp"])}
    in_class = call(school, "secretary", "GET", "/school-life/student-cards/", params={"classroom_id": str(life["cls_cp"])})
    assert ids(in_class, "student_id") == {str(life["s_cp"])}
    assert call(school, "secretary", "GET", "/school-life/student-cards/",
                params={"classroom_id": str(life["cls_6e"])}).status_code == 404
    free = call(school, "secretary_free", "GET", "/school-life/student-cards/")
    assert {str(life["s_cp"]), str(life["s_6e"]), str(life["s_none"])} <= ids(free, "student_id")
    assert call(school, "secretary_free", "GET", "/school-life/student-cards/",
                params={"classroom_id": str(life["cls_6e"])}).status_code == 200


def card_uid(student_id):
    with SessionLocal() as db:
        return db.get(Student, student_id).card_uid


def test_student_card_issue_and_revoke_need_the_students_in_scope_without_effect(school, life):
    for batch in ([life["s_6e"]], [life["s_none"]], [life["s_foreign"]], [life["s_cp"], life["s_6e"]]):
        response = call(school, "secretary", "POST", "/school-life/student-cards/issue/",
                        json={"student_ids": [str(i) for i in batch], "reissue": True})
        assert response.status_code == 404, batch
    assert card_uid(life["s_cp"]) == "SF-CP" and card_uid(life["s_6e"]) == "SF-6E"  # lot tout ou rien
    assert call(school, "secretary", "DELETE", f"/school-life/student-cards/{life['s_6e']}/").status_code == 404
    assert call(school, "secretary", "DELETE", f"/school-life/student-cards/{life['s_foreign']}/").status_code == 404
    assert card_uid(life["s_6e"]) == "SF-6E"
    ok = call(school, "secretary", "POST", "/school-life/student-cards/issue/",
              json={"student_ids": [str(life["s_cp"])], "reissue": True})
    assert ok.status_code == 200 and ok.json()["changed"] == 1 and card_uid(life["s_cp"]) != "SF-CP"
    assert call(school, "secretary", "DELETE", f"/school-life/student-cards/{life['s_cp']}/").status_code == 200
    assert card_uid(life["s_cp"]) is None
    free = call(school, "secretary_free", "POST", "/school-life/student-cards/issue/",
                json={"student_ids": [str(life["s_6e"])], "reissue": True})
    assert free.status_code == 200 and card_uid(life["s_6e"]) != "SF-6E"
    assert call(school, "secretary_free", "DELETE", f"/school-life/student-cards/{life['s_6e']}/").status_code == 200


# --- Bulletins, attestations, tâches -----------------------------------------------------------

def _term(school):
    with SessionLocal() as db:
        return db.query(Term.id).filter(Term.tenant_id == school["tenant"]).scalar()


def report_body(life, school, student="s_cp", klass="cls_cp"):
    return {"student_id": str(life[student]), "term_id": str(_term(school)), "classroom_id": str(life[klass])}


@pytest.mark.parametrize("path", ["/school-life/generate-report-card/v2/", "/school-life/generate-report-card/pdf/"])
def test_report_card_needs_student_and_class_in_scope(school, life, path):
    uniform = None
    for student, klass in (("s_6e", "cls_6e"), ("s_cp", "cls_6e"), ("s_6e", "cls_cp"), ("s_none", "cls_cp"),
                           ("s_foreign", "cls_cp"), ("s_cp", "foreign_class")):
        response = call(school, "director", "POST", path, json=report_body(life, school, student, klass))
        assert response.status_code == 404, (student, klass)
        uniform = uniform or _error_body(response)
        assert _error_body(response) == uniform  # même message pour tous les refus
    if IS_SQLITE:  # SQL brut sur UUID en texte : le bulletin lui-même ne se génère que sur PostgreSQL
        return
    # Élève et classe du périmètre : le bulletin est produit.
    ok = call(school, "director", "POST", path, json=report_body(life, school))
    assert ok.status_code == 200, ok.text


@needs_postgres
def test_report_card_still_works_for_unrestricted_accounts(school, life):
    for who in ("secretary_free", "admin_residual"):
        response = call(school, who, "POST", "/school-life/generate-report-card/v2/", json=report_body(life, school, "s_6e", "cls_6e"))
        assert response.status_code != 403 and response.json().get("error") != "CYCLE_SCOPE_DENIED", who
    ok = call(school, "admin_residual", "POST", "/school-life/generate-report-card/v2/", json=report_body(life, school))
    assert ok.status_code == 200, ok.text


def test_certificate_needs_the_student_in_scope(school, life):
    uniform = None
    for student in ("s_6e", "s_none", "s_foreign", "s_nolevel"):
        response = call(school, "director", "POST", "/school-life/generate-certificate/pdf/",
                        json={"student_id": str(life[student]), "certificate_type": "enrollment"})
        assert response.status_code == 404, student
        uniform = uniform or _error_body(response)
        assert _error_body(response) == uniform
    unknown = call(school, "director", "POST", "/school-life/generate-certificate/pdf/",
                   json={"student_id": str(uuid4()), "certificate_type": "enrollment"})
    assert _error_body(unknown) == uniform
    if IS_SQLITE:  # SQL brut sur UUID en texte : l'attestation elle-même ne se génère que sur PostgreSQL
        return
    ok = call(school, "director", "POST", "/school-life/generate-certificate/pdf/",
              json={"student_id": str(life["s_cp"]), "certificate_type": "enrollment"})
    assert ok.status_code == 200 and ok.headers["content-type"] == "application/pdf", ok.text
    free = call(school, "secretary_free", "POST", "/school-life/generate-certificate/pdf/",
                json={"student_id": str(life["s_6e"]), "certificate_type": "enrollment"})
    assert free.status_code == 200, free.text


@needs_postgres
def test_class_summary_needs_the_class_in_scope(school, life):
    params = {"classroom_id": str(life["cls_6e"]), "term_id": str(_term(school))}
    for klass in ("cls_6e", "cls_nolevel", "foreign_class"):
        response = call(school, "director", "GET", "/school-life/report-cards/class-summary/",
                        params={**params, "classroom_id": str(life[klass])})
        assert response.status_code == 404, klass
    with SessionLocal() as db:  # le calcul exige une classe rattachée à l'année de la période
        for klass in ("cls_cp", "cls_6e"):
            db.execute(text("UPDATE classes SET academic_year_id = CAST(:y AS uuid) WHERE id = CAST(:c AS uuid)"),
                       {"y": str(life["year"]), "c": str(life[klass])})
        db.commit()
    mine = call(school, "director", "GET", "/school-life/report-cards/class-summary/",
                params={**params, "classroom_id": str(life["cls_cp"])})
    assert mine.status_code == 200, mine.text
    assert mine.json()["class_total"] == 1 and {i["student_id"] for i in mine.json()["items"]} == {str(life["s_cp"])}
    free = call(school, "admin_residual", "GET", "/school-life/report-cards/class-summary/", params=params)
    assert free.status_code == 200, free.text
    assert call(school, "director", "GET", "/school-life/report-cards/class-summary/", params=params).status_code == 404


@needs_postgres
def test_batch_report_cards_are_refused_before_any_job_is_queued(school, life):
    t = school["tenant"]
    before = jobs_count(t)
    for klass in ("cls_6e", "cls_nolevel", "foreign_class"):
        response = call(school, "director", "POST", "/school-life/generate-report-cards/batch/",
                        json={"classroom_id": str(life[klass]), "term_id": str(_term(school))})
        assert response.status_code == 404, klass
    assert jobs_count(t) == before  # aucune tâche créée, rien de mis en file
    queued = call(school, "director", "POST", "/school-life/generate-report-cards/batch/",
                  json={"classroom_id": str(life["cls_cp"]), "term_id": str(_term(school))})
    assert queued.status_code != 403 and jobs_count(t) == before + 1
    free = call(school, "admin_residual", "POST", "/school-life/generate-report-cards/batch/",
                json={"classroom_id": str(life["cls_6e"]), "term_id": str(_term(school))})
    assert free.status_code != 403 and jobs_count(t) == before + 2


@needs_postgres
def test_a_restricted_account_only_reads_the_jobs_it_started(school, life):
    ok = call(school, "director", "GET", f"/school-life/jobs/{life['job_mine']}/")
    assert ok.status_code == 200 and ok.json()["status"] == "SUCCESS"
    uniform = _error_body(call(school, "director", "GET", f"/school-life/jobs/{uuid4()}/"))
    for name in ("job_other", "job_nouser", "job_6e"):
        response = call(school, "director", "GET", f"/school-life/jobs/{life[name]}/")
        assert response.status_code == 404 and _error_body(response) == uniform, name
    # Une tâche lancée par un autre compte (job_other) reste masquée au directeur restreint (ci-dessus).
    for name in ("job_mine", "job_other", "job_nouser", "job_6e"):
        assert call(school, "admin_residual", "GET", f"/school-life/jobs/{life[name]}/").status_code == 200, name


# --- Alertes précoces --------------------------------------------------------------------------

@needs_postgres
def test_early_warning_lists_follow_the_student_with_exact_total(school, life):
    assert ids(call(school, "director", "GET", "/school-life/early-warnings/")) == sid(life, "ew_cp", "ew_cp_done")
    page = call(school, "director", "GET", "/school-life/early-warnings/paginated/", params={"page_size": 1, "page": 2}).json()
    assert page["total"] == 2 and len(page["items"]) == 1 and page["total_pages"] == 2
    closed = call(school, "director", "GET", "/school-life/early-warnings/paginated/", params={"group": "closed"}).json()
    assert closed["total"] == 1 and {i["id"] for i in closed["items"]} == sid(life, "ew_cp_done")
    summary = call(school, "director", "GET", "/school-life/early-warnings/summary/").json()
    assert (summary["total"], summary["new"], summary["closed"]) == (2, 1, 1)
    everything = sid(life, "ew_cp", "ew_cp_done", "ew_6e")
    assert ids(call(school, "admin_residual", "GET", "/school-life/early-warnings/")) == everything
    assert call(school, "admin_residual", "GET", "/school-life/early-warnings/paginated/").json()["total"] == 3
    assert call(school, "admin_residual", "GET", "/school-life/early-warnings/summary/").json()["total"] == 3


@needs_postgres
def test_early_warning_writes_need_the_student_in_scope_without_effect(school, life):
    t = school["tenant"]
    before = raw_count("early_warnings", t)
    body = {"alert_type": "academic", "severity": "low", "title": "T", "description": "D"}
    for student in ("s_6e", "s_none", "s_foreign"):
        assert call(school, "director", "POST", "/school-life/early-warnings/",
                    json={**body, "student_id": str(life[student])}).status_code == 404, student
    assert raw_count("early_warnings", t) == before
    assert call(school, "director", "POST", "/school-life/early-warnings/",
                json={**body, "student_id": str(life["s_cp"])}).status_code == 201
    assert raw_count("early_warnings", t) == before + 1
    for name in ("ew_6e", "ew_foreign"):
        response = call(school, "director", "PUT", f"/school-life/early-warnings/{life[name]}/", json={"status": "acknowledged"})
        assert response.status_code == 404, name
        assert raw_value("SELECT status FROM early_warnings WHERE id = CAST(:i AS uuid)", i=life[name]) == "new"
    missing = call(school, "director", "PUT", f"/school-life/early-warnings/{uuid4()}/", json={"status": "acknowledged"})
    masked = call(school, "director", "PUT", f"/school-life/early-warnings/{life['ew_6e']}/", json={"status": "acknowledged"})
    assert _error_body(missing) == _error_body(masked)
    assert call(school, "director", "PUT", f"/school-life/early-warnings/{life['ew_cp']}/",
                json={"status": "acknowledged"}).status_code == 200
    assert call(school, "admin_residual", "PUT", f"/school-life/early-warnings/{life['ew_6e']}/",
                json={"status": "acknowledged"}).status_code == 200
    assert call(school, "admin_residual", "POST", "/school-life/early-warnings/",
                json={**body, "student_id": str(life["s_6e"])}).status_code == 201


def test_early_warnings_stay_reserved_to_management_even_for_a_restricted_secretary(school, life):
    assert call(school, "secretary", "GET", "/school-life/early-warnings/").status_code == 403
    assert call(school, "secretary", "GET", "/school-life/early-warnings/").json().get("error") != "CYCLE_SCOPE_DENIED"


# --- Incidents -----------------------------------------------------------------------------------

@needs_postgres
def test_incident_list_shows_only_incidents_whose_student_is_in_scope(school, life):
    listed = call(school, "director", "GET", "/incidents/")
    assert ids(listed) == sid(life, "inc_cp")
    page = call(school, "director", "GET", "/incidents/", params={"page_size": 1, "page": 2})
    assert ids(page) == set()  # filtre avant LIMIT/OFFSET : pas de trou
    assert ids(call(school, "admin_residual", "GET", "/incidents/")) == sid(life, "inc_cp", "inc_6e", "inc_none")


@needs_postgres
def test_incident_create_needs_every_student_in_scope_without_effect(school, life):
    t = school["tenant"]
    before = raw_count("incidents", t)
    base = {"title": "Bagarre", "incident_type": "DISCIPLINE"}
    for students in ([], None, [str(life["s_6e"])], [str(life["s_cp"]), str(life["s_6e"])], [str(life["s_foreign"])],
                     ["pas-un-uuid"]):
        payload = base if students is None else {**base, "student_ids": students}
        response = call(school, "director", "POST", "/incidents/", json=payload)
        assert response.status_code in (404, 422), students
        assert raw_count("incidents", t) == before
    # Élève du périmètre : l'incident et son lien sont créés atomiquement.
    response = call(school, "director", "POST", "/incidents/", json={**base, "student_ids": [str(life["s_cp"])]})
    assert response.status_code == 201, response.text
    assert raw_count("incidents", t) == before + 1
    assert response.json()["parties"] == [str(life["s_cp"])]
    assert raw_value(
        "SELECT COUNT(*) FROM incident_parties WHERE incident_id = CAST(:i AS uuid)",
        i=response.json()["id"],
    ) == 1

    # Un administrateur non restreint peut déclarer plusieurs élèves, même de
    # cycles différents, sans perdre le lien historique ``incidents.student_id``.
    multi = call(
        school,
        "admin_residual",
        "POST",
        "/incidents/",
        json={**base, "student_ids": [str(life["s_cp"]), str(life["s_6e"])]},
    )
    assert multi.status_code == 201, multi.text
    assert set(multi.json()["parties"]) == {str(life["s_cp"]), str(life["s_6e"])}
    assert raw_value(
        "SELECT COUNT(*) FROM incident_parties WHERE incident_id = CAST(:i AS uuid)",
        i=multi.json()["id"],
    ) == 2
    restricted_ids = ids(call(school, "director", "GET", "/incidents/"))
    assert str(response.json()["id"]) in restricted_ids
    assert str(multi.json()["id"]) not in restricted_ids
    assert str(multi.json()["id"]) in ids(call(school, "admin_residual", "GET", "/incidents/"))
    free = call(school, "admin_residual", "POST", "/incidents/", json=base)
    assert free.status_code == 201 and raw_count("incidents", t) == before + 3


@needs_postgres
def test_incident_update_assign_resolve_need_the_incident_in_scope_without_effect(school, life):
    def row(name):
        return raw_value("SELECT status FROM incidents WHERE id = CAST(:i AS uuid)", i=life[name])

    unknown = uuid4()
    for name in ("inc_6e", "inc_none", "inc_foreign"):
        put = call(school, "director", "PUT", f"/incidents/{life[name]}/", json={"title": "Pirate"})
        resolve = call(school, "director", "PUT", f"/incidents/{life[name]}/resolve/", json={"resolution": "x"})
        assign = call(school, "director", "PUT", f"/incidents/{life[name]}/assign/", json={"resolver_id": str(school["people"]["director"])})
        assert (put.status_code, resolve.status_code, assign.status_code) == (404, 404, 404), name
        assert row(name) == "OPEN"
        assert raw_value("SELECT title FROM incidents WHERE id = CAST(:i AS uuid)", i=life[name]) != "Pirate"
    for path, kwargs in (("/incidents/{}/", {"json": {"title": "x"}}), ("/incidents/{}/resolve/", {"json": {}}),
                         ("/incidents/{}/assign/", {"json": {"resolver_id": str(school["people"]["director"])}})):
        missing = call(school, "director", "PUT", path.format(unknown), **kwargs)
        masked = call(school, "director", "PUT", path.format(life["inc_6e"]), **kwargs)
        assert _error_body(missing) == _error_body(masked), path
    assert call(school, "director", "PUT", f"/incidents/{life['inc_cp']}/", json={"title": "Renommé"}).status_code == 200
    assert call(school, "director", "PUT", f"/incidents/{life['inc_cp']}/assign/",
                json={"resolver_id": str(school["people"]["director"])}).status_code == 200
    in_scope = call(school, "director", "PUT", f"/incidents/{life['inc_cp']}/resolve/", json={"resolution": "ok"})
    assert in_scope.status_code == 200, in_scope.text
    assert in_scope.json()["status"] == "RESOLVED"
    assert raw_value(
        "SELECT resolved_at IS NOT NULL FROM incidents WHERE id = CAST(:i AS uuid)",
        i=life["inc_cp"],
    ) is True
    assert call(school, "admin_residual", "PUT", f"/incidents/{life['inc_6e']}/", json={"title": "Libre"}).status_code == 200
    assert call(school, "admin_residual", "PUT", f"/incidents/{life['inc_none']}/resolve/", json={"resolution": "ok"}).status_code == 200


@needs_postgres
def test_incident_migration_reentry_and_downgrade_preserve_history(school, life):
    """The additive migration is re-entrant and rollback never destroys history."""
    import runpy
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    created = call(
        school,
        "admin_residual",
        "POST",
        "/incidents/",
        json={
            "title": "Historique à préserver",
            "description": "Preuve de non-destruction",
            "incident_type": "DISCIPLINE",
            "severity": "MEDIUM",
            "occurred_at": "2026-11-22T08:00:00Z",
            "student_ids": [str(life["s_cp"]), str(life["s_6e"])],
        },
    )
    assert created.status_code == 201, created.text
    incident_id = created.json()["id"]
    migration = runpy.run_path(
        str(
            Path(__file__).parents[1]
            / "alembic/versions/20261122_0001_incident_parties_resolution.py"
        )
    )
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration["upgrade"]()
            migration["downgrade"]()
            migration["upgrade"]()
    assert raw_value(
        "SELECT COUNT(*) FROM incident_parties WHERE incident_id = CAST(:i AS uuid)",
        i=incident_id,
    ) == 2
    assert str(incident_id) in ids(call(school, "admin_residual", "GET", "/incidents/"))


@needs_postgres
def test_incident_parties_force_rls_hides_other_tenants(school, life):
    """Prove isolation with a real NOSUPERUSER/NOBYPASSRLS connection."""
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    import app.core.database as database

    own_party, foreign_party = uuid4(), uuid4()
    with SessionLocal() as db:
        switch_tenant_context(db, str(school["tenant"]))
        db.execute(
            text(
                "INSERT INTO incident_parties "
                "(id, tenant_id, incident_id, student_id, party_type) "
                "VALUES (:id, :tid, :incident, :student, 'INVOLVED')"
            ),
            {
                "id": str(own_party),
                "tid": str(school["tenant"]),
                "incident": str(life["inc_cp"]),
                "student": str(life["s_cp"]),
            },
        )
        db.commit()
        switch_tenant_context(db, str(school["other"]))
        db.execute(
            text(
                "INSERT INTO incident_parties "
                "(id, tenant_id, incident_id, student_id, party_type) "
                "VALUES (:id, :tid, :incident, :student, 'INVOLVED')"
            ),
            {
                "id": str(foreign_party),
                "tid": str(school["other"]),
                "incident": str(life["inc_foreign"]),
                "student": str(life["s_foreign"]),
            },
        )
        db.commit()

    role = "incident_parties_" + uuid4().hex
    password = "test-only-incident-parties-password"
    with engine.begin() as connection:
        connection.execute(
            text(
                f'CREATE ROLE "{role}" LOGIN PASSWORD \'{password}\' '
                "NOSUPERUSER NOBYPASSRLS"
            )
        )
        connection.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        connection.execute(text(f'GRANT SELECT ON incident_parties TO "{role}"'))

    restricted_url = make_url(
        engine.url.render_as_string(hide_password=False)
    ).set(username=role, password=password)
    restricted_engine = create_engine(restricted_url, poolclass=StaticPool)
    RestrictedSession = sessionmaker(bind=restricted_engine)
    try:
        with RestrictedSession() as db:
            flags = db.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity FROM pg_class "
                    "WHERE oid = 'incident_parties'::regclass"
                )
            ).one()
            assert flags == (True, True)
            assert db.execute(text("SELECT COUNT(*) FROM incident_parties")).scalar() == 0
            database.switch_tenant_context(db, str(school["tenant"]))
            visible = db.execute(
                text("SELECT id::text FROM incident_parties ORDER BY id")
            ).scalars().all()
            assert visible == [str(own_party)]
    finally:
        restricted_engine.dispose()
        with engine.begin() as connection:
            connection.execute(text(f'DROP OWNED BY "{role}"'))
            connection.execute(text(f'DROP ROLE "{role}"'))


# --- Rendez-vous parents-enseignants -------------------------------------------------------------

@needs_postgres
def test_appointment_list_hides_appointments_of_students_out_of_scope(school, life):
    listed = call(school, "director", "GET", "/school-life/appointment-slots/appointments/")
    assert ids(listed) == sid(life, "apt_cp", "apt_free")  # le rendez-vous sans élève reste lisible
    everything = sid(life, "apt_cp", "apt_6e", "apt_free")
    assert ids(call(school, "admin_residual", "GET", "/school-life/appointment-slots/appointments/")) == everything
    page = call(school, "director", "GET", "/school-life/appointment-slots/appointments/", params={"page_size": 1, "page": 2})
    assert len(page.json()) == 1  # filtre avant pagination : la page 2 existe et n'est pas un trou


@needs_postgres
def test_appointment_status_change_needs_the_student_in_scope_without_effect(school, life):
    def status(name):
        return raw_value("SELECT status FROM appointments WHERE id = CAST(:i AS uuid)", i=life[name])

    path = "/school-life/appointment-slots/appointments/{}/"
    denied = call(school, "director", "PATCH", path.format(life["apt_6e"]), json={"status": "CONFIRMED"})
    missing = call(school, "director", "PATCH", path.format(uuid4()), json={"status": "CONFIRMED"})
    assert denied.status_code == missing.status_code == 404 and _error_body(denied) == _error_body(missing)
    assert status("apt_6e") == "REQUESTED"
    assert call(school, "director", "PATCH", path.format(life["apt_cp"]), json={"status": "CONFIRMED"}).status_code == 200
    assert status("apt_cp") == "CONFIRMED"
    assert call(school, "director", "PATCH", path.format(life["apt_free"]), json={"status": "CONFIRMED"}).status_code == 200
    assert call(school, "admin_residual", "PATCH", path.format(life["apt_6e"]), json={"status": "CONFIRMED"}).status_code == 200


@needs_postgres
def test_appointment_slots_stay_readable_and_a_slot_holding_a_hidden_appointment_is_not_deletable(school, life):
    listed = call(school, "director", "GET", "/school-life/appointment-slots/")
    assert listed.status_code == 200
    assert {s["id"] for s in listed.json()["items"]} == sid(life, "slot_free", "slot_cp", "slot_6e")
    t = school["tenant"]
    before = raw_count("appointment_slots", t)
    missing = call(school, "director", "DELETE", f"/school-life/appointment-slots/{uuid4()}/")
    hidden = call(school, "director", "DELETE", f"/school-life/appointment-slots/{life['slot_6e']}/")
    assert missing.status_code == hidden.status_code == 404 and _error_body(missing) == _error_body(hidden)
    assert raw_count("appointment_slots", t) == before
    # Un créneau avec un rendez-vous d'un élève du périmètre garde sa règle métier (409).
    assert call(school, "director", "DELETE", f"/school-life/appointment-slots/{life['slot_cp']}/").status_code == 409
    # Créneau sans rendez-vous : supprimable.
    with SessionLocal() as db:
        db.execute(text("DELETE FROM appointments WHERE id = CAST(:i AS uuid)"), {"i": str(life["apt_free"])})
        db.commit()
    assert call(school, "director", "DELETE", f"/school-life/appointment-slots/{life['slot_free']}/").status_code == 200
    assert call(school, "admin_residual", "DELETE", f"/school-life/appointment-slots/{life['slot_6e']}/").status_code == 409


@needs_postgres
def test_a_restricted_account_only_manages_its_own_appointment_slots(school, life):
    t = school["tenant"]
    me, colleague = str(school["people"]["director"]), str(school["people"]["teacher"])
    body = {"date": str(TODAY + timedelta(days=9)), "start_time": "10:00", "end_time": "10:30"}
    before = raw_count("appointment_slots", t)
    # Création pour un autre enseignant : 404 identique à un créneau inexistant, rien d'écrit.
    refused = call(school, "director", "POST", "/school-life/appointment-slots/", json={**body, "teacher_id": colleague})
    assert refused.status_code == 404 and raw_count("appointment_slots", t) == before
    # Lot tout ou rien : un seul créneau d'un autre enseignant refuse tout.
    mixed = {"slots": [{**body, "start_time": "11:00", "end_time": "11:30"},
                       {**body, "start_time": "12:00", "end_time": "12:30", "teacher_id": colleague}]}
    assert call(school, "director", "POST", "/school-life/appointment-slots/bulk/", json=mixed).status_code == 404
    assert raw_count("appointment_slots", t) == before
    # Ses propres créneaux : implicite ou explicite.
    assert call(school, "director", "POST", "/school-life/appointment-slots/", json=body).status_code == 201
    own = call(school, "director", "POST", "/school-life/appointment-slots/", json={**body, "start_time": "13:00", "end_time": "13:30", "teacher_id": me})
    assert own.status_code == 201
    bulk = {"slots": [{**body, "start_time": "14:00", "end_time": "14:30"}]}
    assert call(school, "director", "POST", "/school-life/appointment-slots/bulk/", json=bulk).status_code == 201
    assert raw_count("appointment_slots", t) == before + 3
    # Suppression : le créneau d'un collègue répond comme un créneau inexistant ; le sien se supprime.
    theirs = call(school, "admin_residual", "POST", "/school-life/appointment-slots/", json={**body, "start_time": "15:00", "end_time": "15:30", "teacher_id": colleague})
    assert theirs.status_code == 201, theirs.text
    missing = call(school, "director", "DELETE", f"/school-life/appointment-slots/{uuid4()}/")
    masked = call(school, "director", "DELETE", f"/school-life/appointment-slots/{theirs.json()['id']}/")
    assert missing.status_code == masked.status_code == 404 and _error_body(missing) == _error_body(masked)
    assert raw_count("appointment_slots", t) == before + 4
    assert call(school, "director", "DELETE", f"/school-life/appointment-slots/{own.json()['id']}/").status_code == 200
    # Compte non restreint : inchangé (autre enseignant, suppression du créneau d'un collègue).
    assert call(school, "admin_residual", "DELETE", f"/school-life/appointment-slots/{theirs.json()['id']}/").status_code == 200
    assert call(school, "admin_residual", "POST", "/school-life/appointment-slots/bulk/", json={"slots": [
        {**body, "start_time": "16:00", "end_time": "16:30", "teacher_id": colleague}]}).status_code == 201


# --- Comptes restreints cumulant PARENT ou TEACHER -------------------------------------------------

@needs_postgres
def test_a_restricted_account_that_is_also_a_parent_gets_the_cycle_scope_for_its_own_children(school, life):
    from app.models import ParentStudent
    t, who = school["tenant"], "secretary_parent"
    with SessionLocal() as db:
        for key in ("s_cp", "s_6e"):
            db.add(ParentStudent(tenant_id=t, parent_id=school["people"][who], student_id=life[key]))
        db.commit()
    # L'enfant du cycle reste accessible, l'enfant hors cycle répond 404 (pas d'union avec le rôle parent).
    assert call(school, who, "POST", "/school-life/generate-report-card/v2/",
                json=report_body(life, school, "s_6e", "cls_6e")).status_code == 404
    assert call(school, who, "POST", "/school-life/generate-report-card/v2/",
                json=report_body(life, school, "s_cp", "cls_cp")).status_code == 200
    assert call(school, who, "POST", "/school-life/check-ins/",
                json={"student_id": str(life["s_6e"]), "direction": "IN"}).status_code == 404
    assert ids(call(school, who, "GET", "/school-life/check-ins/", params={"student_ids": str(life["s_6e"])})) == set()
    assert ids(call(school, who, "GET", "/school-life/check-ins/", params={"student_ids": str(life["s_cp"])})) == sid(life, "ci_cp")
    assert ids(call(school, who, "GET", "/school-life/grades/", params={"student_id": str(life["s_6e"])})) == set()
    assert ids(call(school, who, "GET", "/school-life/grades/")) == sid(life, "g_cp", "g_cp_old")


@needs_postgres
def test_a_restricted_account_that_is_also_a_teacher_still_gets_the_cycle_scope(school, life):
    who = "director_teacher"
    assert ids(call(school, who, "GET", "/school-life/check-ins/sessions/")) == sid(life, "ses_cp")
    assert call(school, who, "POST", "/school-life/check-ins/sessions/start/",
                json={"class_id": str(life["cls_6e"])}).status_code == 404
    assert call(school, who, "POST", "/school-life/generate-report-card/v2/",
                json=report_body(life, school, "s_6e", "cls_6e")).status_code == 404
    assert call(school, who, "PATCH", f"/school-life/check-ins/sessions/{life['ses_6e']}/end/", json={}).status_code == 404


# --- Inscriptions aux événements -----------------------------------------------------------------

@needs_postgres
def test_event_registration_list_follows_the_student(school, life):
    assert ids(call(school, "director", "GET", "/school-life/event-registrations/")) == sid(life, "reg_cp")
    hidden = call(school, "director", "GET", "/school-life/event-registrations/", params={"student_id": str(life["s_6e"])})
    assert ids(hidden) == set()
    everything = sid(life, "reg_cp", "reg_6e", "reg_alumni")
    assert ids(call(school, "admin_residual", "GET", "/school-life/event-registrations/")) == everything


@needs_postgres
def test_event_registration_create_needs_the_student_in_scope_without_effect(school, life):
    t = school["tenant"]
    before = raw_count("career_event_registrations", t)
    for body in ({"student_id": str(life["s_6e"])}, {"student_id": str(life["s_none"])},
                 {"student_id": str(life["s_foreign"])}, {"alumni_id": str(school["people"]["parent"])},
                 {"student_id": str(life["s_cp"]), "alumni_id": str(school["people"]["parent"])}):
        response = call(school, "director", "POST", "/school-life/event-registrations/",
                        json={"event_id": str(life["ev"]), **body})
        assert response.status_code == 404, body
    assert raw_count("career_event_registrations", t) == before
    ok = call(school, "director", "POST", "/school-life/event-registrations/",
              json={"event_id": str(life["ev"]), "student_id": str(life["s_cp"])})
    assert ok.status_code == 201, ok.text
    free = call(school, "admin_residual", "POST", "/school-life/event-registrations/",
                json={"event_id": str(life["ev"]), "student_id": str(life["s_6e"])})
    assert free.status_code == 201
    assert raw_count("career_event_registrations", t) == before + 2


# --- Calendrier, ressources, réservations -----------------------------------------------------------

@needs_postgres
def test_calendar_resources_and_bookings_are_readable_and_writes_stay_denied(school, life):
    for url in ("/school-life/events/", "/school-life/bookable-resources/", "/school-life/bookings/"):
        assert call(school, "director", "GET", url).status_code == 200, url
    ics = call(school, "director", "GET", "/school-life/events/export.ics")
    assert ics.status_code == 200 and "BEGIN:VCALENDAR" in ics.text
    when = {"title": "x", "start_date": "2026-12-01T08:00:00"}
    _assert_denied(call(school, "director", "POST", "/school-life/events/", json=when))
    _assert_denied(call(school, "director", "PUT", f"/school-life/events/{life['sevent']}/", json={"title": "Pirate"}))
    _assert_denied(call(school, "director", "DELETE", f"/school-life/events/{life['sevent']}/"))
    _assert_denied(call(school, "director", "POST", "/school-life/bookable-resources/", json={"name": "Salle"}))
    _assert_denied(call(school, "director", "PUT", f"/school-life/bookable-resources/{life['res']}/", json={"name": "Salle"}))
    _assert_denied(call(school, "director", "PATCH", f"/school-life/bookable-resources/{life['res']}/", json={"is_active": False}))
    _assert_denied(call(school, "director", "POST", "/school-life/bookings/", json={
        "resource_id": str(life["res"]), "title": "x", "start_time": "2026-12-01T08:00:00Z", "end_time": "2026-12-01T09:00:00Z"}))
    _assert_denied(call(school, "director", "PUT", f"/school-life/bookings/{life['booking']}/", json={"status": "rejected"}))
    with SessionLocal() as db:
        assert db.get(SchoolEvent, life["sevent"]).title == "Fête de l'école"
    assert raw_value("SELECT name FROM bookable_resources WHERE id = CAST(:i AS uuid)", i=life["res"]) == "Salle A"
    assert raw_value("SELECT status FROM bookings WHERE id = CAST(:i AS uuid)", i=life["booking"]) == "approved"
    assert call(school, "admin_residual", "POST", "/school-life/events/", json=when).status_code == 200


def test_calendar_events_carry_no_student_or_class_data(school, life):
    """Justification de la classe INDEPENDENT : le calendrier ne porte ni élève ni classe."""
    columns = {c.name for c in SchoolEvent.__table__.columns}
    assert not {name for name in columns if "student" in name or "class" in name}
    events = call(school, "director", "GET", "/school-life/events/")
    assert events.status_code == 200 and {e["id"] for e in events.json()} == sid(life, "sevent")


@pytest.mark.parametrize("who", ["director", "secretary"])
def test_gamification_stats_stay_denied(school, who):
    _assert_denied(call(school, who, "GET", "/school-life/gamification/stats/"))


# --- Comptes non restreints, parents, enseignants -------------------------------------------------

@needs_postgres
@pytest.mark.parametrize("who", ["secretary_free", "admin_residual", "teacher"])
def test_unrestricted_accounts_keep_their_reads(school, life, who):
    for url in ("/school-life/check-ins/", "/school-life/check-ins/sessions/", "/school-life/check-ins/assignments/",
                "/school-life/event-registrations/", "/school-life/appointment-slots/appointments/"):
        response = call(school, who, "GET", url)
        assert response.status_code != 403 or response.json().get("error") != "CYCLE_SCOPE_DENIED", (who, url)
    for url in ("/school-life/badges/", "/student-badges/", "/school-life/student-cards/", "/incidents/",
                "/school-life/early-warnings/"):
        body = call(school, who, "GET", url).json()
        assert not (isinstance(body, dict) and body.get("error") == "CYCLE_SCOPE_DENIED"), (who, url)


@needs_postgres
def test_parent_flows_are_unchanged(school, life):
    own = call(school, "parent", "GET", "/school-life/check-ins/", params={"student_ids": str(life["s_6e"])})
    assert own.status_code == 200 and ids(own) == sid(life, "ci_6e")
    registrations = call(school, "parent", "GET", "/school-life/event-registrations/")
    assert registrations.status_code == 200
    assert call(school, "parent", "GET", "/incidents/").status_code == 403  # RBAC inchangé : settings:write requis


def test_super_admin_with_tenant_header_is_never_filtered(school, life):
    from app.core import security

    token = security.create_access_token(
        {"sub": str(school["people"]["superadmin"]), "tenant_id": None, "roles": ["SUPER_ADMIN"]})
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": str(school["tenant"])}
    response = client.get("/api/v1/school-life/check-ins/", headers=headers)
    assert ids(response) == sid(life, "ci_cp", "ci_6e")


# --- Garde-fou : chaque route FILTERED du lot a son test comportemental ------------------------------

SCHOOL_LIFE_ROUTE_TESTS = {
    ("GET", "/incidents/"): "test_incident_list_shows_only_incidents_whose_student_is_in_scope",
    ("POST", "/incidents/"): "test_incident_create_needs_every_student_in_scope_without_effect",
    ("PUT", "/incidents/{incident_id}/"): "test_incident_update_assign_resolve_need_the_incident_in_scope_without_effect",
    ("PUT", "/incidents/{incident_id}/assign/"): "test_incident_update_assign_resolve_need_the_incident_in_scope_without_effect",
    ("PUT", "/incidents/{incident_id}/resolve/"): "test_incident_update_assign_resolve_need_the_incident_in_scope_without_effect",
    ("GET", "/school-life/appointment-slots/appointments/"): "test_appointment_list_hides_appointments_of_students_out_of_scope",
    ("PATCH", "/school-life/appointment-slots/appointments/{appointment_id}/"): "test_appointment_status_change_needs_the_student_in_scope_without_effect",
    ("DELETE", "/school-life/appointment-slots/{slot_id}/"): "test_appointment_slots_stay_readable_and_a_slot_holding_a_hidden_appointment_is_not_deletable",
    ("POST", "/school-life/appointment-slots/"): "test_a_restricted_account_only_manages_its_own_appointment_slots",
    ("POST", "/school-life/appointment-slots/bulk/"): "test_a_restricted_account_only_manages_its_own_appointment_slots",
    ("GET", "/school-life/assessments/"): "test_school_life_assessment_list_is_limited_to_classes_of_the_cycle",
    ("POST", "/school-life/assessments/"): "test_school_life_assessment_writes_need_the_class_in_scope_without_effect",
    ("PUT", "/school-life/assessments/{assessment_id}/"): "test_school_life_assessment_writes_need_the_class_in_scope_without_effect",
    ("DELETE", "/school-life/assessments/{assessment_id}/"): "test_school_life_assessment_writes_need_the_class_in_scope_without_effect",
    ("GET", "/school-life/attendance/"): "test_school_life_attendance_list_follows_the_student",
    ("POST", "/school-life/attendance/"): "test_school_life_attendance_writes_need_student_and_class_in_scope_without_effect",
    ("PUT", "/school-life/attendance/{attendance_id}/"): "test_school_life_attendance_writes_need_student_and_class_in_scope_without_effect",
    ("DELETE", "/school-life/attendance/{attendance_id}/"): "test_school_life_attendance_writes_need_student_and_class_in_scope_without_effect",
    ("GET", "/school-life/badges/"): "test_badge_lists_follow_the_student",
    ("GET", "/school-life/check-ins/"): "test_check_in_list_follows_the_student",
    ("POST", "/school-life/check-ins/"): "test_check_in_create_needs_student_and_session_in_scope_without_effect",
    ("GET", "/school-life/check-ins/assignments/"): "test_check_in_assignments_follow_the_student_with_exact_total",
    ("GET", "/school-life/check-ins/badges/"): "test_check_in_badge_lookup_hides_out_of_scope_cards_like_unknown_codes",
    ("GET", "/school-life/check-ins/sessions/"): "test_check_in_sessions_are_limited_to_classes_of_the_cycle_with_exact_total",
    ("POST", "/school-life/check-ins/sessions/"): "test_check_in_session_writes_need_the_class_in_scope_without_effect",
    ("POST", "/school-life/check-ins/sessions/start/"): "test_check_in_session_writes_need_the_class_in_scope_without_effect",
    ("PATCH", "/school-life/check-ins/sessions/{session_id}/end/"): "test_check_in_session_writes_need_the_class_in_scope_without_effect",
    ("GET", "/school-life/early-warnings/"): "test_early_warning_lists_follow_the_student_with_exact_total",
    ("POST", "/school-life/early-warnings/"): "test_early_warning_writes_need_the_student_in_scope_without_effect",
    ("GET", "/school-life/early-warnings/paginated/"): "test_early_warning_lists_follow_the_student_with_exact_total",
    ("GET", "/school-life/early-warnings/summary/"): "test_early_warning_lists_follow_the_student_with_exact_total",
    ("PUT", "/school-life/early-warnings/{warning_id}/"): "test_early_warning_writes_need_the_student_in_scope_without_effect",
    ("GET", "/school-life/event-registrations/"): "test_event_registration_list_follows_the_student",
    ("POST", "/school-life/event-registrations/"): "test_event_registration_create_needs_the_student_in_scope_without_effect",
    ("POST", "/school-life/generate-certificate/pdf/"): "test_certificate_needs_the_student_in_scope",
    ("POST", "/school-life/generate-report-card/pdf/"): "test_report_card_needs_student_and_class_in_scope",
    ("POST", "/school-life/generate-report-card/v2/"): "test_report_card_needs_student_and_class_in_scope",
    ("POST", "/school-life/generate-report-cards/batch/"): "test_batch_report_cards_are_refused_before_any_job_is_queued",
    ("GET", "/school-life/grades/"): "test_school_life_grade_list_follows_the_student",
    ("POST", "/school-life/grades/"): "test_school_life_grade_writes_need_student_and_assessment_in_scope_without_effect",
    ("PUT", "/school-life/grades/{grade_id}/"): "test_school_life_grade_writes_need_student_and_assessment_in_scope_without_effect",
    ("DELETE", "/school-life/grades/{grade_id}/"): "test_school_life_grade_writes_need_student_and_assessment_in_scope_without_effect",
    ("GET", "/school-life/jobs/{job_id}/"): "test_a_restricted_account_only_reads_the_jobs_it_started",
    ("GET", "/school-life/report-cards/class-summary/"): "test_class_summary_needs_the_class_in_scope",
    ("GET", "/school-life/student-cards/"): "test_student_card_list_follows_the_student",
    ("POST", "/school-life/student-cards/issue/"): "test_student_card_issue_and_revoke_need_the_students_in_scope_without_effect",
    ("DELETE", "/school-life/student-cards/{student_id}/"): "test_student_card_issue_and_revoke_need_the_students_in_scope_without_effect",
    ("GET", "/school-life/students-without-badges/"): "test_students_without_badges_follow_the_student",
    ("GET", "/student-badges/"): "test_badge_lists_follow_the_student",
    ("POST", "/student-badges/"): "test_student_badge_writes_need_student_and_class_in_scope_without_effect",
    ("DELETE", "/student-badges/{badge_id}/"): "test_student_badge_delete_needs_the_student_in_scope_without_effect",
}


def test_school_life_route_tests_cover_the_lot():
    assert set(SCHOOL_LIFE_ROUTE_TESTS) == set(FILTERED)
    for name in set(SCHOOL_LIFE_ROUTE_TESTS.values()):
        candidate = globals().get(name)
        assert callable(candidate) and name.startswith("test_"), f"test introuvable : {name}"
