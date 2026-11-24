"""Emploi du temps et enseignants pour les comptes limités à des cycles (Q-B3-2, 2026-11-24).

Le secrétariat et la direction, limités au primaire (``cls_cp``), ne voient et ne modifient que
les créneaux et affectations des classes du primaire ; un conflit avec un créneau du collège est
refusé avec un message générique (Q-S1). TEACHERS-LIST-01 : un élève ne liste plus les affectations
des enseignants. PostgreSQL uniquement (comme les autres tests du périmètre par cycle).
"""
from datetime import time
from uuid import uuid4

import pytest
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core.cycle_routes import Policy, policy_for  # noqa: E402
from app.core.database import SessionLocal, engine, switch_tenant_context  # noqa: E402
from app.models.schedule import ScheduleSlot  # noqa: E402
from test_cycle_scope_gate import school, structure  # noqa: E402,F401
from test_cycle_scope_students import call, world  # noqa: E402,F401

needs_postgres = pytest.mark.skipif(engine.dialect.name == "sqlite", reason="périmètre par cycle : PostgreSQL")
RESTRICTED = ("secretary", "director")

# Registre lu par test_cycle_scope_students::test_every_filtered_route_has_a_behavioural_test.
SCHEDULE_ROUTE_TESTS = {
    ("GET", "/schedule/"): "test_schedule_lists_only_the_classes_of_the_scope",
    ("GET", "/schedule-slots/"): "test_schedule_lists_only_the_classes_of_the_scope",
    ("GET", "/schedule/{slot_id}/roster/"): "test_schedule_lists_only_the_classes_of_the_scope",
    ("POST", "/schedule/"): "test_schedule_writes_need_a_class_of_the_scope",
    ("PUT", "/schedule/{slot_id}/"): "test_schedule_writes_need_a_class_of_the_scope",
    ("DELETE", "/schedule/{slot_id}/"): "test_schedule_writes_need_a_class_of_the_scope",
    ("PUT", "/schedule/classes/{class_id}/replace/"): "test_schedule_writes_need_a_class_of_the_scope",
    ("GET", "/teachers/"): "test_teacher_assignments_follow_the_scope_and_families_are_refused",
    ("GET", "/teachers/{teacher_id}/schedule/"): "test_teacher_assignments_follow_the_scope_and_families_are_refused",
    ("POST", "/teachers/"): "test_teacher_assignment_writes_need_a_class_of_the_scope",
    ("PUT", "/teachers/{assignment_id}/"): "test_teacher_assignment_writes_need_a_class_of_the_scope",
    ("DELETE", "/teachers/{assignment_id}/"): "test_teacher_assignment_writes_need_a_class_of_the_scope",
    ("GET", "/users/"): "test_user_list_shows_only_staff_accounts_to_a_restricted_account",
}


def test_routes_are_classified():
    for method, path in SCHEDULE_ROUTE_TESTS:
        assert policy_for(method, f"/api/v1{path}") is Policy.FILTERED, (method, path)
    assert policy_for("GET", "/api/v1/teachers/dashboard/") is Policy.DENY
    for path in ("/levels/{level_id}/subjects/", "/subjects/{subject_id}/departments/",
                 "/subjects/{subject_id}/levels/", "/subjects/{subject_id}/prerequisites/"):
        assert policy_for("GET", f"/api/v1{path}") is Policy.INDEPENDENT, path


