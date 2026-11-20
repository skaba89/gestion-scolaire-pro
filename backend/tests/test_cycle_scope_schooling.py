"""Périmètre par cycle (lot B2c-1) : évaluations, notes, présences, devoirs, rendus,
relevés, sessions d'examen, séances, pointages.

JWT réel, lecture réelle des affectations (fixtures de ``test_cycle_scope_gate`` et
``test_cycle_scope_students``). Un compte restreint au cycle « primaire » :

- ne voit une **donnée d'élève** (note, présence, rendu, relevé, moyenne, historique) que si
  l'élève est dans le périmètre ; l'historique suit l'élève (ses notes passées dans une
  classe d'un autre cycle restent visibles) ;
- ne voit une **donnée de classe** (évaluation, devoir, séance) que si la classe est dans le
  périmètre ;
- n'écrit qu'avec l'élève ET la classe/évaluation dans le périmètre, vérifiés avant toute
  écriture ; un lot est refusé en entier (404, aucune écriture partielle) dès qu'un élément
  est hors périmètre.

Les comptes non restreints, administrateurs, enseignants et parents gardent leur comportement.
Les routes en SQL brut comparent des UUID en texte tiret : elles ne fonctionnent que sur
PostgreSQL (même limite documentée dans ``test_cycle_scope_students``).
"""
from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest

from conftest import get_test_client

client = get_test_client()

from sqlalchemy import bindparam, event, select, text  # noqa: E402
from sqlalchemy import inspect as sa_inspect  # noqa: E402

from app.core import cycle_scope  # noqa: E402
from app.core.cycle_routes import Policy, policy_for  # noqa: E402
from app.core.database import SessionLocal, engine, switch_tenant_context  # noqa: E402
from app.models import (  # noqa: E402
    AcademicYear, Assessment, Attendance, ExamSession, Grade, Semester, Student, Subject, Term,
)
from app.models.base import GUID  # noqa: E402
from test_cycle_scope_gate import _assert_denied, school, structure  # noqa: E402,F401
from test_cycle_scope_students import call, ids, world  # noqa: E402,F401

IS_SQLITE = engine.dialect.name == "sqlite"
needs_postgres = pytest.mark.skipif(IS_SQLITE, reason="SQL brut sur UUID en texte : PostgreSQL uniquement")
TODAY = date.today()


# --- Données --------------------------------------------------------------------------------

KEYS = (
    "subj_foreign", "a_cp", "a_cp_empty", "a_6e", "a_nocls", "a_foreign",
    "g_cp", "g_cp_old", "g_6e", "g_none", "g_foreign",
    "att_cp", "att_cp_old", "att_6e", "att_none", "att_foreign",
    "semester", "session",
    "hw_cp", "hw_cp2", "hw_6e", "hw_nocls", "hw_foreign",
    "sub_cp", "sub_6e", "sub_cp_on_6e", "sub_6e_on_cp", "sub_foreign",
    "gh_cp", "gh_cp_old", "gh_6e", "gh_foreign",
)


def _insert_raw(db, sql, **params):
    db.execute(text(sql), {key: (str(value) if value is not None else None) for key, value in params.items()})


@pytest.fixture
def schooling(school, world):
    """Évaluations, notes, présences, devoirs et rendus répartis entre les deux cycles,
    un élève sans inscription, un autre établissement.

    - ``s_cp`` (primaire) a une note et une présence passées dans une classe du collège
      (historique qui suit l'élève) ;
    - ``s_6e`` (collège) et ``s_none`` (sans inscription) sont hors périmètre ;
    - ``a_nocls`` / ``hw_nocls`` / ``att_none`` n'ont pas de classe."""
    t, o = school["tenant"], school["other"]
    k = {name: uuid4() for name in KEYS}
    subject = world["subject"]
    when = datetime(2026, 11, 2, 8, 0)
    with SessionLocal() as db:
        db.add(Subject(id=k["subj_foreign"], tenant_id=o, name="Maths", code="MAT-O"))
        db.add(Semester(id=k["semester"], tenant_id=t, academic_year_id=world["year"], name="S1", number=1,
                        start_date=date(2025, 9, 1), end_date=date(2026, 1, 31)))
        db.add(Term(tenant_id=t, academic_year_id=world["year"], name="T1", sequence_number=1,
                    start_date=date(2025, 9, 1), end_date=date(2025, 12, 20)))
        db.flush()
        db.add(ExamSession(id=k["session"], tenant_id=t, semester_id=k["semester"], code="SESS-1", name="Session 1",
                           starts_on=date(2025, 12, 1), ends_on=date(2025, 12, 15)))
        db.flush()
        for key, tid, subj, klass, session in (
            ("a_cp", t, subject, world["cls_cp"], k["session"]),
            ("a_cp_empty", t, subject, world["cls_cp"], None),
            ("a_6e", t, subject, world["cls_6e"], k["session"]),
            ("a_nocls", t, subject, None, None),
            ("a_foreign", o, k["subj_foreign"], world["foreign_class"], None),
        ):
            db.add(Assessment(id=k[key], tenant_id=tid, name=key, max_score=20.0, date=when, assessment_type="EXAM",
                              weight=1.0, subject_id=subj, class_id=klass, exam_session_id=session))
        db.flush()
        for key, tid, student, assessment, score in (
            ("g_cp", t, "s_cp", "a_cp", 15.0), ("g_cp_old", t, "s_cp", "a_6e", 12.0),
            ("g_6e", t, "s_6e", "a_6e", 10.0), ("g_none", t, "s_none", "a_cp", 9.0),
            ("g_foreign", o, "s_foreign", "a_foreign", 8.0),
        ):
            db.add(Grade(id=k[key], tenant_id=tid, student_id=world[student], assessment_id=k[assessment],
                         subject_id=k["subj_foreign"] if tid == o else subject, score=score, max_score=20.0))
        for key, tid, student, klass, status in (
            ("att_cp", t, "s_cp", "cls_cp", "PRESENT"), ("att_cp_old", t, "s_cp", "cls_6e", "ABSENT"),
            ("att_6e", t, "s_6e", "cls_6e", "PRESENT"), ("att_none", t, "s_none", None, "LATE"),
            ("att_foreign", o, "s_foreign", "foreign_class", "PRESENT"),
        ):
            db.add(Attendance(id=k[key], tenant_id=tid, student_id=world[student], date=TODAY - timedelta(days=1),
                              status=status, classroom_id=world[klass] if klass else None))
        db.commit()

    if not IS_SQLITE:
        with SessionLocal() as db:
            for tid in (t, o):
                switch_tenant_context(db, str(tid))
                if tid == t:
                    _insert_raw(db, """INSERT INTO teacher_assignments (tenant_id, user_id, classroom_id)
                                       VALUES (:tenant, :teacher, :classroom)""",
                                tenant=t, teacher=school["people"]["teacher"], classroom=world["cls_6e"])
                for key, klass in (("hw_cp", "cls_cp"), ("hw_cp2", "cls_cp"), ("hw_6e", "cls_6e"),
                                   ("hw_nocls", None), ("hw_foreign", "foreign_class")):
                    if (key == "hw_foreign") != (tid == o):
                        continue
                    _insert_raw(db, """INSERT INTO homework (id, tenant_id, title, classroom_id, status, created_at)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), :title, CAST(:cid AS uuid), 'PUBLISHED', NOW())""",
                                id=k[key], tid=tid, title=key, cid=world[klass] if klass else None)
                for key, hw, student in (
                    ("sub_cp", "hw_cp", "s_cp"), ("sub_6e", "hw_6e", "s_6e"),
                    ("sub_cp_on_6e", "hw_6e", "s_cp"), ("sub_6e_on_cp", "hw_cp", "s_6e"),
                    ("sub_foreign", "hw_foreign", "s_foreign"),
                ):
                    if (key == "sub_foreign") != (tid == o):
                        continue
                    _insert_raw(db, """INSERT INTO homework_submissions (id, tenant_id, homework_id, student_id, content, submitted_at)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:hw AS uuid), CAST(:sid AS uuid), 'copie', NOW())""",
                                id=k[key], tid=tid, hw=k[hw], sid=world[student])
                for key, grade in (("gh_cp", "g_cp"), ("gh_cp_old", "g_cp_old"), ("gh_6e", "g_6e"), ("gh_foreign", "g_foreign")):
                    if (key == "gh_foreign") != (tid == o):
                        continue
                    _insert_raw(db, """INSERT INTO grade_history (id, tenant_id, grade_id, old_score, new_score, created_at)
                                       VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:gid AS uuid), 10, 11, NOW())""",
                                id=k[key], tid=tid, gid=k[grade])
            db.commit()

    yield {**world, **k}

    with SessionLocal() as db:
        for tid in (t, o):
            switch_tenant_context(db, str(tid))
            if not IS_SQLITE:
                for table in ("grade_history", "homework_submissions", "homework", "teacher_assignments"):
                    db.execute(text(f"DELETE FROM {table} WHERE tenant_id = :tid"), {"tid": str(tid)})
            for model in (Attendance, Grade, Assessment, ExamSession, Semester, Term):
                db.query(model).filter(model.tenant_id == tid).delete()
        db.query(Subject).filter(Subject.id == k["subj_foreign"]).delete()
        db.commit()


