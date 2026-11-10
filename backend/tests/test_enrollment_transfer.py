"""Transfert de classe atomique (A5).

Le transfert se faisait en deux appels (retrait puis inscription) : si le
second échouait, l'élève restait sans classe active. POST
/enrollments/{id}/transfer/ fait les deux dans une seule transaction et
conserve l'ancienne inscription (TRANSFERRED) pour l'historique.
"""
import datetime
import threading
import uuid

import pytest
from conftest import get_test_client
from app.core.database import SessionLocal, engine
from app.core.security import get_current_user
from app.main import app
from app.models.academic_year import AcademicYear
from app.models.audit_log import AuditLog
from app.models.classroom import Classroom
from app.models.enrollment import Enrollment
from app.models.student import Gender, Student, StudentStatus
from app.models.tenant import Tenant

client = get_test_client()
ROOT = "/api/v1/enrollments/"
HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture(autouse=True)
def cleanup_auth_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(tenant_id: str, role: str = "TENANT_ADMIN") -> dict:
    user = {"id": str(uuid.uuid4()), "roles": [role], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _school():
    """Établissement avec une année, deux classes de l'année, une classe d'une
    autre année et un élève inscrit (ACTIVE) dans la première classe."""
    ids = {k: str(uuid.uuid4()) for k in ("tenant", "year", "other_year", "a", "b", "c", "student", "enrollment")}
    with SessionLocal() as db:
        db.add(Tenant(id=ids["tenant"], name="École Transfert", slug=f"tr-{ids['tenant'][:12]}",
                      type="primary", country="GN", is_active=True, settings={}))
        db.commit()
        db.add(AcademicYear(id=ids["year"], tenant_id=ids["tenant"], name="2025-2026", code=f"Y{ids['year'][:8]}",
                            start_date=datetime.date(2025, 9, 1), end_date=datetime.date(2026, 7, 1), is_current=True))
        db.add(AcademicYear(id=ids["other_year"], tenant_id=ids["tenant"], name="2026-2027", code=f"Z{ids['other_year'][:8]}",
                            start_date=datetime.date(2026, 9, 1), end_date=datetime.date(2027, 7, 1), is_current=False))
        db.flush()
        db.add(Classroom(id=ids["a"], tenant_id=ids["tenant"], name="6e A", academic_year_id=ids["year"]))
        db.add(Classroom(id=ids["b"], tenant_id=ids["tenant"], name="6e B", academic_year_id=ids["year"]))
        db.add(Classroom(id=ids["c"], tenant_id=ids["tenant"], name="5e A", academic_year_id=ids["other_year"]))
        db.add(Student(id=ids["student"], tenant_id=ids["tenant"], first_name="Aïcha", last_name="Bah",
                       registration_number=f"TR-{ids['student'][:8]}", status=StudentStatus.ACTIVE,
                       date_of_birth=datetime.date(2013, 3, 4), gender=Gender.FEMALE))
        db.flush()
        db.add(Enrollment(id=ids["enrollment"], tenant_id=ids["tenant"], student_id=ids["student"],
                          class_id=ids["a"], academic_year_id=ids["year"], status="ACTIVE"))
        db.commit()
    return ids


def _enrollments(student_id: str) -> list[tuple[str, str]]:
    with SessionLocal() as db:
        rows = db.query(Enrollment).filter(Enrollment.student_id == student_id).all()
        return sorted((str(r.class_id), r.status) for r in rows)


def _transfer(ids, class_id, enrollment_id=None, headers=None):
    return client.post(f"{ROOT}{enrollment_id or ids['enrollment']}/transfer/",
                       json={"class_id": class_id}, headers=headers or _as(ids["tenant"]))


def test_transfer_moves_student_and_keeps_history():
    ids = _school()
    resp = _transfer(ids, ids["b"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["class_id"] == ids["b"] and body["status"] == "ACTIVE"
    assert body["previous_enrollment_id"] == ids["enrollment"] and body["previous_status"] == "TRANSFERRED"
    assert _enrollments(ids["student"]) == sorted([(ids["a"], "TRANSFERRED"), (ids["b"], "ACTIVE")])
    with SessionLocal() as db:
        audit = db.query(AuditLog).filter(AuditLog.action == "TRANSFER_ENROLLMENT",
                                          AuditLog.resource_id == body["id"]).one()
        assert audit.details["from_class_id"] == ids["a"] and audit.details["to_class_id"] == ids["b"]


def test_legacy_mixed_case_active_status_is_transferred():
    # Le formulaire élève enregistrait « Active » : ces inscriptions sont actives.
    ids = _school()
    with SessionLocal() as db:
        db.query(Enrollment).filter(Enrollment.id == ids["enrollment"]).update({"status": "Active"})
        db.commit()
    assert _transfer(ids, ids["b"]).status_code == 200
    assert _enrollments(ids["student"]) == sorted([(ids["a"], "TRANSFERRED"), (ids["b"], "ACTIVE")])


def test_class_of_another_year_is_refused_and_student_stays():
    ids = _school()
    resp = _transfer(ids, ids["c"])
    assert resp.status_code == 409, resp.text
    assert _enrollments(ids["student"]) == [(ids["a"], "ACTIVE")]


def test_same_class_is_refused():
    ids = _school()
    assert _transfer(ids, ids["a"]).status_code == 409
    assert _enrollments(ids["student"]) == [(ids["a"], "ACTIVE")]


def test_inactive_enrollment_cannot_be_transferred():
    ids = _school()
    assert _transfer(ids, ids["b"]).status_code == 200
    # Rejeu sur l'ancienne inscription, désormais TRANSFERRED.
    again = _transfer(ids, ids["a"])
    assert again.status_code == 409, again.text
    assert _enrollments(ids["student"]) == sorted([(ids["a"], "TRANSFERRED"), (ids["b"], "ACTIVE")])


def test_target_class_of_another_school_is_404_without_change():
    ids, other = _school(), _school()
    resp = _transfer(ids, other["b"])
    assert resp.status_code == 404, resp.text
    assert _enrollments(ids["student"]) == [(ids["a"], "ACTIVE")]
    assert _enrollments(other["student"]) == [(other["a"], "ACTIVE")]


def test_enrollment_of_another_school_is_404_without_change():
    ids, other = _school(), _school()
    resp = _transfer(ids, other["b"], enrollment_id=other["enrollment"])
    assert resp.status_code == 404, resp.text
    assert _enrollments(other["student"]) == [(other["a"], "ACTIVE")]


def test_unknown_enrollment_is_404():
    ids = _school()
    assert _transfer(ids, ids["b"], enrollment_id=str(uuid.uuid4())).status_code == 404


@pytest.mark.parametrize("role", ["TEACHER", "PARENT", "STUDENT"])
def test_roles_without_enrollments_write_are_refused(role):
    ids = _school()
    resp = _transfer(ids, ids["b"], headers=_as(ids["tenant"], role))
    assert resp.status_code == 403, resp.text
    assert _enrollments(ids["student"]) == [(ids["a"], "ACTIVE")]


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Concurrence réelle : PostgreSQL")
def test_concurrent_transfers_leave_exactly_one_active_enrollment():
    ids = _school()
    headers = _as(ids["tenant"])
    barrier = threading.Barrier(2)
    codes: list[int] = []

    def send():
        barrier.wait()
        codes.append(client.post(f"{ROOT}{ids['enrollment']}/transfer/",
                                 json={"class_id": ids["b"]}, headers=headers).status_code)

    threads = [threading.Thread(target=send) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert sorted(codes) == [200, 409]
    assert _enrollments(ids["student"]) == sorted([(ids["a"], "TRANSFERRED"), (ids["b"], "ACTIVE")])