@pytest.fixture
def timetable(school, world):
    t = school["tenant"]
    teacher = school["people"]["teacher"]
    ids = {k: uuid4() for k in ("slot_cp", "slot_6e")}
    with SessionLocal() as db:
        for key, klass, start in (("slot_cp", "cls_cp", time(8)), ("slot_6e", "cls_6e", time(10))):
            db.add(ScheduleSlot(id=ids[key], tenant_id=t, class_id=world[klass], subject_id=world["subject"],
                                teacher_id=teacher, day_of_week=1, start_time=start, end_time=time(start.hour + 1)))
        db.commit()
    with SessionLocal() as db:
        switch_tenant_context(db, str(t))
        for key, klass in (("ta_cp", "cls_cp"), ("ta_6e", "cls_6e")):
            ids[key] = db.execute(text(
                "INSERT INTO teacher_assignments (tenant_id, user_id, classroom_id, subject_id) "
                "VALUES (CAST(:t AS uuid), CAST(:u AS uuid), CAST(:c AS uuid), CAST(:s AS uuid)) RETURNING id"
            ), {"t": str(t), "u": str(teacher), "c": str(world[klass]), "s": str(world["subject"])}).scalar()
        db.commit()
    yield {**world, **ids, "teacher": teacher}
    with SessionLocal() as db:
        switch_tenant_context(db, str(t))
        db.execute(text("DELETE FROM teacher_assignments WHERE tenant_id = CAST(:t AS uuid)"), {"t": str(t)})
        db.query(ScheduleSlot).filter(ScheduleSlot.tenant_id == t).delete()
        db.commit()


def slot_ids(response):
    assert response.status_code == 200, response.text
    return {str(item["id"]) for item in response.json()}


def slot_exists(slot_id, school):
    with SessionLocal() as db:
        switch_tenant_context(db, str(school["tenant"]))
        return db.query(ScheduleSlot.id).filter(ScheduleSlot.id == slot_id).first() is not None


def slot_count(school):
    with SessionLocal() as db:
        switch_tenant_context(db, str(school["tenant"]))
        return db.query(ScheduleSlot).filter(ScheduleSlot.tenant_id == school["tenant"]).count()


@needs_postgres
def test_schedule_lists_only_the_classes_of_the_scope(school, timetable):
    for who in RESTRICTED:
        for route in ("/schedule/", "/schedule-slots/"):
            assert slot_ids(call(school, who, "GET", route)) == {str(timetable["slot_cp"])}, (who, route)
            assert call(school, who, "GET", route, params={"class_id": str(timetable["cls_6e"])}).status_code == 404
        assert call(school, who, "GET", f"/schedule/{timetable['slot_cp']}/roster/").status_code == 200
        assert call(school, who, "GET", f"/schedule/{timetable['slot_6e']}/roster/").status_code == 404
    assert slot_ids(call(school, "secretary_free", "GET", "/schedule/")) == {
        str(timetable["slot_cp"]), str(timetable["slot_6e"])}


@needs_postgres
def test_schedule_writes_need_a_class_of_the_scope(school, timetable):
    base = {"subject_id": str(timetable["subject"]), "day_of_week": 1}
    before = slot_count(school)
    # Classe d'un autre cycle : 404, rien n'est écrit.
    assert call(school, "secretary", "POST", "/schedule/", json={
        **base, "class_id": str(timetable["cls_6e"]), "start_time": "14:00", "end_time": "15:00"}).status_code == 404
    # Conflit avec le créneau du collège (même enseignant, 10 h) : 409 générique, sans détail du collège.
    clash = call(school, "secretary", "POST", "/schedule/", json={
        **base, "class_id": str(timetable["cls_cp"]), "teacher_id": str(timetable["teacher"]),
        "start_time": "10:30", "end_time": "11:30"})
    assert clash.status_code == 409 and "cls_6e" not in clash.text
    assert slot_count(school) == before
    created = call(school, "secretary", "POST", "/schedule/", json={
        **base, "class_id": str(timetable["cls_cp"]), "start_time": "14:00", "end_time": "15:00"})
    assert created.status_code == 201, created.text
    # Créneau du collège : ni modifiable, ni supprimable ; un créneau du primaire ne peut pas y partir.
    assert call(school, "secretary", "PUT", f"/schedule/{timetable['slot_6e']}/",
                json={"day_of_week": 2}).status_code == 404
    assert call(school, "secretary", "PUT", f"/schedule/{timetable['slot_cp']}/",
                json={"class_id": str(timetable["cls_6e"])}).status_code == 404
    assert call(school, "secretary", "DELETE", f"/schedule/{timetable['slot_6e']}/").status_code == 404
    assert slot_exists(timetable["slot_6e"], school)
    assert call(school, "secretary", "PUT", f"/schedule/classes/{timetable['cls_6e']}/replace/", json={"slots": [
        {**base, "start_time": "08:00", "end_time": "09:00"}]}).status_code == 404
    assert slot_exists(timetable["slot_6e"], school)
    assert call(school, "secretary", "DELETE", f"/schedule/{created.json()['id']}/").status_code == 204


