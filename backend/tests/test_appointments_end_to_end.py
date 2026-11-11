"""Rendez-vous parents-enseignants, de bout en bout (2026-11-11).

Avant : création de créneau rejetée (champ `slot_date` au lieu de `date`),
réservation toujours en échec sur PostgreSQL (`:appointment_date::date`),
routes de génération, confirmation et annulation absentes, double
réservation possible, et tous les rendez-vous de l'établissement visibles
par n'importe quel enseignant. PostgreSQL uniquement : tables sans modèle
ORM (absentes de la base SQLite des tests), verrou `FOR UPDATE`.
"""
import threading
import uuid
from datetime import date, timedelta

import pytest
from conftest import get_test_client
from fastapi import HTTPException
from sqlalchemy import text

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Tables de rendez-vous : PostgreSQL")

SL = "/api/v1/school-life/appointment-slots"
PA = "/api/v1/parents"
HEADERS = {"Authorization": "Bearer mock-token"}
NEXT_WEEK = (date.today() + timedelta(days=7)).isoformat()

_CREATED: list[str] = []


def _tenant() -> str:
    tid = str(uuid.uuid4())
    _CREATED.append(tid)
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École RDV", slug=f"rdv-{tid[:12]}", type="primary",
                      country="GN", is_active=True, settings={}))
        db.commit()
    return tid


def _user(tid: str, role: str) -> dict:
    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=uid, tenant_id=tid, email=f"{uid[:12]}@example.com", username=uid,
                    first_name=role.title(), last_name=uid[:4], is_active=True))
        db.flush()
        db.add(UserRole(tenant_id=tid, user_id=uid, role=role))
        db.commit()
    return {"id": uid, "tenant_id": tid, "roles": [role]}


def _child(tid: str, parent: dict) -> str:
    sid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(id=sid, tenant_id=tid, registration_number=f"RDV-{sid[:8]}", first_name="Aïcha",
                       last_name="Sow", date_of_birth=date(2012, 1, 1), gender=Gender.FEMALE,
                       status=StudentStatus.ACTIVE))
        db.flush()
        db.add(ParentStudent(id=str(uuid.uuid4()), tenant_id=tid, parent_id=parent["id"], student_id=sid))
        db.commit()
    return sid


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    app.dependency_overrides.pop(get_current_user, None)
    tenants = list(_CREATED)
    _CREATED.clear()
    if not tenants:
        return
    with SessionLocal() as db:
        for table in ("appointments", "appointment_slots", "audit_logs"):
            db.execute(text(f"DELETE FROM {table} WHERE tenant_id = ANY(CAST(:t AS uuid[]))"), {"t": tenants})
        for model in (ParentStudent, Student, UserRole, User, Tenant):
            column = model.id if model is Tenant else model.tenant_id
            db.query(model).filter(column.in_(tenants)).delete(synchronize_session=False)
        db.commit()


@pytest.fixture
def school():
    tid = _tenant()
    teacher, colleague = _user(tid, "TEACHER"), _user(tid, "TEACHER")
    parent, other_parent = _user(tid, "PARENT"), _user(tid, "PARENT")
    admin = _user(tid, "TENANT_ADMIN")
    return {
        "tid": tid, "teacher": teacher, "colleague": colleague, "parent": parent,
        "other_parent": other_parent, "admin": admin,
        "child": _child(tid, parent), "other_child": _child(tid, other_parent),
    }


def _slot(teacher: dict, *, day: str = NEXT_WEEK, start: str = "16:00", end: str = "16:30", **extra) -> dict:
    r = _as(teacher).post(f"{SL}/", json={"date": day, "start_time": start, "end_time": end, **extra}, headers=HEADERS)
    assert r.status_code == 201, r.text
    return r.json()


def _book(parent: dict, slot_id: str, student_id: str, notes: str = "Résultats du trimestre"):
    return _as(parent).post(f"{PA}/appointments/", json={"slot_id": slot_id, "student_id": student_id, "notes": notes},
                            headers=HEADERS)


# ─── Parcours complet ────────────────────────────────────────────────────────