# --- Utilitaires ----------------------------------------------------------------------------

def count(model, tenant):
    with SessionLocal() as db:
        return db.query(model).filter(model.tenant_id == tenant).count()


def raw_count(table, tenant):
    with SessionLocal() as db:
        return db.execute(text(f"SELECT COUNT(*) FROM {table} WHERE tenant_id = :t"), {"t": str(tenant)}).scalar()


def raw_value(sql, **params):
    with SessionLocal() as db:
        return db.execute(text(sql), {key: str(value) for key, value in params.items()}).scalar()


def get_grade(grade_id):
    with SessionLocal() as db:
        return db.get(Grade, grade_id)


def get_assessment(assessment_id):
    with SessionLocal() as db:
        return db.get(Assessment, assessment_id)


def get_attendance(attendance_id):
    with SessionLocal() as db:
        return db.get(Attendance, attendance_id)


def grade_body(world, student, assessment, score=14.0):
    return {"student_id": str(world[student]), "assessment_id": str(world[assessment]) if assessment else None,
            "subject_id": str(world["subject"]), "score": score, "max_score": 20.0}


def assessment_body(world, klass, name="Nouvelle"):
    return {"subject_id": str(world["subject"]), "name": name, "type": "EXAM", "date": "2026-11-20",
            "max_score": 20, "class_id": str(world[klass]) if klass else None}


# --- Registre -----------------------------------------------------------------------------

EXPECTED_POLICIES = {
    **{(m, f"/api/v1{p}"): Policy.FILTERED for m, p in (
        ("GET", "/assessments/"), ("POST", "/assessments/"), ("GET", "/assessments/{id}/"),
        ("PUT", "/assessments/{id}/"), ("DELETE", "/assessments/{id}/"),
        ("GET", "/attendance/"), ("POST", "/attendance/"), ("POST", "/attendance/bulk/"),
        ("GET", "/attendance/stats/"), ("PATCH", "/attendance/{attendance_id}/"),
        ("DELETE", "/attendance/{attendance_id}/"),
        ("GET", "/class-sessions/"), ("GET", "/class-sessions/active/"),
        ("GET", "/exam-sessions/"), ("GET", "/grade-history/"),
        ("GET", "/grades/"), ("POST", "/grades/"), ("POST", "/grades/bulk"), ("GET", "/grades/history/"),
        ("GET", "/grades/student/{student_id}/average/"), ("GET", "/grades/{grade_id}/"),
        ("PUT", "/grades/{grade_id}/"), ("DELETE", "/grades/{grade_id}/"),
        ("GET", "/homework-submissions/"), ("PUT", "/homework-submissions/{submission_id}"),
        ("GET", "/homework/"), ("POST", "/homework/"), ("GET", "/homework/submissions/{student_id}/"),
        ("POST", "/homework/submissions/{submission_id}/grade/"), ("GET", "/homework/{homework_id}/"),
        ("PUT", "/homework/{homework_id}/"), ("DELETE", "/homework/{homework_id}/"),
        ("PUT", "/homework/{homework_id}/submissions/{submission_id}/"), ("POST", "/homework/{homework_id}/submit/"),
        ("GET", "/student-check-ins/"), ("GET", "/transcripts/{student_id}/"),
    )},
    ("PUT", "/api/v1/presence/"): Policy.INDEPENDENT,
    ("POST", "/api/v1/exam-sessions/"): Policy.DENY,
    ("PATCH", "/api/v1/exam-sessions/{session_id}/"): Policy.DENY,
}


def test_the_39_routes_of_the_lot_are_classified_as_decided():
    assert len(EXPECTED_POLICIES) == 39
    for (method, path), expected in EXPECTED_POLICIES.items():
        assert policy_for(method, path) is expected, (method, path)


@pytest.mark.parametrize("url", [
    "/school-life/gamification/stats/", "/payments/invoices/", "/students/dashboard/",
])
def test_sibling_routes_not_in_the_lot_stay_denied(school, url):
    _assert_denied(call(school, "secretary", "GET", url))


def test_exam_session_writes_stay_denied_for_a_restricted_account(school, schooling):
    created = call(school, "director", "POST", "/exam-sessions/", json={
        "semester_id": str(schooling["semester"]), "code": "X", "name": "X", "session_type": "RETAKE",
        "sequence": 2, "starts_on": "2026-02-10", "ends_on": "2026-02-15", "selection_policy": "BEST"})
    _assert_denied(created)
    patched = call(school, "director", "PATCH", f"/exam-sessions/{schooling['session']}/",
                   json={"expected_revision": 1, "status": "OPEN"})
    _assert_denied(patched)
    with SessionLocal() as db:
        assert db.get(ExamSession, schooling["session"]).status == "DRAFT"


# --- Briques ------------------------------------------------------------------------------

def test_missing_cycle_key_fails_closed():
    with pytest.raises(RuntimeError):
        cycle_scope.is_cycle_restricted({"id": "x", "roles": ["DIRECTOR"]})


def test_batch_helpers_refuse_the_whole_batch_and_unreadable_ids(school, schooling):
    t = school["tenant"]
    restricted = {"_cycle_ids": [str(school["cycles"]["primaire"])]}
    with SessionLocal() as db:
        cycle_scope.require_students_in_scope(db, t, {"_cycle_ids": None}, [schooling["s_6e"], "n'importe quoi"])
        cycle_scope.require_students_in_scope(db, t, restricted, [schooling["s_cp"], str(schooling["s_cp"])])
        cycle_scope.require_classes_in_scope(db, t, restricted, [schooling["cls_cp"]])
        cycle_scope.require_assessments_in_scope(db, t, restricted, [schooling["a_cp"], schooling["a_cp_empty"]])
        for call_args in (
            (cycle_scope.require_students_in_scope, [schooling["s_cp"], schooling["s_6e"]]),
            (cycle_scope.require_students_in_scope, [schooling["s_cp"], "pas-un-uuid"]),
            (cycle_scope.require_students_in_scope, [None]),
            (cycle_scope.require_classes_in_scope, [schooling["cls_cp"], None]),
            (cycle_scope.require_classes_in_scope, [schooling["cls_cp"], schooling["cls_6e"]]),
            (cycle_scope.require_assessments_in_scope, [schooling["a_cp"], schooling["a_nocls"]]),
            (cycle_scope.require_assessments_in_scope, [schooling["a_foreign"]]),
        ):
            with pytest.raises(Exception) as caught:
                call_args[0](db, t, restricted, call_args[1])
            assert getattr(caught.value, "status_code", None) == 404, call_args


