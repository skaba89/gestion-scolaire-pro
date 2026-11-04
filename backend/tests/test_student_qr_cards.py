"""Cartes QR des élèves : un seul code, celui de la fiche (2026-11-04, BADGE-01).

Avant : la page admin « Badges » et l'impression par lot fabriquaient leur
propre code et l'envoyaient à des routes inexistantes ou à /student-badges/,
qui enregistrait un badge de récompense et jetait le code. Aucune carte
imprimée n'était reconnue au pointage, qui lit `students.card_uid` (borne,
scanner enseignant). En outre GET /school-life/badges/ et
/students-without-badges/ étaient ouverts à tout utilisateur connecté.

Tourne sur SQLite et PostgreSQL (ORM).
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

CARDS = "/api/v1/school-life/student-cards/"
SCAN = "/api/v1/school-life/check-ins/badges/"


@pytest.fixture(autouse=True)
def _clean():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _tenant() -> str:
    tid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École Cartes", slug=f"cartes-{tid[:8]}", type="primary",
                      country="GN", is_active=True, settings={}))
        db.commit()
    return tid


def _student(tid: str, first="Ibrahima") -> str:
    sid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(id=sid, tenant_id=tid, registration_number=f"M-{uuid.uuid4().hex[:8]}",
                       first_name=first, last_name="Sylla", date_of_birth=date(2012, 2, 2),
                       gender=Gender.MALE, status=StudentStatus.ACTIVE))
        db.commit()
    return sid


def _as(tid: str, role: str) -> dict:
    uid = str(uuid.uuid4())
    user = {"id": uid, "roles": [role], "tenant_id": tid}
    app.dependency_overrides[get_current_user] = lambda: user
    return {"Authorization": f"Bearer {create_access_token({'sub': uid, 'tenant_id': tid, 'roles': [role]})}"}


def _card_of(sid: str):
    with SessionLocal() as db:
        return db.query(Student.card_uid).filter(Student.id == sid).scalar()


class TestIssueAndScan:
    def test_issued_card_is_recognised_by_the_check_in_scanner(self):
        tid = _tenant()
        sid = _student(tid)
        resp = client.post(f"{CARDS}issue/", json={"student_ids": [sid]}, headers=_as(tid, "SECRETARY"))
        assert resp.status_code == 200, resp.text
        code = resp.json()["cards"][0]["card_uid"]
        assert code and code == _card_of(sid)
        found = client.get(SCAN, params={"qr_code_data": code}, headers=_as(tid, "TEACHER"))
        assert found.status_code == 200, found.text
        assert found.json()["student_id"] == sid

    def test_issue_does_not_change_an_existing_card_unless_reissued(self):
        tid = _tenant()
        sid = _student(tid)
        h = _as(tid, "TENANT_ADMIN")
        first = client.post(f"{CARDS}issue/", json={"student_ids": [sid]}, headers=h).json()["cards"][0]["card_uid"]
        again = client.post(f"{CARDS}issue/", json={"student_ids": [sid]}, headers=h).json()
        assert again["changed"] == 0 and again["cards"][0]["card_uid"] == first

    def test_reissue_invalidates_the_lost_card(self):
        tid = _tenant()
        sid = _student(tid)
        h = _as(tid, "TENANT_ADMIN")
        old = client.post(f"{CARDS}issue/", json={"student_ids": [sid]}, headers=h).json()["cards"][0]["card_uid"]
        new = client.post(f"{CARDS}issue/", json={"student_ids": [sid], "reissue": True}, headers=h).json()["cards"][0]["card_uid"]
        assert new != old
        assert client.get(SCAN, params={"qr_code_data": old}, headers=h).json() is None
        assert client.get(SCAN, params={"qr_code_data": new}, headers=h).json()["student_id"] == sid

    def test_revoked_card_is_no_longer_recognised(self):
        tid = _tenant()
        sid = _student(tid)
        h = _as(tid, "TENANT_ADMIN")
        code = client.post(f"{CARDS}issue/", json={"student_ids": [sid]}, headers=h).json()["cards"][0]["card_uid"]
        assert client.delete(f"{CARDS}{sid}/", headers=h).status_code == 200
        assert _card_of(sid) is None
        assert client.get(SCAN, params={"qr_code_data": code}, headers=h).json() is None

    def test_list_shows_students_with_and_without_card(self):
        tid = _tenant()
        with_card, without = _student(tid, "Awa"), _student(tid, "Binta")
        h = _as(tid, "TENANT_ADMIN")
        client.post(f"{CARDS}issue/", json={"student_ids": [with_card]}, headers=h)
        rows = {r["student_id"]: r["card_uid"] for r in client.get(CARDS, headers=h).json()}
        assert rows[with_card] and rows[without] is None


class TestIsolationAndPermissions:
    def test_student_of_another_school_is_404_and_nothing_changes(self):
        tid, other = _tenant(), _tenant()
        mine, foreign = _student(tid), _student(other)
        resp = client.post(f"{CARDS}issue/", json={"student_ids": [mine, foreign]}, headers=_as(tid, "TENANT_ADMIN"))
        assert resp.status_code == 404, resp.text
        assert _card_of(mine) is None and _card_of(foreign) is None
        assert client.delete(f"{CARDS}{foreign}/", headers=_as(tid, "TENANT_ADMIN")).status_code == 404

    def test_card_of_another_school_is_not_recognised(self):
        tid, other = _tenant(), _tenant()
        foreign = _student(other)
        code = client.post(f"{CARDS}issue/", json={"student_ids": [foreign]}, headers=_as(other, "TENANT_ADMIN")).json()["cards"][0]["card_uid"]
        assert client.get(SCAN, params={"qr_code_data": code}, headers=_as(tid, "TEACHER")).json() is None

    @pytest.mark.parametrize("role", ["TEACHER", "STUDENT", "PARENT"])
    def test_roles_without_students_write_cannot_manage_cards(self, role):
        tid = _tenant()
        sid = _student(tid)
        h = _as(tid, role)
        assert client.get(CARDS, headers=h).status_code == 403
        assert client.post(f"{CARDS}issue/", json={"student_ids": [sid]}, headers=h).status_code == 403
        assert client.delete(f"{CARDS}{sid}/", headers=h).status_code == 403

    @pytest.mark.parametrize("path", ["/api/v1/school-life/badges/", "/api/v1/school-life/students-without-badges/"])
    def test_badge_lists_are_no_longer_open_to_students(self, path):
        tid = _tenant()
        assert client.get(path, headers=_as(tid, "STUDENT")).status_code == 403

    def test_empty_and_oversized_requests_are_400(self):
        tid = _tenant()
        h = _as(tid, "TENANT_ADMIN")
        assert client.post(f"{CARDS}issue/", json={"student_ids": []}, headers=h).status_code == 400
        too_many = [str(uuid.uuid4()) for _ in range(501)]
        assert client.post(f"{CARDS}issue/", json={"student_ids": too_many}, headers=h).status_code == 400
