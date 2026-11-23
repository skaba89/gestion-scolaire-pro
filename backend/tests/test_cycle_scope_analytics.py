"""Lot B2e-1 : indicateurs académiques et tableau de bord par cycle.

Un compte du personnel limité à des cycles (ici le primaire : classes ``cls_cp`` et ``cls_old``)
ne voit dans les indicateurs que les élèves de son périmètre (règle Q1 : inscription ACTIVE de
l'année en cours) ; les classes et enseignants comptés sont ceux des classes du périmètre. Un
compte non restreint voit toujours tout l'établissement.

Données : ``s_cp`` (primaire, deux notes, une présence), ``s_6e`` (collège, trois notes, une
absence), ``s_none`` (sans inscription, une note, une absence), un autre établissement.
PostgreSQL uniquement (SQL brut : ``TO_CHAR``, ``INTERVAL``, tables créées hors ORM).
"""
from datetime import date, timedelta
from uuid import uuid4

import pytest

from conftest import get_test_client

client = get_test_client()

from sqlalchemy import text  # noqa: E402

from app.core.cycle_routes import Policy, policy_for  # noqa: E402
from app.core.database import SessionLocal, engine, switch_tenant_context  # noqa: E402
from app.models.attendance import Attendance  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus  # noqa: E402
from test_cycle_scope_gate import school, structure  # noqa: E402,F401
from test_cycle_scope_students import call, world  # noqa: E402,F401

IS_SQLITE = engine.dialect.name == "sqlite"
needs_postgres = pytest.mark.skipif(IS_SQLITE, reason="SQL brut (TO_CHAR, INTERVAL, tables hors ORM) : PostgreSQL uniquement")

YESTERDAY = date.today() - timedelta(days=1)
RESTRICTED = ("secretary", "director")
UNRESTRICTED = ("secretary_free",)

LOT_ROUTES = (
    "/analytics/academic-kpis/", "/analytics/academic-stats/", "/analytics/students-at-risk/",
    "/analytics/operational-kpis/", "/analytics/attendance-trend/", "/analytics/grades-distribution/",
    "/analytics/dashboard-kpis/", "/analytics/risk-scores/summary/", "/analytics/risk-scores/",
)


# Registre lu par test_cycle_scope_students::test_every_filtered_route_has_a_behavioural_test.
ANALYTICS_ROUTE_TESTS = {
    ("GET", "/analytics/academic-kpis/"): "test_academic_kpis_cover_only_the_scope",
    ("GET", "/analytics/academic-stats/"): "test_academic_stats_break_down_only_the_classes_of_the_scope",
    ("GET", "/analytics/students-at-risk/"): "test_students_at_risk_lists_only_students_of_the_scope",
    ("GET", "/analytics/operational-kpis/"): "test_operational_kpis_cover_only_the_scope",
    ("GET", "/analytics/attendance-trend/"): "test_attendance_trend_counts_only_the_scope",
    ("GET", "/analytics/grades-distribution/"): "test_grades_distribution_counts_only_the_scope",
    ("GET", "/analytics/dashboard-kpis/"): "test_dashboard_kpis_cover_only_the_scope",
    ("GET", "/analytics/risk-scores/summary/"): "test_risk_summary_counts_only_the_scope",
    ("GET", "/analytics/risk-scores/"): "test_risk_scores_never_list_a_student_out_of_scope_even_when_asked",
}


def test_the_routes_of_the_lot_are_filtered():
    for route in LOT_ROUTES:
        assert policy_for("GET", f"/api/v1{route}") is Policy.FILTERED, route


@pytest.mark.parametrize("route", [
    "/analytics/ministry-kpis/", "/analytics/ministry-stats/levels/", "/analytics/ministry-export/csv/",
    "/analytics/elearning/courses/",
])
def test_routes_outside_the_lot_stay_denied(route):
    assert policy_for("GET", f"/api/v1{route}") is Policy.DENY


def test_cash_flow_forecast_stays_denied():
    """Projection fictive (valeurs codées en dur) : jamais ouverte à un compte restreint."""
    assert policy_for("POST", "/api/v1/analytics/cash-flow-forecast/") is Policy.DENY