def test_sql_fragment_is_equivalent_to_the_orm_clause(school, schooling):
    """``student_scope_sql`` (requêtes ``text()``) doit rendre exactement le même verdict que
    ``student_scope_clause`` : année courante, repli sans année courante, statut sans casse."""
    t = school["tenant"]
    cycles = [str(school["cycles"]["primaire"])]

    def verdicts():
        with SessionLocal() as db:
            class_ids = cycle_scope.allowed_class_ids(db, t, cycles)
            orm = {row[0] for row in db.execute(select(Student.id).where(
                Student.tenant_id == t, cycle_scope.student_scope_clause(Student.id, class_ids, tenant_id=t)))}
            sql, binds = cycle_scope.student_scope_sql("s.id", class_ids, tenant_id=t, tag="par")
            raw = {row[0] for row in db.execute(
                text(f"SELECT s.id FROM students s WHERE s.tenant_id = :t AND {sql}").bindparams(
                    bindparam("t", t, type_=GUID()), *binds))}
            none_sql, none_binds = cycle_scope.student_scope_sql("s.id", [], tenant_id=t)
            assert none_binds == [] and db.execute(text(f"SELECT 1 WHERE {none_sql}")).first() is None
        return orm, raw

    orm, raw = verdicts()
    assert schooling["s_cp"] in {UUID(str(i)) for i in orm}
    assert {UUID(str(i)) for i in orm} == {UUID(str(i)) for i in raw}
    # Sans année courante : toute inscription ACTIVE compte (s_old_only n'a qu'une inscription d'année passée).
    with SessionLocal() as db:
        db.query(AcademicYear).filter(AcademicYear.tenant_id == t).update({"is_current": False})
        db.commit()
    orm, raw = verdicts()
    assert {UUID(str(i)) for i in orm} == {UUID(str(i)) for i in raw}
    assert schooling["s_old_only"] in {UUID(str(i)) for i in orm}


# --- Évaluations ----------------------------------------------------------------------------

@needs_postgres
def test_assessment_list_is_limited_to_classes_of_the_cycle(school, schooling):
    mine = {str(schooling["a_cp"]), str(schooling["a_cp_empty"])}
    assert ids(call(school, "director", "GET", "/assessments/")) == mine
    everything = mine | {str(schooling["a_6e"]), str(schooling["a_nocls"])}
    for who in ("secretary_free", "admin_residual", "teacher"):
        assert ids(call(school, who, "GET", "/assessments/")) == everything, who
    # Un filtre de classe hors périmètre ne rend rien (jamais l'évaluation d'un autre cycle).
    hidden = call(school, "director", "GET", "/assessments/", params={"classId": str(schooling["cls_6e"])})
    assert ids(hidden) == set()


@needs_postgres
def test_assessment_detail_in_scope_and_404_elsewhere(school, schooling):
    assert call(school, "director", "GET", f"/assessments/{schooling['a_cp']}/").status_code == 200
    for name in ("a_6e", "a_nocls", "a_foreign"):
        assert call(school, "director", "GET", f"/assessments/{schooling[name]}/").status_code == 404, name
    assert call(school, "director", "GET", f"/assessments/{uuid4()}/").status_code == 404
    for who in ("admin_residual", "teacher"):
        assert call(school, who, "GET", f"/assessments/{schooling['a_6e']}/").status_code == 200, who


@needs_postgres
def test_assessment_create_needs_a_class_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    before = count(Assessment, t)
    for klass in ("cls_6e", "cls_nolevel", "foreign_class", None):
        response = call(school, "director", "POST", "/assessments/", json=assessment_body(schooling, klass))
        assert response.status_code == 404, klass
    assert count(Assessment, t) == before
    created = call(school, "director", "POST", "/assessments/", json=assessment_body(schooling, "cls_cp"))
    assert created.status_code == 200, created.text
    assert count(Assessment, t) == before + 1
    # Non restreint : toujours libre de choisir la classe, ou de n'en avoir aucune.
    for klass in ("cls_6e", None):
        free = call(school, "admin_residual", "POST", "/assessments/", json=assessment_body(schooling, klass, "libre"))
        assert free.status_code == 200, (klass, free.text)


@needs_postgres
def test_assessment_update_and_delete_need_the_class_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    for name in ("a_6e", "a_nocls", "a_foreign"):
        denied = call(school, "director", "PUT", f"/assessments/{schooling[name]}/", json={"name": "Pirate"})
        assert denied.status_code == 404, name
        assert call(school, "director", "DELETE", f"/assessments/{schooling[name]}/").status_code == 404, name
        row = get_assessment(schooling[name])
        assert row is not None and row.name == name
    # Déplacer une évaluation du périmètre vers une classe d'un autre cycle est refusé.
    move = call(school, "director", "PUT", f"/assessments/{schooling['a_cp']}/",
                json={"class_id": str(schooling["cls_6e"])})
    assert move.status_code == 404
    assert get_assessment(schooling["a_cp"]).class_id == schooling["cls_cp"]
    # Dans le périmètre : la garde passe (modification puis suppression d'une évaluation sans note).
    ok = call(school, "director", "PUT", f"/assessments/{schooling['a_cp_empty']}/", json={"name": "Renommée"})
    assert ok.status_code == 200, ok.text
    assert get_assessment(schooling["a_cp_empty"]).name == "Renommée"
    before = count(Assessment, t)
    assert call(school, "director", "DELETE", f"/assessments/{schooling['a_cp_empty']}/").status_code == 200
    assert count(Assessment, t) == before - 1
    # Non restreint : atteint toutes les évaluations.
    assert call(school, "admin_residual", "PUT", f"/assessments/{schooling['a_nocls']}/", json={"name": "Libre"}).status_code == 200


# --- Notes ----------------------------------------------------------------------------------

def test_grade_list_follows_the_student_with_exact_total(school, schooling):
    restricted = call(school, "director", "GET", "/grades/")
    assert ids(restricted) == {str(schooling["g_cp"]), str(schooling["g_cp_old"])}
    assert restricted.json()["total"] == 2 and restricted.json()["pages"] == 1
    page = call(school, "director", "GET", "/grades/", params={"page_size": 1, "page": 2}).json()
    assert page["total"] == 2 and len(page["items"]) == 1 and page["pages"] == 2
    # Historique : la note passée dans une classe du collège suit l'élève du périmètre.
    assert str(schooling["g_cp_old"]) in ids(restricted)
    # Filtre par élève hors périmètre : rien ; total exact.
    other = call(school, "director", "GET", "/grades/", params={"student_id": str(schooling["s_6e"])}).json()
    assert other["total"] == 0 and other["items"] == []
    everything = {str(schooling[n]) for n in ("g_cp", "g_cp_old", "g_6e", "g_none")}
    for who in ("admin_residual", "teacher"):
        listed = call(school, who, "GET", "/grades/")
        assert ids(listed) == everything and listed.json()["total"] == 4, who
    assert call(school, "secretary_free", "GET", "/grades/").json()["total"] == 4


