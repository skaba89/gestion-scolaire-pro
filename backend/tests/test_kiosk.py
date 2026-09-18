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
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.attendance import Attendance  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.kiosk_device import KioskDevice  # noqa: E402
from app.models.room import Room  # noqa: E402
from app.models.schedule import ScheduleSlot  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.student_check_in import StudentCheckIn  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from datetime import date, datetime, time, timedelta  # noqa: E402

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


class TestClassroomBadgeIn:
    """Feature (institutional-readiness audit, 2026-09): a kiosk device
    bound to a room (a badge sensor at a classroom door) auto-marks the
    scanning student PRESENT for the course currently in session there,
    if they're actually enrolled in that class — never overwriting an
    already-recorded attendance entry."""

    def _make_room(self, tenant_id: str) -> str:
        room_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Room(id=room_id, tenant_id=tenant_id, name="Salle 101"))
            db.commit()
        return room_id

    def _make_classroom(self, tenant_id: str) -> str:
        class_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Classroom(id=class_id, tenant_id=tenant_id, name="6eme A"))
            db.commit()
        return class_id

    def _make_subject(self, tenant_id: str, name: str = "Mathématiques") -> str:
        subject_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Subject(id=subject_id, tenant_id=tenant_id, name=name))
            db.commit()
        return subject_id

    def _make_current_slot(self, tenant_id: str, *, room_id: str, class_id: str, subject_id: str) -> str:
        """A schedule slot covering the whole current day, so the test is
        never flaky about the wall-clock time it happens to run at."""
        slot_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(ScheduleSlot(
                id=slot_id, tenant_id=tenant_id, class_id=class_id, subject_id=subject_id, room_id=room_id,
                day_of_week=datetime.now().isoweekday(), start_time=time(0, 0), end_time=time(23, 59),
            ))
            db.commit()
        return slot_id

    def _make_academic_year(self, tenant_id: str) -> str:
        year_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(AcademicYear(
                id=year_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
                start_date=date(2026, 9, 1), end_date=date(2027, 7, 1),
            ))
            db.commit()
        return year_id

    def _enroll(self, tenant_id: str, *, student_id: str, class_id: str, year_id: str) -> None:
        with SessionLocal() as db:
            db.add(Enrollment(
                id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
                class_id=class_id, academic_year_id=year_id, status="ACTIVE",
            ))
            db.commit()

    def _create_room_bound_device(self, tenant_id: str, room_id: str) -> str:
        resp = client.post(DEVICES_URL, json={"label": "Capteur Salle 101", "room_id": room_id}, headers=_admin_headers(tenant_id))
        assert resp.status_code == 201, resp.text
        return resp.json()["token"]

    def test_enrolled_student_badging_in_is_marked_present(self):
        tenant_id = _make_tenant()
        student_id, reg = _make_student(tenant_id)
        room_id = self._make_room(tenant_id)
        class_id = self._make_classroom(tenant_id)
        subject_id = self._make_subject(tenant_id)
        self._make_current_slot(tenant_id, room_id=room_id, class_id=class_id, subject_id=subject_id)
        year_id = self._make_academic_year(tenant_id)
        self._enroll(tenant_id, student_id=student_id, class_id=class_id, year_id=year_id)
        token = self._create_room_bound_device(tenant_id, room_id)

        resp = client.post(SCAN_URL, json={"qr_payload": reg, "direction": "IN"}, headers={"X-Kiosk-Token": token})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["attendance_marked"] is True
        assert body["course_name"] == "Mathématiques"

        with SessionLocal() as db:
            record = db.query(Attendance).filter(Attendance.student_id == student_id).first()
            assert record is not None
            assert record.status == "PRESENT"
            assert str(record.classroom_id) == class_id
            assert "Badge automatique" in record.reason

    def test_student_not_enrolled_in_class_is_not_marked_present(self):
        tenant_id = _make_tenant()
        student_id, reg = _make_student(tenant_id)
        room_id = self._make_room(tenant_id)
        class_id = self._make_classroom(tenant_id)
        subject_id = self._make_subject(tenant_id)
        self._make_current_slot(tenant_id, room_id=room_id, class_id=class_id, subject_id=subject_id)
        # deliberately no enrollment for this student
        token = self._create_room_bound_device(tenant_id, room_id)

        resp = client.post(SCAN_URL, json={"qr_payload": reg}, headers={"X-Kiosk-Token": token})
        assert resp.status_code == 200, resp.text
        assert resp.json()["attendance_marked"] is False

        with SessionLocal() as db:
            assert db.query(Attendance).filter(Attendance.student_id == student_id).first() is None

    def test_second_badge_same_day_does_not_duplicate_or_overwrite(self):
        tenant_id = _make_tenant()
        student_id, reg = _make_student(tenant_id)
        room_id = self._make_room(tenant_id)
        class_id = self._make_classroom(tenant_id)
        subject_id = self._make_subject(tenant_id)
        self._make_current_slot(tenant_id, room_id=room_id, class_id=class_id, subject_id=subject_id)
        year_id = self._make_academic_year(tenant_id)
        self._enroll(tenant_id, student_id=student_id, class_id=class_id, year_id=year_id)
        token = self._create_room_bound_device(tenant_id, room_id)

        first = client.post(SCAN_URL, json={"qr_payload": reg}, headers={"X-Kiosk-Token": token})
        assert first.json()["attendance_marked"] is True

        second = client.post(SCAN_URL, json={"qr_payload": reg}, headers={"X-Kiosk-Token": token})
        assert second.status_code == 200, second.text
        assert second.json()["attendance_marked"] is False

        with SessionLocal() as db:
            records = db.query(Attendance).filter(Attendance.student_id == student_id).all()
            assert len(records) == 1

    def test_out_direction_never_marks_attendance(self):
        tenant_id = _make_tenant()
        student_id, reg = _make_student(tenant_id)
        room_id = self._make_room(tenant_id)
        class_id = self._make_classroom(tenant_id)
        subject_id = self._make_subject(tenant_id)
        self._make_current_slot(tenant_id, room_id=room_id, class_id=class_id, subject_id=subject_id)
        year_id = self._make_academic_year(tenant_id)
        self._enroll(tenant_id, student_id=student_id, class_id=class_id, year_id=year_id)
        token = self._create_room_bound_device(tenant_id, room_id)

        resp = client.post(SCAN_URL, json={"qr_payload": reg, "direction": "OUT"}, headers={"X-Kiosk-Token": token})
        assert resp.status_code == 200, resp.text
        assert resp.json()["attendance_marked"] is False

    def test_device_not_bound_to_a_room_never_marks_attendance(self):
        """Regression: a plain campus-entrance device (the original
        design, room_id=None) must behave exactly as before."""
        tenant_id = _make_tenant()
        _, reg = _make_student(tenant_id)
        token = _create_device(tenant_id)  # no room_id

        resp = client.post(SCAN_URL, json={"qr_payload": reg}, headers={"X-Kiosk-Token": token})
        assert resp.status_code == 200, resp.text
        assert resp.json()["attendance_marked"] is False
        assert resp.json()["course_name"] is None

    def test_no_course_in_session_in_the_room_right_now(self):
        tenant_id = _make_tenant()
        student_id, reg = _make_student(tenant_id)
        room_id = self._make_room(tenant_id)
        class_id = self._make_classroom(tenant_id)
        subject_id = self._make_subject(tenant_id)
        year_id = self._make_academic_year(tenant_id)
        self._enroll(tenant_id, student_id=student_id, class_id=class_id, year_id=year_id)
        # No schedule slot at all for this room.
        token = self._create_room_bound_device(tenant_id, room_id)

        resp = client.post(SCAN_URL, json={"qr_payload": reg}, headers={"X-Kiosk-Token": token})
        assert resp.status_code == 200, resp.text
        assert resp.json()["attendance_marked"] is False

    def test_create_device_rejects_room_from_another_tenant(self):
        tenant_a = _make_tenant("École A")
        tenant_b = _make_tenant("École B")
        foreign_room_id = self._make_room(tenant_b)

        resp = client.post(DEVICES_URL, json={"label": "x", "room_id": foreign_room_id}, headers=_admin_headers(tenant_a))
        assert resp.status_code == 404, resp.text


