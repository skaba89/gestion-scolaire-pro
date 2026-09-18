"""POST /admissions/public/reenroll/ — audit institutionnel 2026-09 (7e vague).

L'INSERT utilisait ``:documents::jsonb`` (aucun espace avant le cast
Postgres), le même bug de parsing de bind param SQLAlchemy déjà corrigé
dans finance/payment_schedules.py lors de la 5e vague — le flux public de
réinscription n'avait jamais été exercé par un test.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="admission_applications INSERT uses gen_random_uuid()/jsonb, Postgres-only.",
)

BASE = "/api/v1/admissions"


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Réinscription Test", slug=f"reenroll-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Fatoumata", last_name="Bah",
            date_of_birth=date(2010, 6, 15), gender=Gender.FEMALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _make_academic_year(tenant_id: str) -> str:
    ay_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(AcademicYear(
            id=ay_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
            start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True,
        ))
        db.commit()
    return ay_id


def _make_level(tenant_id: str) -> str:
    level_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Level(id=level_id, tenant_id=tenant_id, name="CM2", code="CM2"))
        db.commit()
    return level_id


class TestPublicReenroll:
    def test_submit_reenrollment_request(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        ay_id = _make_academic_year(tenant_id)
        level_id = _make_level(tenant_id)

        resp = client.post(f"{BASE}/public/reenroll/", json={
            "tenant_id": tenant_id,
            "student_id": student_id,
            "academic_year_id": ay_id,
            "level_id": level_id,
            "parent_email": "parent@example.com",
            "notes": "Merci de confirmer",
        })
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "SUBMITTED"
        assert body["reference"]

    def test_duplicate_reenrollment_request_rejected(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        ay_id = _make_academic_year(tenant_id)
        level_id = _make_level(tenant_id)

        payload = {
            "tenant_id": tenant_id,
            "student_id": student_id,
            "academic_year_id": ay_id,
            "level_id": level_id,
            "parent_email": "parent@example.com",
        }
        first = client.post(f"{BASE}/public/reenroll/", json=payload)
        assert first.status_code == 200, first.text

        second = client.post(f"{BASE}/public/reenroll/", json=payload)
        assert second.status_code == 409