@needs_postgres
def test_parent_still_sees_the_grades_of_their_children(school, schooling):
    response = call(school, "parent", "GET", "/grades/")
    assert ids(response) == {str(schooling[n]) for n in ("g_cp", "g_cp_old", "g_6e", "g_none")}


def test_grade_detail_follows_the_student(school, schooling):
    for name in ("g_cp", "g_cp_old"):
        assert call(school, "director", "GET", f"/grades/{schooling[name]}/").status_code == 200, name
    for name in ("g_6e", "g_none", "g_foreign"):
        assert call(school, "director", "GET", f"/grades/{schooling[name]}/").status_code == 404, name
    assert call(school, "teacher", "GET", f"/grades/{schooling['g_6e']}/").status_code == 200


def test_grade_average_follows_the_student(school, schooling):
    ok = call(school, "director", "GET", f"/grades/student/{schooling['s_cp']}/average/")
    assert ok.status_code == 200, ok.text
    assert ok.json()["count"] == 2  # la note passée au collège compte : l'historique suit l'élève
    for name in ("s_6e", "s_none", "s_foreign"):
        assert call(school, "director", "GET", f"/grades/student/{schooling[name]}/average/").status_code == 404, name
    assert call(school, "teacher", "GET", f"/grades/student/{schooling['s_6e']}/average/").status_code == 200


@needs_postgres
def test_grade_create_needs_student_and_assessment_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    before = count(Grade, t)
    for student, assessment in (
        ("s_6e", "a_cp_empty"), ("s_cp", "a_6e"), ("s_cp", "a_nocls"), ("s_none", "a_cp_empty"),
        ("s_cp", None), ("s_foreign", "a_cp_empty"), ("s_cp", "a_foreign"),
    ):
        response = call(school, "director", "POST", "/grades/", json=grade_body(schooling, student, assessment))
        assert response.status_code == 404, (student, assessment)
    assert count(Grade, t) == before
    ok = call(school, "director", "POST", "/grades/", json=grade_body(schooling, "s_cp", "a_cp_empty"))
    assert ok.status_code == 201, ok.text
    assert count(Grade, t) == before + 1
    free = call(school, "admin_residual", "POST", "/grades/", json=grade_body(schooling, "s_6e", "a_6e"))
    assert free.status_code == 201, free.text


def test_grade_update_and_delete_need_student_and_assessment_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    # g_6e : élève hors périmètre ; g_cp_old : élève du périmètre mais évaluation d'une classe du collège
    # (lisible, non modifiable : l'écriture exige l'élève ET l'évaluation dans le périmètre).
    for name in ("g_6e", "g_none", "g_cp_old", "g_foreign"):
        before = get_grade(schooling[name])
        denied = call(school, "director", "PUT", f"/grades/{schooling[name]}/", json={"score": 1.0})
        assert denied.status_code == 404, name
        assert call(school, "director", "DELETE", f"/grades/{schooling[name]}/").status_code == 404, name
        assert get_grade(schooling[name]).score == before.score
    # Déplacer une note du périmètre vers un élève ou une évaluation hors périmètre est refusé.
    for patch in ({"student_id": str(schooling["s_6e"])}, {"assessment_id": str(schooling["a_6e"])}):
        assert call(school, "director", "PUT", f"/grades/{schooling['g_cp']}/", json=patch).status_code == 404
    assert get_grade(schooling["g_cp"]).score == 15.0
    ok = call(school, "director", "PUT", f"/grades/{schooling['g_cp']}/", json={"score": 16.0})
    assert ok.status_code == 200, ok.text
    assert get_grade(schooling["g_cp"]).score == 16.0
    before = count(Grade, t)
    assert call(school, "director", "DELETE", f"/grades/{schooling['g_cp']}/").status_code == 204
    assert count(Grade, t) == before - 1
    # Non restreint : atteint toutes les notes.
    assert call(school, "admin_residual", "PUT", f"/grades/{schooling['g_6e']}/", json={"score": 11.0}).status_code == 200
    assert call(school, "admin_residual", "DELETE", f"/grades/{schooling['g_none']}/").status_code == 204


@needs_postgres
def test_grade_bulk_is_all_or_nothing(school, schooling):
    t = school["tenant"]
    before = count(Grade, t)

    def item(student, assessment):
        return {"student_id": str(schooling[student]), "assessment_id": str(schooling[assessment]), "score": 12.0}

    for batch in (
        [item("s_cp", "a_cp_empty"), item("s_6e", "a_6e")],          # un élève hors périmètre
        [item("s_cp", "a_cp_empty"), item("s_cp", "a_6e")],          # une évaluation hors périmètre
        [item("s_cp", "a_cp_empty"), item("s_cp", "a_nocls")],       # une évaluation sans classe
        [item("s_none", "a_cp_empty"), item("s_cp", "a_cp_empty")],  # un élève sans inscription
    ):
        response = call(school, "director", "POST", "/grades/bulk", json={"grades": batch})
        assert response.status_code == 404, batch
        assert count(Grade, t) == before  # aucune écriture partielle
    # Un lot entièrement dans le périmètre franchit la garde (jamais 404). L'INSERT du handler vise la
    # colonne inexistante ``grades.comment`` (défaut antérieur, hors lot : 400 avant et après B2c-1) :
    # la réussite de l'écriture elle-même n'est donc pas démontrable ici.
    ok = call(school, "director", "POST", "/grades/bulk", json={"grades": [item("s_cp", "a_cp_empty")]})
    assert ok.status_code != 404
    free = call(school, "admin_residual", "POST", "/grades/bulk",
                json={"grades": [item("s_cp", "a_cp_empty"), item("s_6e", "a_6e")]})
    assert free.status_code != 404  # un compte non restreint n'est jamais refusé pour le périmètre
    assert count(Grade, t) == before


@needs_postgres
def test_grade_history_alias_follows_the_student(school, schooling):
    restricted = ids(call(school, "director", "GET", "/grade-history/"))
    assert restricted == {str(schooling["gh_cp"]), str(schooling["gh_cp_old"])}
    everything = {str(schooling[n]) for n in ("gh_cp", "gh_cp_old", "gh_6e")}
    for who in ("admin_residual", "teacher"):
        assert ids(call(school, who, "GET", "/grade-history/")) == everything, who


@needs_postgres
def test_canonical_grade_history_handler_follows_the_student(school, schooling):
    """``GET /grades/history/`` est masquée par ``GET /grades/{grade_id}/`` (déclarée avant : 422, défaut
    antérieur hors lot). Le handler reste classé FILTERED et filtré : on l'appelle directement."""
    from starlette.requests import Request
    from app.api.v1.endpoints.academic import grades

    t = school["tenant"]

    def history(roles, cycles):
        user = {"id": str(uuid4()), "tenant_id": str(t), "roles": roles, "_cycle_ids": cycles}
        with SessionLocal() as db:
            switch_tenant_context(db, str(t))
            rows = grades.list_grade_history(
                request=Request({"type": "http", "method": "GET", "path": "/", "headers": []}),
                grade_id=None, student_id=None, ordering="-created_at", db=db, current_user=user)
            return {str(row["id"]) for row in rows}

    assert history(["DIRECTOR"], [str(school["cycles"]["primaire"])]) == {
        str(schooling["gh_cp"]), str(schooling["gh_cp_old"])}
    assert history(["TENANT_ADMIN"], None) == {str(schooling[n]) for n in ("gh_cp", "gh_cp_old", "gh_6e")}