class TestScheduleSlotRoster:
    """Feature (institutional-readiness audit, 2026-09): GET /schedule/
    {slot_id}/roster/ — the list of every student enrolled in a course,
    with their attendance status for the day, so a teacher can see who's
    expected and who has actually shown up (including via classroom
    badge-in)."""

    ROSTER_URL = "/api/v1/schedule/{slot_id}/roster/"

    def _make_room(self, tenant_id: str) -> str:
        room_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Room(id=room_id, tenant_id=tenant_id, name="Salle 101"))
            db.commit()
        return room_id

    def _make_classroom(self, tenant_id: str) -> str:
        class_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Classroom(id=class_id, tenant_id=tenant_id, name="6eme A"))
            db.commit()
        return class_id

    def _make_subject(self, tenant_id: str) -> str:
        subject_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Subject(id=subject_id, tenant_id=tenant_id, name="Mathématiques"))
            db.commit()
        return subject_id

    def _make_teacher(self, tenant_id: str) -> str:
        teacher_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(User(
                id=teacher_id, tenant_id=tenant_id, email=f"{teacher_id[:8]}@example.com",
                username=f"teacher-{teacher_id[:8]}", is_active=True,
            ))
            db.commit()
        return teacher_id

    def _make_slot(self, tenant_id: str, *, class_id: str, subject_id: str, teacher_id: str) -> str:
        slot_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(ScheduleSlot(
                id=slot_id, tenant_id=tenant_id, class_id=class_id, subject_id=subject_id,
                teacher_id=teacher_id, day_of_week=1, start_time=time(8, 0), end_time=time(9, 0),
            ))
            db.commit()
        return slot_id

    def _make_academic_year(self, tenant_id: str) -> str:
        year_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(AcademicYear(
                id=year_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
                start_date=date(2026, 9, 1), end_date=date(2027, 7, 1),
            ))
            db.commit()
        return year_id

    def _enroll(self, tenant_id: str, *, student_id: str, class_id: str, year_id: str) -> None:
        with SessionLocal() as db:
            db.add(Enrollment(
                id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
                class_id=class_id, academic_year_id=year_id, status="ACTIVE",
            ))
            db.commit()

    def test_teacher_sees_own_class_roster_all_pending(self):
        tenant_id = _make_tenant()
        class_id = self._make_classroom(tenant_id)
        subject_id = self._make_subject(tenant_id)
        teacher_id = self._make_teacher(tenant_id)
        slot_id = self._make_slot(tenant_id, class_id=class_id, subject_id=subject_id, teacher_id=teacher_id)
        year_id = self._make_academic_year(tenant_id)
        s1, _ = _make_student(tenant_id, reg="ROSTER-1")
        s2, _ = _make_student(tenant_id, reg="ROSTER-2")
        self._enroll(tenant_id, student_id=s1, class_id=class_id, year_id=year_id)
        self._enroll(tenant_id, student_id=s2, class_id=class_id, year_id=year_id)

        headers = _as({"id": teacher_id, "roles": ["TEACHER"], "tenant_id": tenant_id})
        resp = client.get(self.ROSTER_URL.format(slot_id=slot_id), headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["students"]) == 2
        assert all(s["status"] == "PENDING" for s in body["students"])

    def test_teacher_who_does_not_own_the_slot_is_forbidden(self):
        tenant_id = _make_tenant()
        class_id = self._make_classroom(tenant_id)
        subject_id = self._make_subject(tenant_id)
        teacher_id = self._make_teacher(tenant_id)
        other_teacher_id = self._make_teacher(tenant_id)
        slot_id = self._make_slot(tenant_id, class_id=class_id, subject_id=subject_id, teacher_id=teacher_id)

        headers = _as({"id": other_teacher_id, "roles": ["TEACHER"], "tenant_id": tenant_id})
        resp = client.get(self.ROSTER_URL.format(slot_id=slot_id), headers=headers)
        assert resp.status_code == 403, resp.text

    def test_student_role_is_forbidden(self):
        tenant_id = _make_tenant()
        class_id = self._make_classroom(tenant_id)
        subject_id = self._make_subject(tenant_id)
        teacher_id = self._make_teacher(tenant_id)
        slot_id = self._make_slot(tenant_id, class_id=class_id, subject_id=subject_id, teacher_id=teacher_id)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id})
        resp = client.get(self.ROSTER_URL.format(slot_id=slot_id), headers=headers)
        assert resp.status_code == 403, resp.text

    def test_admin_can_view_any_slots_roster(self):
        tenant_id = _make_tenant()
        class_id = self._make_classroom(tenant_id)
        subject_id = self._make_subject(tenant_id)
        teacher_id = self._make_teacher(tenant_id)
        slot_id = self._make_slot(tenant_id, class_id=class_id, subject_id=subject_id, teacher_id=teacher_id)

        headers = _admin_headers(tenant_id)
        resp = client.get(self.ROSTER_URL.format(slot_id=slot_id), headers=headers)
        assert resp.status_code == 200, resp.text

    def test_recorded_attendance_status_is_reflected(self):
        tenant_id = _make_tenant()
        class_id = self._make_classroom(tenant_id)
        subject_id = self._make_subject(tenant_id)
        teacher_id = self._make_teacher(tenant_id)
        slot_id = self._make_slot(tenant_id, class_id=class_id, subject_id=subject_id, teacher_id=teacher_id)
        year_id = self._make_academic_year(tenant_id)
        student_id, _ = _make_student(tenant_id, reg="ROSTER-3")
        self._enroll(tenant_id, student_id=student_id, class_id=class_id, year_id=year_id)

        today = date.today().isoformat()
        with SessionLocal() as db:
            db.add(Attendance(
                id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
                subject_id=subject_id, classroom_id=class_id, date=today, status="ABSENT",
            ))
            db.commit()

        headers = _as({"id": teacher_id, "roles": ["TEACHER"], "tenant_id": tenant_id})
        resp = client.get(self.ROSTER_URL.format(slot_id=slot_id), headers=headers)
        assert resp.status_code == 200, resp.text
        student_row = next(s for s in resp.json()["students"] if s["student_id"] == student_id)
        assert student_row["status"] == "ABSENT"