@needs_postgres
def test_teacher_assignments_follow_the_scope_and_families_are_refused(school, timetable):
    for who in RESTRICTED:
        body = call(school, who, "GET", "/teachers/").json()
        assert {str(item["id"]) for item in body["items"]} == {str(timetable["ta_cp"])}, who
        assert body["total"] == 1
        assert call(school, who, "GET", "/teachers/", params={"class_id": str(timetable["cls_6e"])}).status_code == 404
        schedule = call(school, who, "GET", f"/teachers/{timetable['teacher']}/schedule/").json()
        assert [s["id"] for s in schedule] == [str(timetable["slot_cp"])], who
    assert call(school, "secretary_free", "GET", "/teachers/").json()["total"] == 2
    # TEACHERS-LIST-01 : un élève ne liste plus les affectations ni les e-mails des enseignants.
    assert call(school, "student", "GET", "/teachers/").status_code == 403


@needs_postgres
def test_teacher_assignment_writes_need_a_class_of_the_scope(school, timetable):
    payload = {"teacher_id": str(timetable["teacher"]), "subject_id": str(timetable["subject"])}
    assert call(school, "director", "POST", "/teachers/", json={**payload, "class_id": str(timetable["cls_6e"])}).status_code == 404
    assert call(school, "director", "POST", "/teachers/", json=payload).status_code == 403
    assert call(school, "director", "PUT", f"/teachers/{timetable['ta_6e']}/",
                json={"subject_id": str(timetable["subject"])}).status_code == 404
    assert call(school, "director", "PUT", f"/teachers/{timetable['ta_cp']}/",
                json={"class_id": str(timetable["cls_6e"])}).status_code == 404
    assert call(school, "director", "DELETE", f"/teachers/{timetable['ta_6e']}/").status_code == 404
    created = call(school, "director", "POST", "/teachers/", json={**payload, "class_id": str(timetable["cls_cp"])})
    assert created.status_code == 201, created.text
    assert call(school, "director", "DELETE", f"/teachers/{created.json()['id']}/").status_code == 200
    # Compte non restreint : affectation sans classe toujours possible.
    assert call(school, "admin_residual", "POST", "/teachers/", json=payload).status_code == 201


@needs_postgres
def test_user_list_shows_only_staff_accounts_to_a_restricted_account(school, timetable):
    """L'écran Enseignants charge GET /users/ (parcours E2E 23) : un compte restreint ne voit que le
    personnel, jamais les élèves, parents ou anciens élèves ; la gestion des comptes reste refusée."""
    people = school["people"]
    for who in RESTRICTED:
        response = call(school, who, "GET", "/users/", params={"page_size": 100})
        assert response.status_code == 200, (who, response.text)
        seen = {item["id"] for item in response.json()["items"]}
        assert str(people["teacher"]) in seen and str(people["accountant_free"]) in seen, who
        assert str(people["student"]) not in seen and str(people["parent"]) not in seen, who
        assert call(school, who, "GET", "/users/pending/").status_code == 403, who
    free = {item["id"] for item in call(school, "secretary_free", "GET", "/users/",
                                         params={"page_size": 100}).json()["items"]}
    assert {str(people["student"]), str(people["parent"])} <= free