# --- Présences ------------------------------------------------------------------------------

@needs_postgres
def test_attendance_list_and_stats_follow_the_student(school, schooling):
    listed = call(school, "secretary", "GET", "/attendance/")
    assert ids(listed) == {str(schooling["att_cp"]), str(schooling["att_cp_old"])}  # historique inclus
    assert listed.json()["total"] == 2
    paged = call(school, "secretary", "GET", "/attendance/", params={"limit": 1}).json()
    assert len(paged["items"]) == 1
    hidden = call(school, "secretary", "GET", "/attendance/", params={"student_id": str(schooling["s_6e"])}).json()
    assert hidden["items"] == []
    everything = {str(schooling[n]) for n in ("att_cp", "att_cp_old", "att_6e", "att_none")}
    for who in ("secretary_free", "admin_residual", "teacher"):
        assert ids(call(school, who, "GET", "/attendance/")) == everything, who
    stats = call(school, "secretary", "GET", "/attendance/stats/").json()
    assert (stats["total"], stats["present"], stats["absent"], stats["late"]) == (2, 1, 1, 0)
    assert call(school, "secretary", "GET", "/attendance/stats/",
                params={"student_id": str(schooling["s_6e"])}).json()["total"] == 0
    assert call(school, "secretary_free", "GET", "/attendance/stats/").json()["total"] == 4


def attendance_body(schooling, student, klass, day=0):
    return {"student_id": str(schooling[student]), "date": str(TODAY - timedelta(days=10 + day)),
            "status": "PRESENT", "classroom_id": str(schooling[klass]) if klass else None}


@needs_postgres
def test_attendance_create_needs_student_and_class_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    before = count(Attendance, t)
    for student, klass in (("s_6e", "cls_6e"), ("s_cp", "cls_6e"), ("s_none", "cls_cp"), ("s_cp", None),
                           ("s_foreign", "cls_cp"), ("s_cp", "foreign_class")):
        response = call(school, "secretary", "POST", "/attendance/", json=attendance_body(schooling, student, klass))
        assert response.status_code == 404, (student, klass)
    assert count(Attendance, t) == before
    ok = call(school, "secretary", "POST", "/attendance/", json=attendance_body(schooling, "s_cp", "cls_cp"))
    assert ok.status_code == 201, ok.text
    free = call(school, "admin_residual", "POST", "/attendance/", json=attendance_body(schooling, "s_6e", "cls_6e"))
    assert free.status_code == 201, free.text
    assert count(Attendance, t) == before + 2


@needs_postgres
def test_attendance_bulk_is_all_or_nothing(school, schooling):
    t = school["tenant"]
    before = count(Attendance, t)
    good = attendance_body(schooling, "s_cp", "cls_cp", 1)
    for bad in (attendance_body(schooling, "s_6e", "cls_6e", 2), attendance_body(schooling, "s_cp", "cls_6e", 3),
                attendance_body(schooling, "s_cp", None, 4)):
        response = call(school, "secretary", "POST", "/attendance/bulk/", json={"records": [good, bad]})
        assert response.status_code == 404, bad
        assert count(Attendance, t) == before  # aucune écriture partielle
    ok = call(school, "secretary", "POST", "/attendance/bulk/", json={"records": [good]})
    assert ok.status_code == 201 and ok.json()["inserted"] == 1
    free = call(school, "admin_residual", "POST", "/attendance/bulk/", json={"records": [
        attendance_body(schooling, "s_6e", "cls_6e", 5), attendance_body(schooling, "s_cp", "cls_cp", 6)]})
    assert free.status_code == 201 and free.json()["inserted"] == 2
    assert count(Attendance, t) == before + 3


@needs_postgres
def test_attendance_update_and_delete_need_student_and_class_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    # att_6e : élève hors périmètre ; att_cp_old : élève du périmètre, classe d'un autre cycle ;
    # att_none : sans classe. Aucune n'est modifiable par le compte restreint.
    for name in ("att_6e", "att_cp_old", "att_none", "att_foreign"):
        before = get_attendance(schooling[name]).status
        denied = call(school, "secretary", "PATCH", f"/attendance/{schooling[name]}/", json={"status": "EXCUSED"})
        assert denied.status_code == 404, name
        assert call(school, "secretary", "DELETE", f"/attendance/{schooling[name]}/").status_code == 404, name
        row = get_attendance(schooling[name])
        assert row is not None and row.status == before
    ok = call(school, "secretary", "PATCH", f"/attendance/{schooling['att_cp']}/", json={"status": "LATE"})
    assert ok.status_code == 200, ok.text
    assert get_attendance(schooling["att_cp"]).status == "LATE"
    before = count(Attendance, t)
    assert call(school, "secretary", "DELETE", f"/attendance/{schooling['att_cp']}/").status_code == 204
    assert count(Attendance, t) == before - 1
    # Non restreint : atteint toutes les présences.
    assert call(school, "admin_residual", "PATCH", f"/attendance/{schooling['att_6e']}/",
                json={"status": "EXCUSED"}).status_code == 200
    assert call(school, "admin_residual", "DELETE", f"/attendance/{schooling['att_none']}/").status_code == 204


# --- Devoirs et rendus ------------------------------------------------------------------------

@needs_postgres
def test_homework_list_is_limited_with_exact_total(school, schooling):
    restricted = call(school, "director", "GET", "/homework/")
    assert ids(restricted) == {str(schooling["hw_cp"]), str(schooling["hw_cp2"])}
    assert restricted.json()["total"] == 2
    paged = call(school, "director", "GET", "/homework/", params={"page_size": 1}).json()
    assert paged["total"] == 2 and len(paged["items"]) == 1 and paged["pages"] == 2
    assert call(school, "director", "GET", "/homework/", params={"class_id": str(schooling["cls_6e"])}).json()["total"] == 0
    everything = {str(schooling[n]) for n in ("hw_cp", "hw_cp2", "hw_6e", "hw_nocls")}
    for who in ("admin_residual", "teacher"):
        listed = call(school, who, "GET", "/homework/")
        assert ids(listed) == everything and listed.json()["total"] == 4, who


@needs_postgres
def test_homework_detail_hides_other_classes_and_other_cycle_submissions(school, schooling):
    ok = call(school, "director_teacher", "GET", f"/homework/{schooling['hw_cp']}/")
    assert ok.status_code == 200
    # sub_6e_on_cp : rendu d'un élève hors périmètre sur un devoir du périmètre : masqué.
    assert {s["id"] for s in ok.json()["submissions"]} == {str(schooling["sub_cp"])}
    for name in ("hw_6e", "hw_nocls", "hw_foreign"):
        assert call(school, "director_teacher", "GET", f"/homework/{schooling[name]}/").status_code == 404, name
    free = call(school, "teacher", "GET", f"/homework/{schooling['hw_cp']}/")
    assert {s["id"] for s in free.json()["submissions"]} == {str(schooling["sub_cp"]), str(schooling["sub_6e_on_cp"])}
    assert call(school, "teacher", "GET", f"/homework/{schooling['hw_6e']}/").status_code == 200


@needs_postgres
def test_student_submissions_follow_the_student(school, schooling):
    ok = call(school, "director_teacher", "GET", f"/homework/submissions/{schooling['s_cp']}/")
    # Historique : le rendu de s_cp sur un devoir d'une classe du collège reste visible.
    assert ids(ok) == {str(schooling["sub_cp"]), str(schooling["sub_cp_on_6e"])}
    for name in ("s_6e", "s_none", "s_foreign"):
        assert call(school, "director_teacher", "GET", f"/homework/submissions/{schooling[name]}/").status_code == 404, name
    assert call(school, "teacher", "GET", f"/homework/submissions/{schooling['s_6e']}/").status_code == 200