@pytest.fixture
def analytics(school, world):
    t, o = school["tenant"], school["other"]
    people = school["people"]
    with SessionLocal() as db:
        for tid, student, score in (
            (t, "s_cp", 15.0), (t, "s_cp", 8.0),
            (t, "s_6e", 18.0), (t, "s_6e", 4.0), (t, "s_6e", 12.0),
            (t, "s_none", 3.0),
            (o, "s_foreign", 2.0),
        ):
            db.add(Grade(tenant_id=tid, student_id=world[student], score=score, max_score=20.0,
                         academic_year_id=world["foreign_year"] if tid == o else world["year"]))
        for tid, student, status in (
            (t, "s_cp", "PRESENT"), (t, "s_6e", "ABSENT"), (t, "s_none", "ABSENT"), (o, "s_foreign", "ABSENT"),
        ):
            db.add(Attendance(tenant_id=tid, student_id=world[student], date=YESTERDAY, status=status))
        for tid, student, total, paid in (
            (t, "s_cp", 100000.0, 40000.0), (t, "s_6e", 50000.0, 0.0), (o, "s_foreign", 999000.0, 0.0),
        ):
            db.add(Invoice(tenant_id=tid, student_id=world[student], invoice_number=f"INV-A-{uuid4().hex[:10]}",
                           issue_date=YESTERDAY, due_date=YESTERDAY, subtotal=total, total_amount=total,
                           paid_amount=paid, status=InvoiceStatus.PARTIAL if paid else InvoiceStatus.PENDING))
        db.commit()

    with SessionLocal() as db:
        for tid in (t, o):
            switch_tenant_context(db, str(tid))
            if tid == t:
                for teacher, klass in (("teacher", "cls_cp"), ("teacher_residual", "cls_6e")):
                    db.execute(text(
                        "INSERT INTO teacher_assignments (tenant_id, user_id, classroom_id) "
                        "VALUES (CAST(:tid AS uuid), CAST(:uid AS uuid), CAST(:cid AS uuid))"
                    ), {"tid": str(t), "uid": str(people[teacher]), "cid": str(world[klass])})
                rows = (("s_cp", "HIGH", 0.7), ("s_6e", "CRITICAL", 0.9))
            else:
                rows = (("s_foreign", "CRITICAL", 0.95),)
            for student, level, score in rows:
                db.execute(text(
                    "INSERT INTO student_risk_scores (tenant_id, student_id, risk_level, risk_score, calculated_at) "
                    "VALUES (CAST(:tid AS uuid), CAST(:sid AS uuid), :lvl, :score, NOW())"
                ), {"tid": str(tid), "sid": str(world[student]), "lvl": level, "score": score})
        db.commit()

    yield world

    with SessionLocal() as db:
        for tid in (t, o):
            switch_tenant_context(db, str(tid))
            for table in ("teacher_assignments", "student_risk_scores"):
                db.execute(text(f"DELETE FROM {table} WHERE tenant_id = CAST(:tid AS uuid)"), {"tid": str(tid)})
            for model in (Grade, Attendance, Invoice):
                db.query(model).filter(model.tenant_id == tid).delete()
        db.commit()


def get(school, who, route, **params):
    response = call(school, who, "GET", route, params=params or None)
    assert response.status_code == 200, (who, route, response.text)
    return response.json()


# --- Indicateurs académiques ----------------------------------------------------------------

@needs_postgres
def test_academic_kpis_cover_only_the_scope(school, analytics):
    for who in RESTRICTED:
        body = get(school, who, "/analytics/academic-kpis/")
        assert body == {"overallSuccessRate": 50.0, "totalStudents": 1, "passingStudents": 1,
                        "failingStudents": 1, "averageGrade": 11.5}, who
    free = get(school, "secretary_free", "/analytics/academic-kpis/")
    # Établissement entier : 6 notes, 4 inscriptions actives de l'année (s_cp, s_6e, s_nolevel, s_nocycle).
    assert free["passingStudents"] + free["failingStudents"] == 6
    assert free["totalStudents"] == 4


@needs_postgres
def test_academic_stats_break_down_only_the_classes_of_the_scope(school, analytics):
    for who in RESTRICTED:
        body = get(school, who, "/analytics/academic-stats/")
        assert [(c["class_name"], c["total_students"]) for c in body["byClass"]] == [("cls_cp", 2)], who
        assert sum(1 for _ in body["bySubject"]) <= 1
    free = get(school, "secretary_free", "/analytics/academic-stats/")
    assert "cls_6e" in {c["class_name"] for c in free["byClass"]}


@needs_postgres
def test_students_at_risk_lists_only_students_of_the_scope(school, analytics):
    for who in RESTRICTED:
        body = get(school, who, "/analytics/students-at-risk/")
        assert [s["student_id"] for s in body["students"]] == [str(analytics["s_cp"])], who
        assert body["summary"]["total"] == 1
    free = get(school, "secretary_free", "/analytics/students-at-risk/")
    assert {s["student_id"] for s in free["students"]} == {
        str(analytics["s_cp"]), str(analytics["s_6e"]), str(analytics["s_none"])}


