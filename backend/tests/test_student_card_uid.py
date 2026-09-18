"""students.card_uid — carte NFC/RFID (audit institutionnel 2026-09).

La même carte physique sert à badger en salle (voir test_kiosk.py) et à
identifier l'élève au comptoir de la bibliothèque. Le UID étant un
identifiant matériel, il est unique globalement (pas seulement par
tenant) — PUT /students/{id}/ doit refuser une carte déjà assignée à un
autre élève avec un 409 propre plutôt que de laisser fuiter l'erreur
d'intégrité de la base.
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

BASE = "/api/v1/students"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Carte NFC Test", slug=f"card-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str, card_uid: str = None) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Mamadou", last_name="Barry",
            date_of_birth=date(2009, 1, 20), gender=Gender.MALE,
            status=StudentStatus.ACTIVE, card_uid=card_uid,
        ))
        db.commit()
    return student_id


class TestAssignCardUid:
    def test_assign_card_to_student(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        card_uid = f"04{uuid.uuid4().hex[:12]}"

        resp = client.put(f"{BASE}/{student_id}/", json={"card_uid": card_uid}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["card_uid"] == card_uid

    def test_assign_already_used_card_returns_409(self):
        tenant_id = _make_tenant()
        card_uid = f"04{uuid.uuid4().hex[:12]}"
        _make_student(tenant_id, card_uid=card_uid)
        student_2 = _make_student(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.put(f"{BASE}/{student_2}/", json={"card_uid": card_uid}, headers=headers)
        assert resp.status_code == 409

    def test_reassigning_same_card_to_same_student_is_a_noop(self):
        tenant_id = _make_tenant()
        card_uid = f"04{uuid.uuid4().hex[:12]}"
        student_id = _make_student(tenant_id, card_uid=card_uid)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.put(f"{BASE}/{student_id}/", json={"card_uid": card_uid, "phone": "622000000"}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["card_uid"] == card_uid