@needs_postgres
def test_homework_create_needs_a_class_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    before = raw_count("homework", t)
    for klass in ("cls_6e", "cls_nolevel", "foreign_class", None):
        body = {"title": "Pirate", "class_id": str(schooling[klass]) if klass else None}
        assert call(school, "director_teacher", "POST", "/homework/", json=body).status_code == 404, klass
    assert raw_count("homework", t) == before
    ok = call(school, "director_teacher", "POST", "/homework/", json={"title": "Ok", "class_id": str(schooling["cls_cp"])})
    assert ok.status_code == 201, ok.text
    for klass in (str(schooling["cls_6e"]), None):
        free = call(school, "teacher", "POST", "/homework/", json={"title": "Libre", "class_id": klass})
        assert free.status_code == 201, (klass, free.text)


@needs_postgres
def test_homework_update_and_delete_need_the_class_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    for name in ("hw_6e", "hw_nocls", "hw_foreign"):
        assert call(school, "director_teacher", "PUT", f"/homework/{schooling[name]}/",
                    json={"title": "Pirate"}).status_code == 404, name
        assert call(school, "director_teacher", "DELETE", f"/homework/{schooling[name]}/").status_code == 404, name
        assert raw_value("SELECT title FROM homework WHERE id = CAST(:i AS uuid)", i=schooling[name]) == name
    # Déplacer un devoir du périmètre vers un autre cycle, ou le retirer de sa classe, est refusé.
    for patch in ({"class_id": str(schooling["cls_6e"])}, {"class_id": None}):
        assert call(school, "director_teacher", "PUT", f"/homework/{schooling['hw_cp']}/", json=patch).status_code == 404
    assert raw_value("SELECT classroom_id FROM homework WHERE id = CAST(:i AS uuid)", i=schooling["hw_cp"]) is not None
    ok = call(school, "director_teacher", "PUT", f"/homework/{schooling['hw_cp']}/", json={"title": "Renommé"})
    assert ok.status_code == 200, ok.text
    assert raw_value("SELECT title FROM homework WHERE id = CAST(:i AS uuid)", i=schooling["hw_cp"]) == "Renommé"
    before = raw_count("homework", t)
    assert call(school, "director_teacher", "DELETE", f"/homework/{schooling['hw_cp2']}/").status_code == 204
    assert raw_count("homework", t) == before - 1
    assert call(school, "teacher", "PUT", f"/homework/{schooling['hw_6e']}/", json={"title": "Libre"}).status_code == 200
    assert call(school, "teacher", "DELETE", f"/homework/{schooling['hw_nocls']}/").status_code == 204


@needs_postgres
def test_homework_submit_needs_homework_and_student_in_scope_without_effect(school, schooling):
    t = school["tenant"]
    before = raw_count("homework_submissions", t)

    def submit(who, homework, student):
        return call(school, who, "POST", f"/homework/{schooling[homework]}/submit/",
                    json={"homework_id": str(schooling[homework]), "student_id": str(schooling[student]), "content": "x"})

    for homework, student in (("hw_6e", "s_cp"), ("hw_cp2", "s_6e"), ("hw_nocls", "s_cp"),
                              ("hw_foreign", "s_cp"), ("hw_cp2", "s_none"), ("hw_cp2", "s_foreign")):
        assert submit("director_teacher", homework, student).status_code == 404, (homework, student)
    assert raw_count("homework_submissions", t) == before
    assert submit("director_teacher", "hw_cp2", "s_cp").status_code == 201
    assert submit("teacher", "hw_6e", "s_none").status_code == 201
    assert raw_count("homework_submissions", t) == before + 2


@needs_postgres
def test_student_submission_content_update_needs_homework_and_student_in_scope(school, schooling):
    def edit(who, homework, submission):
        return call(school, who, "PUT", f"/homework/{schooling[homework]}/submissions/{schooling[submission]}/",
                    json={"content": "modifié"})

    # sub_cp_on_6e : élève du périmètre, devoir d'un autre cycle ; sub_6e_on_cp : devoir du périmètre,
    # élève hors périmètre ; sub_6e : tout hors périmètre. Aucun n'est modifiable.
    for homework, submission in (("hw_6e", "sub_cp_on_6e"), ("hw_cp", "sub_6e_on_cp"), ("hw_6e", "sub_6e"),
                                 ("hw_foreign", "sub_foreign")):
        assert edit("director_teacher", homework, submission).status_code == 404, submission
        assert raw_value("SELECT content FROM homework_submissions WHERE id = CAST(:i AS uuid)",
                         i=schooling[submission]) == "copie"
    assert edit("director_teacher", "hw_cp", "sub_cp").status_code == 200
    assert raw_value("SELECT content FROM homework_submissions WHERE id = CAST(:i AS uuid)", i=schooling["sub_cp"]) == "modifié"
    assert edit("teacher", "hw_6e", "sub_6e").status_code == 200


@needs_postgres
def test_submission_grading_needs_homework_and_student_in_scope_without_effect(school, schooling):
    def grade(who, submission):
        return call(school, who, "POST", f"/homework/submissions/{schooling[submission]}/grade/",
                    json={"grade": 14, "feedback": "bien"})

    for submission in ("sub_6e", "sub_cp_on_6e", "sub_6e_on_cp", "sub_foreign"):
        assert grade("director_teacher", submission).status_code == 404, submission
        assert raw_value("SELECT grade FROM homework_submissions WHERE id = CAST(:i AS uuid)",
                         i=schooling[submission]) is None
    assert grade("director_teacher", "sub_cp").status_code == 200
    assert float(raw_value("SELECT grade FROM homework_submissions WHERE id = CAST(:i AS uuid)", i=schooling["sub_cp"])) == 14.0
    assert grade("teacher", "sub_6e").status_code == 200


@needs_postgres
def test_homework_submissions_alias_list_and_grading_are_scoped(school, schooling):
    listed = call(school, "director_teacher", "GET", "/homework-submissions/")
    assert ids(listed) == {str(schooling["sub_cp"]), str(schooling["sub_cp_on_6e"])}
    everything = {str(schooling[n]) for n in ("sub_cp", "sub_6e", "sub_cp_on_6e", "sub_6e_on_cp")}
    assert ids(call(school, "teacher", "GET", "/homework-submissions/")) == everything
    for submission in ("sub_6e", "sub_cp_on_6e", "sub_6e_on_cp", "sub_foreign"):
        response = call(school, "director_teacher", "PUT", f"/homework-submissions/{schooling[submission]}",
                        json={"grade": 12})
        assert response.status_code == 404, submission
        assert raw_value("SELECT grade FROM homework_submissions WHERE id = CAST(:i AS uuid)",
                         i=schooling[submission]) is None
    ok = call(school, "director_teacher", "PUT", f"/homework-submissions/{schooling['sub_cp']}", json={"grade": 12})
    assert ok.status_code == 200, ok.text
    assert call(school, "teacher", "PUT", f"/homework-submissions/{schooling['sub_6e']}", json={"grade": 9}).status_code == 200


# --- Relevés, sessions d'examen, séances, pointages, présence en ligne ----------------------------

