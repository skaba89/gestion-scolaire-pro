"""GET /attendance/ + /attendance/stats/ — ownership scoping, and
POST /attendance/ + /attendance/bulk/ — FK injection guard (institutional-
readiness audit, 2026-09, 8e vague).

Trois problèmes distincts corrigés ici :
1. attendance:read est accordé à STUDENT/PARENT (comme grades:read), mais
   sans filtre explicite ces endpoints renvoyaient TOUTES les présences de
   l'établissement à un simple élève/parent — même règle de scoping que
   grades.py::list_grades, jamais dupliquée ici.
2. student_id/subject_id/classroom_id étaient insérés tels quels sans
   vérifier leur appartenance au tenant courant.
3. Bug séparé, découvert en creusant : le JOIN de GET /attendance/ visait
   une table `classrooms` qui n'existe nulle part dans le schéma réel
   (seule `classes` existe, voir app/models/attendance.py — la colonne
   s'appelle classroom_id mais référence classes.id) — cet endpoint
   plantait avec un 500 "relation classrooms does not exist" à CHAQUE
   appel sur le vrai Postgres, jamais détecté faute de test authentifié
   de bout en bout (les tests existants ne vérifiaient que les 401/403).

Postgres-only : mêmes contraintes raw-SQL que test_attendance_duplicate_guard.py.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="raw SQL WHERE/INSERT with plain string bind params can't match "
           "SQLite's hex-no-dash GUID storage (see attendance.py).",
)

ATTENDANCE_URL = "/api/v1/attendance/"
ATTENDANCE_BULK_URL = "/api/v1/attendance/bulk/"
ATTENDANCE_STATS_URL = "/api/v1/attendance/stats/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _admin_headers(tenant_id: str) -> dict:
    return _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Présence Ownership Test", slug=f"attend-own-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str, *, user_id: str = None) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, user_id=user_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Test", last_name="Student", date_of_birth=date(2012, 1, 1),
            gender=Gender.MALE, status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"u.{user_id[:8]}@ecole.gn",
            username=f"u.{user_id[:8]}", first_name="Amadou", last_name="Bah",
            password_hash="x", is_active=True,
        ))
        db.commit()
    return user_id


def _link_parent(tenant_id: str, *, parent_id: str, student_id: str) -> None:
    with SessionLocal() as db:
        db.add(ParentStudent(
            id=str(uuid.uuid4()), tenant_id=tenant_id, parent_id=parent_id, student_id=student_id,
        ))
        db.commit()


def _make_subject(tenant_id: str, name: str = "Mathématiques") -> str:
    subject_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name=name))
        db.commit()
    return subject_id


def _record_attendance(tenant_id: str, student_id: str, status: str = "present") -> None:
    resp = client.post(ATTENDANCE_URL, json={
        "student_id": student_id, "date": str(date.today()), "status": status,
    }, headers=_admin_headers(tenant_id))
    assert resp.status_code == 201, resp.text


class TestAttendanceListSmoke:
    """Régression du bug classrooms/classes : un simple appel authentifié
    doit renvoyer 200, pas un 500 sur une table inexistante."""

    def test_list_attendance_does_not_500(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        _record_attendance(tenant_id, student_id)

        resp = client.get(ATTENDANCE_URL, headers=_admin_headers(tenant_id))
        assert resp.status_code == 200, resp.text
        assert len(resp.json()["items"]) == 1


class TestAttendanceOwnershipScoping:
    def test_student_sees_only_own_attendance(self):
        tenant_id = _make_tenant()
        student_user_id = _make_user(tenant_id)
        own_student_id = _make_student(tenant_id, user_id=student_user_id)
        other_student_id = _make_student(tenant_id)
        _record_attendance(tenant_id, own_student_id)
        _record_attendance(tenant_id, other_student_id)

        headers = _as({"id": student_user_id, "roles": ["STUDENT"], "tenant_id": tenant_id})
        resp = client.get(ATTENDANCE_URL, headers=headers)
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["student_id"] == own_student_id

    def test_student_cannot_request_another_students_attendance(self):
        tenant_id = _make_tenant()
        student_user_id = _make_user(tenant_id)
        _make_student(tenant_id, user_id=student_user_id)
        other_student_id = _make_student(tenant_id)
        _record_attendance(tenant_id, other_student_id)

        headers = _as({"id": student_user_id, "roles": ["STUDENT"], "tenant_id": tenant_id})
        resp = client.get(ATTENDANCE_URL, params={"student_id": other_student_id}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["items"] == []

    def test_parent_sees_only_own_childs_attendance(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        own_child_id = _make_student(tenant_id)
        _link_parent(tenant_id, parent_id=parent_id, student_id=own_child_id)
        unrelated_student_id = _make_student(tenant_id)
        _record_attendance(tenant_id, own_child_id)
        _record_attendance(tenant_id, unrelated_student_id)

        headers = _as({"id": parent_id, "roles": ["PARENT"], "tenant_id": tenant_id})
        resp = client.get(ATTENDANCE_URL, headers=headers)
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["student_id"] == own_child_id

    def test_stats_scoped_for_student(self):
        tenant_id = _make_tenant()
        student_user_id = _make_user(tenant_id)
        own_student_id = _make_student(tenant_id, user_id=student_user_id)
        other_student_id = _make_student(tenant_id)
        _record_attendance(tenant_id, own_student_id, status="present")
        _record_attendance(tenant_id, other_student_id, status="absent")

        headers = _as({"id": student_user_id, "roles": ["STUDENT"], "tenant_id": tenant_id})
        resp = client.get(ATTENDANCE_STATS_URL, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["total"] == 1
        assert resp.json()["present"] == 1

    def test_admin_sees_everything(self):
        tenant_id = _make_tenant()
        student_a = _make_student(tenant_id)
        student_b = _make_student(tenant_id)
        _record_attendance(tenant_id, student_a)
        _record_attendance(tenant_id, student_b)

        resp = client.get(ATTENDANCE_URL, headers=_admin_headers(tenant_id))
        assert resp.status_code == 200, resp.text
        assert len(resp.json()["items"]) == 2


class TestAttendanceCrossTenantFk:
    def test_create_rejects_student_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_b = _make_student(tenant_b)

        resp = client.post(ATTENDANCE_URL, json={
            "student_id": student_b, "date": str(date.today()), "status": "present",
        }, headers=_admin_headers(tenant_a))
        assert resp.status_code == 404

    def test_create_rejects_subject_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_a = _make_student(tenant_a)
        subject_b = _make_subject(tenant_b)

        resp = client.post(ATTENDANCE_URL, json={
            "student_id": student_a, "date": str(date.today()), "status": "present",
            "subject_id": subject_b,
        }, headers=_admin_headers(tenant_a))
        assert resp.status_code == 404

    def test_bulk_rejects_student_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_b = _make_student(tenant_b)

        resp = client.post(ATTENDANCE_BULK_URL, json={
            "records": [{"student_id": student_b, "date": str(date.today()), "status": "present"}],
        }, headers=_admin_headers(tenant_a))
        assert resp.status_code == 404