@needs_postgres
def test_grades_distribution_counts_only_the_scope(school, analytics):
    for who in RESTRICTED:
        buckets = {b["range"]: b["count"] for b in get(school, who, "/analytics/grades-distribution/")}
        assert sum(buckets.values()) == 2 and buckets["14-16"] == 1 and buckets["5-10"] == 1, who
    free = {b["range"]: b["count"] for b in get(school, "secretary_free", "/analytics/grades-distribution/")}
    assert sum(free.values()) == 6


@needs_postgres
def test_attendance_trend_counts_only_the_scope(school, analytics):
    for who in RESTRICTED:
        days = get(school, who, "/analytics/attendance-trend/")
        assert [(d["présents"], d["absents"]) for d in days] == [(1, 0)], who
    free = get(school, "secretary_free", "/analytics/attendance-trend/")
    assert [(d["présents"], d["absents"]) for d in free] == [(1, 2)]


@needs_postgres
def test_operational_kpis_cover_only_the_scope(school, analytics):
    for who in RESTRICTED:
        body = get(school, who, "/analytics/operational-kpis/")
        assert body["studentAttendanceRate"] == 100.0 and body["totalEnrollments"] == 1, who
    free = get(school, "secretary_free", "/analytics/operational-kpis/")
    assert free["studentAttendanceRate"] == 33.33


@needs_postgres
def test_dashboard_kpis_cover_only_the_scope(school, analytics):
    for who in RESTRICTED:
        body = get(school, who, "/analytics/dashboard-kpis/")
        assert body["totalStudents"] == 1, who
        assert body["classroomCount"] == 2  # cls_cp et cls_old (niveau CP)
        assert body["teacherCount"] == 1    # seul l'enseignant affecté à cls_cp
        assert (body["totalRevenue"], body["collectedRevenue"]) == (100000.0, 40000.0)
        assert body["attendanceRate"] == 100.0 and body["avgGrade"] == 11.5
    free = get(school, "secretary_free", "/analytics/dashboard-kpis/")
    assert free["totalRevenue"] == 150000.0 and free["classroomCount"] >= 5


# --- Scores de risque -----------------------------------------------------------------------

@needs_postgres
def test_risk_summary_counts_only_the_scope(school, analytics):
    for who in RESTRICTED:
        body = get(school, who, "/analytics/risk-scores/summary/")
        assert (body["total"], body["high"], body["critical"]) == (1, 1, 0), who
    free = get(school, "secretary_free", "/analytics/risk-scores/summary/")
    assert (free["total"], free["high"], free["critical"]) == (2, 1, 1)


@needs_postgres
def test_risk_scores_never_list_a_student_out_of_scope_even_when_asked(school, analytics):
    for who in RESTRICTED:
        rows = get(school, who, "/analytics/risk-scores/")
        assert [r["student_id"] for r in rows] == [str(analytics["s_cp"])], who
        asked = get(school, who, "/analytics/risk-scores/", student_ids=str(analytics["s_6e"]))
        assert asked == []
    free = get(school, "secretary_free", "/analytics/risk-scores/")
    assert {r["student_id"] for r in free} == {str(analytics["s_cp"]), str(analytics["s_6e"])}


# --- Compte restreint sans classe -----------------------------------------------------------

@needs_postgres
def test_a_restricted_account_whose_cycle_has_no_class_gets_empty_indicators(school, analytics):
    """Un compte limité à un cycle qui n'a encore aucune classe (lycée) ne voit rien."""
    from app.models import EducationCycle, StaffCycleAssignment
    lycee = uuid4()
    with SessionLocal() as db:
        switch_tenant_context(db, str(school["tenant"]))
        db.add(EducationCycle(id=lycee, tenant_id=school["tenant"], code="LYCEE", name="lycee",
                              institution_type="secondary", period_type="TRIMESTER", order_index=9,
                              is_active=True, revision=1))
        db.flush()
        db.query(StaffCycleAssignment).filter(
            StaffCycleAssignment.tenant_id == school["tenant"],
            StaffCycleAssignment.user_id == school["people"]["secretary"],
        ).delete()
        db.add(StaffCycleAssignment(tenant_id=school["tenant"], user_id=school["people"]["secretary"],
                                    cycle_id=lycee))
        db.commit()
    body = get(school, "secretary", "/analytics/dashboard-kpis/")
    assert (body["totalStudents"], body["classroomCount"], body["teacherCount"], body["totalRevenue"]) == (0, 0, 0, 0)
    assert get(school, "secretary", "/analytics/risk-scores/") == []