@needs_postgres
def test_transcript_follows_the_student(school, schooling):
    params = {"academic_year_id": str(schooling["year"])}
    ok = call(school, "secretary", "GET", f"/transcripts/{schooling['s_cp']}/", params=params)
    assert ok.status_code == 200, ok.text
    for name in ("s_6e", "s_none", "s_foreign"):
        assert call(school, "secretary", "GET", f"/transcripts/{schooling[name]}/", params=params).status_code == 404, name
    assert call(school, "secretary_free", "GET", f"/transcripts/{schooling['s_6e']}/", params=params).status_code == 200


def test_transcript_of_a_student_out_of_scope_is_404_on_every_backend(school, schooling):
    params = {"academic_year_id": str(schooling["year"])}
    for name in ("s_6e", "s_none", "s_foreign"):
        assert call(school, "secretary", "GET", f"/transcripts/{schooling[name]}/", params=params).status_code == 404, name


def test_exam_session_list_counts_only_assessments_of_the_cycle(school, schooling):
    def count_of(who):
        response = call(school, who, "GET", "/exam-sessions/")
        assert response.status_code == 200, response.text
        sessions = {item["id"]: item for item in response.json()}
        return sessions[str(schooling["session"])]["assessment_count"]

    # a_cp (primaire) et a_6e (collège) sont rattachées à la session.
    assert count_of("director") == 1
    assert count_of("admin_residual") == 2
    assert call(school, "teacher", "GET", "/exam-sessions/").status_code == 200


@needs_postgres
@pytest.mark.parametrize("path", ["/class-sessions/", "/class-sessions/active/"])
def test_class_sessions_are_limited_to_classes_of_the_cycle(school, schooling, path):
    """La table ``class_sessions`` n'existe dans aucune migration : on la crée pour le test
    (la route avale l'erreur et renvoie [] quand elle est absente)."""
    t = school["tenant"]
    keys = {name: uuid4() for name in ("cs_cp", "cs_6e", "cs_nocls")}
    if sa_inspect(engine).has_table("class_sessions"):
        pytest.skip("la table class_sessions existe déjà : on ne la modifie ni ne la supprime")
    with SessionLocal() as db:
        db.execute(text("""CREATE TABLE class_sessions (
            id uuid PRIMARY KEY, tenant_id uuid NOT NULL, class_id uuid, subject_id uuid, room_id uuid,
            teacher_id uuid, status text, start_time timestamptz, end_time timestamptz)"""))
        for name, klass in (("cs_cp", "cls_cp"), ("cs_6e", "cls_6e"), ("cs_nocls", None)):
            db.execute(text("""INSERT INTO class_sessions (id, tenant_id, class_id, status, start_time, end_time)
                               VALUES (CAST(:i AS uuid), CAST(:t AS uuid), CAST(:c AS uuid), 'ACTIVE',
                                       NOW() - interval '1 hour', NOW() + interval '1 hour')"""),
                       {"i": str(keys[name]), "t": str(t), "c": str(schooling[klass]) if klass else None})
        db.commit()
    try:
        assert ids(call(school, "director", "GET", path)) == {str(keys["cs_cp"])}
        everything = {str(v) for v in keys.values()}
        for who in ("secretary_free", "admin_residual", "teacher"):
            assert ids(call(school, who, "GET", path)) == everything, who
    finally:  # créée par ce test (le test est ignoré si elle existait) : supprimée par lui
        with SessionLocal() as db:
            db.execute(text("DROP TABLE class_sessions"))
            db.commit()