def test_full_journey_slot_booking_confirmation_and_cancellation(school):
    slot = _slot(school["teacher"], location="Salle 12")
    assert slot["is_available"] is True and slot["date"] == NEXT_WEEK

    # Le parent voit le créneau, réserve.
    visible = _as(school["parent"]).get(f"{PA}/appointment-slots/", params={"teacher_id": school["teacher"]["id"]},
                                        headers=HEADERS).json()
    assert [s["id"] for s in visible] == [slot["id"]]
    r = _book(school["parent"], slot["id"], school["child"])
    assert r.status_code == 201, r.text
    appointment = r.json()
    assert appointment["status"] == "REQUESTED"
    assert appointment["teacher"]["id"] == school["teacher"]["id"]  # pris du créneau
    assert appointment["appointment_date"] == NEXT_WEEK and appointment["start_time"] == "16:00:00"
    assert appointment["end_time"] == "16:30:00" and appointment["location"] == "Salle 12"

    # Créneau complet : plus proposé au parent, marqué pris chez l'enseignant.
    assert _as(school["parent"]).get(f"{PA}/appointment-slots/", headers=HEADERS).json() == []
    [teacher_slot] = _as(school["teacher"]).get(f"{SL}/", params={"teacher_id": school["teacher"]["id"]},
                                                headers=HEADERS).json()["items"]
    assert teacher_slot["is_available"] is False and teacher_slot["booked_count"] == 1

    # L'enseignant voit le rendez-vous et le confirme.
    [listed] = _as(school["teacher"]).get(f"{SL}/appointments/", params={"status": "REQUESTED,CONFIRMED"},
                                          headers=HEADERS).json()
    assert listed["parent"]["id"] == school["parent"]["id"] and listed["student"]["id"] == school["child"]
    r = _as(school["teacher"]).patch(f"{SL}/appointments/{appointment['id']}/", json={"status": "CONFIRMED"},
                                     headers=HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "CONFIRMED"

    # Le parent le voit confirmé, puis annule : le créneau se libère.
    page = _as(school["parent"]).get(f"{PA}/appointments/", headers=HEADERS).json()
    assert [a["status"] for a in page["items"]] == ["CONFIRMED"]
    r = _as(school["parent"]).post(f"{PA}/appointments/{appointment['id']}/cancel/", headers=HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "CANCELLED"
    assert [s["id"] for s in _as(school["parent"]).get(f"{PA}/appointment-slots/", headers=HEADERS).json()] == [slot["id"]]


def test_generate_week_creates_slots_once(school):
    days = [(date.today() + timedelta(days=7 + i)).isoformat() for i in range(5)]
    body = {"slots": [{"date": d, "start_time": f"{h}:00", "end_time": f"{h}:30"} for d in days for h in (16, 17)]}
    r = _as(school["teacher"]).post(f"{SL}/bulk/", json=body, headers=HEADERS)
    assert r.status_code == 201, r.text
    assert (r.json()["created"], r.json()["skipped"]) == (10, 0)
    again = _as(school["teacher"]).post(f"{SL}/bulk/", json=body, headers=HEADERS).json()
    assert (again["created"], again["skipped"]) == (0, 10)  # rejouée : pas de doublon


# ─── Double réservation ──────────────────────────────────────────────────────

def test_second_booking_of_a_full_slot_is_refused(school):
    slot = _slot(school["teacher"])
    assert _book(school["parent"], slot["id"], school["child"]).status_code == 201
    r = _book(school["other_parent"], slot["id"], school["other_child"])
    assert r.status_code == 409


def test_concurrent_bookings_of_the_last_place_only_one_succeeds(school):
    from app.core.tenant_resolution import enter_tenant_context_or_404
    from app.services import appointments as svc

    slot = _slot(school["teacher"])
    barrier = threading.Barrier(2)
    outcomes: list[str] = []

    def worker(parent: dict, student: str):
        with SessionLocal() as db:
            enter_tenant_context_or_404(db, school["tid"])
            barrier.wait()
            try:
                svc.book(db, school["tid"], parent_id=parent["id"], student_id=student,
                         slot_id=slot["id"], notes=None)
                db.commit()
                outcomes.append("ok")
            except HTTPException as exc:
                db.rollback()
                outcomes.append(str(exc.status_code))

    threads = [threading.Thread(target=worker, args=(school["parent"], school["child"])),
               threading.Thread(target=worker, args=(school["other_parent"], school["other_child"]))]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    assert sorted(outcomes) == ["409", "ok"]


# ─── Autorisations et isolation ──────────────────────────────────────────────

def test_parent_cannot_book_for_a_child_not_linked_to_them(school):
    slot = _slot(school["teacher"])
    assert _book(school["parent"], slot["id"], school["other_child"]).status_code == 403


def test_parent_cannot_cancel_another_parents_appointment(school):
    slot = _slot(school["teacher"])
    appointment = _book(school["parent"], slot["id"], school["child"]).json()
    r = _as(school["other_parent"]).post(f"{PA}/appointments/{appointment['id']}/cancel/", headers=HEADERS)
    assert r.status_code == 404
    assert _as(school["parent"]).get(f"{PA}/appointments/", headers=HEADERS).json()["items"][0]["status"] == "REQUESTED"


def test_teacher_cannot_confirm_a_colleagues_appointment_but_admin_can(school):
    slot = _slot(school["teacher"])
    appointment = _book(school["parent"], slot["id"], school["child"]).json()
    url = f"{SL}/appointments/{appointment['id']}/"
    assert _as(school["colleague"]).patch(url, json={"status": "CONFIRMED"}, headers=HEADERS).status_code == 403
    assert _as(school["admin"]).patch(url, json={"status": "CONFIRMED"}, headers=HEADERS).status_code == 200


def test_teacher_only_lists_their_own_appointments(school):
    slot = _slot(school["teacher"])
    _book(school["parent"], slot["id"], school["child"])
    # Même en demandant explicitement les rendez-vous d'un collègue.
    assert _as(school["colleague"]).get(f"{SL}/appointments/", params={"teacher_id": school["teacher"]["id"]},
                                        headers=HEADERS).json() == []
    assert len(_as(school["admin"]).get(f"{SL}/appointments/", headers=HEADERS).json()) == 1


def test_teacher_cannot_create_or_delete_slots_for_a_colleague(school):
    r = _as(school["colleague"]).post(f"{SL}/", json={"teacher_id": school["teacher"]["id"], "date": NEXT_WEEK,
                                                      "start_time": "10:00", "end_time": "10:30"}, headers=HEADERS)
    assert r.status_code == 403
    slot = _slot(school["teacher"])
    assert _as(school["colleague"]).delete(f"{SL}/{slot['id']}/", headers=HEADERS).status_code == 403


def test_other_school_cannot_see_or_book_or_change(school):
    other = _tenant()
    stranger_parent, stranger_teacher = _user(other, "PARENT"), _user(other, "TEACHER")
    stranger_child = _child(other, stranger_parent)
    slot = _slot(school["teacher"])
    appointment = _book(school["parent"], slot["id"], school["child"]).json()

    assert _as(stranger_parent).get(f"{PA}/appointment-slots/", headers=HEADERS).json() == []
    assert _book(stranger_parent, slot["id"], stranger_child).status_code == 404
    assert _as(stranger_teacher).patch(f"{SL}/appointments/{appointment['id']}/", json={"status": "CONFIRMED"},
                                       headers=HEADERS).status_code == 404
    assert _as(stranger_parent).post(f"{PA}/appointments/{appointment['id']}/cancel/",
                                     headers=HEADERS).status_code == 404


def test_forbidden_transition_and_deleting_a_booked_slot_are_refused(school):
    slot = _slot(school["teacher"])
    appointment = _book(school["parent"], slot["id"], school["child"]).json()
    url = f"{SL}/appointments/{appointment['id']}/"
    # Pas de « terminé » sans confirmation.
    assert _as(school["teacher"]).patch(url, json={"status": "COMPLETED"}, headers=HEADERS).status_code == 409
    # Créneau réservé : suppression refusée.
    assert _as(school["teacher"]).delete(f"{SL}/{slot['id']}/", headers=HEADERS).status_code == 409
    # Annulé : plus de transition possible.
    _as(school["parent"]).post(f"{PA}/appointments/{appointment['id']}/cancel/", headers=HEADERS)
    assert _as(school["teacher"]).patch(url, json={"status": "CONFIRMED"}, headers=HEADERS).status_code == 409


def test_past_slot_and_invalid_times_are_refused(school):
    r = _as(school["teacher"]).post(f"{SL}/", json={"date": NEXT_WEEK, "start_time": "17:00", "end_time": "16:00"},
                                    headers=HEADERS)
    assert r.status_code == 422
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    past = _slot(school["teacher"], day=yesterday)
    assert _book(school["parent"], past["id"], school["child"]).status_code == 409


def test_only_parents_use_the_parent_booking_routes(school):
    slot = _slot(school["teacher"])
    assert _book(school["teacher"], slot["id"], school["child"]).status_code == 403
    assert _as(school["teacher"]).get(f"{PA}/appointments/", headers=HEADERS).status_code == 403
