"""Kiosk mode — unattended QR check-in/check-out (Phase 6 PWA backlog).

Device management (POST/GET/DELETE /kiosk/devices/) requires a normal
TENANT_ADMIN/DIRECTOR JWT. The scan endpoint (POST /kiosk/scan/) has no
JWT — the device authenticates via X-Kiosk-Token, verified against the
stored SHA-256 hash. TenantMiddleware must not reject it with 401 before
the handler runs (same class of bug as the payment webhooks — see
test_payment_webhook_events.py).
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.kiosk_device import KioskDevice  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.student_check_in import StudentCheckIn  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="kiosk_devices uses RLS, exercised against Postgres in this suite.",
)

DEVICES_URL = "/api/v1/kiosk/devices/"
SCAN_URL = "/api/v1/kiosk/scan/"


def _make_tenant(name: str = "École Kiosque", is_active: bool = True) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"kiosk-{uuid.uuid4().hex[:8]}",
            type="primary", country="GN", is_active=is_active, settings={},
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str, *, reg: str = "REG") -> str:
    student_id = str(uuid.uuid4())
    unique_reg = f"{reg}-{uuid.uuid4().hex[:6]}"
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=unique_reg,
            first_name="Enfant", last_name="Test", date_of_birth="2012-01-01",
            gender=Gender.MALE, status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id, unique_reg


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _admin_headers(tenant_id: str) -> dict:
    return _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})


def _teacher_headers(tenant_id: str) -> dict:
    return _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id})


def _create_device(tenant_id: str, label: str = "Tablette Entrée") -> str:
    resp = client.post(DEVICES_URL, json={"label": label}, headers=_admin_headers(tenant_id))
    assert resp.status_code == 201, resp.text
    return resp.json()["token"]


class TestDeviceManagementAccessControl:
    def test_requires_auth(self):
        resp = client.post(DEVICES_URL, json={"label": "x"})
        assert resp.status_code == 401

    def test_teacher_forbidden(self):
        tenant_id = _make_tenant()
        resp = client.post(DEVICES_URL, json={"label": "x"}, headers=_teacher_headers(tenant_id))
        assert resp.status_code == 403, resp.text

    def test_admin_can_create(self):
        tenant_id = _make_tenant()
        resp = client.post(DEVICES_URL, json={"label": "Tablette Entrée"}, headers=_admin_headers(tenant_id))
        assert resp.status_code == 201, resp.text
        assert resp.json()["label"] == "Tablette Entrée"
        assert resp.json()["is_active"] is True


class TestDeviceTokenSecrecy:
    def test_token_only_returned_once_at_creation(self):
        tenant_id = _make_tenant()
        create_resp = client.post(DEVICES_URL, json={"label": "x"}, headers=_admin_headers(tenant_id))
        assert "token" in create_resp.json()

        list_resp = client.get(DEVICES_URL, headers=_admin_headers(tenant_id))
        assert list_resp.status_code == 200
        for device in list_resp.json():
            assert "token" not in device
            assert "token_hash" not in device

    def test_only_hash_persisted_never_plaintext(self):
        tenant_id = _make_tenant()
        create_resp = client.post(DEVICES_URL, json={"label": "x"}, headers=_admin_headers(tenant_id))
        token = create_resp.json()["token"]

        with SessionLocal() as db:
            device = db.query(KioskDevice).filter(KioskDevice.tenant_id == tenant_id).first()
            assert device.token_hash != token
            assert len(device.token_hash) == 64  # sha256 hex digest


class TestDeviceRevocation:
    def test_revoke_sets_inactive_and_scan_then_fails(self):
        tenant_id = _make_tenant()
        create_resp = client.post(DEVICES_URL, json={"label": "x"}, headers=_admin_headers(tenant_id))
        device_id = create_resp.json()["id"]
        token = create_resp.json()["token"]

        revoke_resp = client.delete(f"{DEVICES_URL}{device_id}/", headers=_admin_headers(tenant_id))
        assert revoke_resp.status_code == 204

        scan_resp = client.post(SCAN_URL, json={"qr_payload": "whatever"}, headers={"X-Kiosk-Token": token})
        assert scan_resp.status_code == 401

    def test_cannot_revoke_another_tenants_device(self):
        tenant_a = _make_tenant("École A")
        tenant_b = _make_tenant("École B")
        create_resp = client.post(DEVICES_URL, json={"label": "x"}, headers=_admin_headers(tenant_a))
        device_id = create_resp.json()["id"]

        resp = client.delete(f"{DEVICES_URL}{device_id}/", headers=_admin_headers(tenant_b))
        assert resp.status_code == 404


class TestScanReachableWithoutAuth:
    """Régression potentielle : TenantMiddleware pourrait rejeter ce chemin
    en 401 avant même d'atteindre le handler (même classe de bug que les
    webhooks de paiement)."""

    def test_scan_endpoint_not_rejected_by_tenant_middleware(self):
        resp = client.post(SCAN_URL, json={"qr_payload": "x"}, headers={"X-Kiosk-Token": "bogus"})
        # 401 here must come from the handler's own token check, not from
        # the middleware short-circuiting before it runs.
        assert resp.status_code == 401
        assert resp.json()["detail"] != "Not authenticated"  # would indicate middleware/JWT rejection


class TestScan:
    def test_missing_token_rejected(self):
        resp = client.post(SCAN_URL, json={"qr_payload": "x"})
        assert resp.status_code == 401

    def test_valid_scan_by_registration_number_creates_check_in(self):
        tenant_id = _make_tenant()
        student_id, reg = _make_student(tenant_id)
        token = _create_device(tenant_id)

        resp = client.post(SCAN_URL, json={"qr_payload": reg, "direction": "IN"}, headers={"X-Kiosk-Token": token})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["direction"] == "IN"
        assert body["student_first_name"] == "Enfant"

        with SessionLocal() as db:
            check_in = db.query(StudentCheckIn).filter(StudentCheckIn.student_id == student_id).first()
            assert check_in is not None
            assert check_in.source == "KIOSK"
            assert check_in.direction == "IN"

    def test_valid_scan_by_student_id_creates_check_in(self):
        tenant_id = _make_tenant()
        student_id, _ = _make_student(tenant_id)
        token = _create_device(tenant_id)

        resp = client.post(SCAN_URL, json={"qr_payload": student_id, "direction": "OUT"}, headers={"X-Kiosk-Token": token})
        assert resp.status_code == 200, resp.text
        assert resp.json()["direction"] == "OUT"

    def test_unknown_qr_payload_returns_404_not_a_crash(self):
        tenant_id = _make_tenant()
        token = _create_device(tenant_id)

        resp = client.post(SCAN_URL, json={"qr_payload": "does-not-exist"}, headers={"X-Kiosk-Token": token})
        assert resp.status_code == 404

    def test_scan_isolated_per_tenant(self):
        """A device from tenant A must never be able to check in a student
        belonging to tenant B, even if it somehow guessed their registration
        number."""
        tenant_a = _make_tenant("École A")
        tenant_b = _make_tenant("École B")
        _, reg_b = _make_student(tenant_b, reg="ONLY-IN-B")
        token_a = _create_device(tenant_a)

        resp = client.post(SCAN_URL, json={"qr_payload": reg_b}, headers={"X-Kiosk-Token": token_a})
        assert resp.status_code == 404

    def test_inactive_tenant_rejected(self):
        tenant_id = _make_tenant("École Désactivée", is_active=True)
        token = _create_device(tenant_id)

        with SessionLocal() as db:
            db.query(Tenant).filter(Tenant.id == tenant_id).update({"is_active": False})
            db.commit()

        resp = client.post(SCAN_URL, json={"qr_payload": "x"}, headers={"X-Kiosk-Token": token})
        assert resp.status_code == 403

    def test_invalid_direction_defaults_to_in(self):
        tenant_id = _make_tenant()
        _, reg = _make_student(tenant_id)
        token = _create_device(tenant_id)

        resp = client.post(SCAN_URL, json={"qr_payload": reg, "direction": "SIDEWAYS"}, headers={"X-Kiosk-Token": token})
        assert resp.status_code == 200, resp.text
        assert resp.json()["direction"] == "IN"

    def test_scan_updates_last_used_at(self):
        tenant_id = _make_tenant()
        _, reg = _make_student(tenant_id)
        token = _create_device(tenant_id)

        with SessionLocal() as db:
            device = db.query(KioskDevice).filter(KioskDevice.tenant_id == tenant_id).first()
            assert device.last_used_at is None

        client.post(SCAN_URL, json={"qr_payload": reg}, headers={"X-Kiosk-Token": token})

        with SessionLocal() as db:
            device = db.query(KioskDevice).filter(KioskDevice.tenant_id == tenant_id).first()
            assert device.last_used_at is not None