def test_student_check_ins_alias_applies_the_student_scope(school, schooling):
    """L'alias lit des colonnes qui n'existent pas dans ``student_check_ins`` : il répond toujours
    [] (erreur avalée). Le filtre est posé pour le jour où il sera réparé : on vérifie la requête
    envoyée à la base."""
    statements = []

    def spy(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", spy)
    try:
        assert call(school, "director", "GET", "/student-check-ins/").json() == []
        restricted = [s for s in statements if "student_check_ins ci" in s]
        statements.clear()
        assert call(school, "admin_residual", "GET", "/student-check-ins/").json() == []
        free = [s for s in statements if "student_check_ins ci" in s]
    finally:
        event.remove(engine, "before_cursor_execute", spy)
    assert restricted and "enrollments chk_e" in restricted[0] and "ci.student_id" in restricted[0]
    assert free and "enrollments" not in free[0]


@needs_postgres
def test_presence_stays_available_to_a_restricted_account_for_themselves_only(school, schooling):
    me = str(school["people"]["director"])
    ok = call(school, "director", "PUT", "/presence/", json={"user_id": me, "is_online": True})
    assert ok.status_code == 200, ok.text
    other = call(school, "director", "PUT", "/presence/", json={"user_id": str(school["people"]["teacher"]), "is_online": True})
    assert other.status_code == 403 and other.json().get("error") != "CYCLE_SCOPE_DENIED"


# --- Corrections après relecture : null explicite, oracle d'existence, identifiants mal formés ---------

def _error_body(response):
    body = response.json()
    body.pop("request_id", None)
    return body


def test_explicit_null_destination_on_grade_update_is_refused_without_effect(school, schooling):
    for patch in ({"assessment_id": None}, {"student_id": None}):
        response = call(school, "director", "PUT", f"/grades/{schooling['g_cp']}/", json=patch)
        assert response.status_code == 404, patch
        row = get_grade(schooling["g_cp"])
        assert row.assessment_id == schooling["a_cp"] and row.student_id == schooling["s_cp"] and row.score == 15.0
    # Les autres PUT/PATCH ignorent ``null`` (aucune écriture) ou le refusent déjà.
    assert call(school, "director", "PUT", f"/grades/{schooling['g_cp']}/", json={"score": 16.0}).status_code == 200


@needs_postgres
def test_explicit_null_class_on_homework_update_is_refused_without_effect(school, schooling):
    response = call(school, "director_teacher", "PUT", f"/homework/{schooling['hw_cp']}/", json={"class_id": None})
    assert response.status_code == 404
    assert raw_value("SELECT classroom_id FROM homework WHERE id = CAST(:i AS uuid)", i=schooling["hw_cp"]) is not None


@needs_postgres
def test_assessment_update_with_null_class_changes_nothing(school, schooling):
    """``class_id: null`` est ignoré par le handler (champ non écrit) : la classe reste celle du périmètre."""
    response = call(school, "director", "PUT", f"/assessments/{schooling['a_cp_empty']}/",
                    json={"class_id": None, "name": "Renommée"})
    assert response.status_code == 200
    assert get_assessment(schooling["a_cp_empty"]).class_id == schooling["cls_cp"]


def test_grade_404_has_no_existence_oracle(school, schooling):
    unknown = uuid4()
    for method, kwargs in (("GET", {}), ("PUT", {"json": {"score": 1.0}}), ("DELETE", {})):
        missing = call(school, "director", method, f"/grades/{unknown}/", **kwargs)
        hidden = call(school, "director", method, f"/grades/{schooling['g_6e']}/", **kwargs)
        assert missing.status_code == hidden.status_code == 404, method
        assert _error_body(missing) == _error_body(hidden), method


@needs_postgres
def test_attendance_404_has_no_existence_oracle(school, schooling):
    unknown = uuid4()
    for method, kwargs in (("PATCH", {"json": {"status": "LATE"}}), ("DELETE", {})):
        missing = call(school, "secretary", method, f"/attendance/{unknown}/", **kwargs)
        hidden = call(school, "secretary", method, f"/attendance/{schooling['att_6e']}/", **kwargs)
        assert missing.status_code == hidden.status_code == 404, method
        assert _error_body(missing) == _error_body(hidden), method


def test_other_scoped_404s_are_uniform_for_unknown_and_hidden_objects(school, schooling):
    pairs = [("GET", f"/assessments/{{}}/", "a_6e"), ("GET", "/grades/student/{}/average/", "s_6e")]
    for method, template, name in pairs:
        if "assessments" in template and IS_SQLITE:
            continue
        missing = call(school, "director", method, template.format(uuid4()))
        hidden = call(school, "director", method, template.format(schooling[name]))
        assert missing.status_code == hidden.status_code == 404, template
        assert _error_body(missing) == _error_body(hidden), template


def test_malformed_identifiers_are_404_never_500(school, schooling):
    assert call(school, "director_teacher", "GET", "/homework/submissions/abc/").status_code == 404
    assert call(school, "secretary", "GET", "/transcripts/abc/", params={"academic_year_id": str(schooling["year"])}
                ).status_code in (404, 422)
    t = school["tenant"]
    restricted = {"_cycle_ids": [str(school["cycles"]["primaire"])]}
    with SessionLocal() as db:
        for fn in (cycle_scope.require_student_in_scope, cycle_scope.require_class_in_scope):
            for bad in ("abc", "", None):
                with pytest.raises(Exception) as caught:
                    fn(db, t, restricted, bad)
                assert getattr(caught.value, "status_code", None) == 404, (fn.__name__, bad)


@needs_postgres
def test_malformed_student_id_in_homework_submit_is_404(school, schooling):
    response = call(school, "director_teacher", "POST", f"/homework/{schooling['hw_cp2']}/submit/",
                    json={"homework_id": str(schooling["hw_cp2"]), "student_id": "abc", "content": "x"})
    assert response.status_code == 404


# --- Non-régression des vrais flux PARENT, STUDENT et SUPER_ADMIN ----------------------------------

@needs_postgres
def test_parent_and_student_flows_on_attendance_and_homework_are_unchanged(school, schooling):
    parent = call(school, "parent", "GET", "/attendance/")
    assert ids(parent) == {str(schooling[n]) for n in ("att_cp", "att_cp_old", "att_6e", "att_none")}
    assert ids(call(school, "student", "GET", "/attendance/")) == set()  # aucune fiche élève liée à ce compte
    everything = {str(schooling[n]) for n in ("hw_cp", "hw_cp2", "hw_6e", "hw_nocls")}
    assert ids(call(school, "parent", "GET", "/homework/")) == everything
    assert ids(call(school, "student", "GET", "/homework/")) == everything


def test_super_admin_with_tenant_header_is_never_filtered_on_grades(school, schooling):
    from app.core import security

    token = security.create_access_token(
        {"sub": str(school["people"]["superadmin"]), "tenant_id": None, "roles": ["SUPER_ADMIN"]})
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": str(school["tenant"])}
    response = client.get("/api/v1/grades/", headers=headers)
    assert ids(response) == {str(schooling[n]) for n in ("g_cp", "g_cp_old", "g_6e", "g_none")}
    assert response.json()["total"] == 4
    assert client.get(f"/api/v1/grades/{schooling['g_6e']}/", headers=headers).status_code == 200


# --- Garde-fou : chaque route FILTERED du lot a son test comportemental ---------------------------

SCHOOLING_ROUTE_TESTS = {
    ("GET", "/assessments/"): "test_assessment_list_is_limited_to_classes_of_the_cycle",
    ("POST", "/assessments/"): "test_assessment_create_needs_a_class_in_scope_without_effect",
    ("GET", "/assessments/{id}/"): "test_assessment_detail_in_scope_and_404_elsewhere",
    ("PUT", "/assessments/{id}/"): "test_assessment_update_and_delete_need_the_class_in_scope_without_effect",
    ("DELETE", "/assessments/{id}/"): "test_assessment_update_and_delete_need_the_class_in_scope_without_effect",
    ("GET", "/attendance/"): "test_attendance_list_and_stats_follow_the_student",
    ("GET", "/attendance/stats/"): "test_attendance_list_and_stats_follow_the_student",
    ("POST", "/attendance/"): "test_attendance_create_needs_student_and_class_in_scope_without_effect",
    ("POST", "/attendance/bulk/"): "test_attendance_bulk_is_all_or_nothing",
    ("PATCH", "/attendance/{attendance_id}/"): "test_attendance_update_and_delete_need_student_and_class_in_scope_without_effect",
    ("DELETE", "/attendance/{attendance_id}/"): "test_attendance_update_and_delete_need_student_and_class_in_scope_without_effect",
    ("GET", "/class-sessions/"): "test_class_sessions_are_limited_to_classes_of_the_cycle",
    ("GET", "/class-sessions/active/"): "test_class_sessions_are_limited_to_classes_of_the_cycle",
    ("GET", "/exam-sessions/"): "test_exam_session_list_counts_only_assessments_of_the_cycle",
    ("GET", "/grade-history/"): "test_grade_history_alias_follows_the_student",
    ("GET", "/grades/history/"): "test_canonical_grade_history_handler_follows_the_student",
    ("GET", "/grades/"): "test_grade_list_follows_the_student_with_exact_total",
    ("POST", "/grades/"): "test_grade_create_needs_student_and_assessment_in_scope_without_effect",
    ("POST", "/grades/bulk"): "test_grade_bulk_is_all_or_nothing",
    ("GET", "/grades/student/{student_id}/average/"): "test_grade_average_follows_the_student",
    ("GET", "/grades/{grade_id}/"): "test_grade_detail_follows_the_student",
    ("PUT", "/grades/{grade_id}/"): "test_grade_update_and_delete_need_student_and_assessment_in_scope_without_effect",
    ("DELETE", "/grades/{grade_id}/"): "test_grade_update_and_delete_need_student_and_assessment_in_scope_without_effect",
    ("GET", "/homework-submissions/"): "test_homework_submissions_alias_list_and_grading_are_scoped",
    ("PUT", "/homework-submissions/{submission_id}"): "test_homework_submissions_alias_list_and_grading_are_scoped",
    ("GET", "/homework/"): "test_homework_list_is_limited_with_exact_total",
    ("POST", "/homework/"): "test_homework_create_needs_a_class_in_scope_without_effect",
    ("GET", "/homework/submissions/{student_id}/"): "test_student_submissions_follow_the_student",
    ("POST", "/homework/submissions/{submission_id}/grade/"): "test_submission_grading_needs_homework_and_student_in_scope_without_effect",
    ("GET", "/homework/{homework_id}/"): "test_homework_detail_hides_other_classes_and_other_cycle_submissions",
    ("PUT", "/homework/{homework_id}/"): "test_homework_update_and_delete_need_the_class_in_scope_without_effect",
    ("DELETE", "/homework/{homework_id}/"): "test_homework_update_and_delete_need_the_class_in_scope_without_effect",
    ("PUT", "/homework/{homework_id}/submissions/{submission_id}/"): "test_student_submission_content_update_needs_homework_and_student_in_scope",
    ("POST", "/homework/{homework_id}/submit/"): "test_homework_submit_needs_homework_and_student_in_scope_without_effect",
    ("GET", "/student-check-ins/"): "test_student_check_ins_alias_applies_the_student_scope",
    ("GET", "/transcripts/{student_id}/"): "test_transcript_follows_the_student",
}


def test_schooling_route_tests_cover_the_lot():
    lot = {key for key, policy in EXPECTED_POLICIES.items() if policy is Policy.FILTERED}
    assert lot == {(method, f"/api/v1{path}") for method, path in SCHOOLING_ROUTE_TESTS}
    for name in set(SCHOOLING_ROUTE_TESTS.values()):
        candidate = globals().get(name)
        assert callable(candidate) and name.startswith("test_"), f"test introuvable : {name}"
