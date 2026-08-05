"""POST /grades/ idempotency (Phase 4, national commercialisation brief)
— a retried offline-queue submission (e.g. a teacher's connection drops
right after grading, the outbox retries) must never create the grade
twice. Same X-Idempotency-Key contract as /attendance/ and
/communication/conversations/{id}/messages/ — see app/core/idempotency.py.
"""
import datetime
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user, get_password_hash  # noqa: E402
from app.main import app  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="idempotency_keys/grades are exercised against Postgres in this suite.",
)

HEADERS = {"Authorization": "Bearer mock-token"}
URL = "/api/v1/grades/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(tenant_id: str, user_id: str) -> dict:
    user = {"id": user_id, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _make_tenant_and_student() -> tuple[str, str, str]:
    """Returns (tenant_id, student_id, teacher_user_id) — idempotency_keys.user_id
    has a FK to users.id, so the caller must be a real row, unlike lighter
    tests that mock current_user without a backing User record."""
    tenant_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    teacher_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Idempotence Notes", slug=f"grade-idem-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.add(Student(
            id=student_id, tenant_id=tenant_id, first_name="Sekou", last_name="Camara",
            registration_number=f"REG-{uuid.uuid4().hex[:6]}", status=StudentStatus.ACTIVE,
            date_of_birth=datetime.date(2013, 1, 1), gender=Gender.MALE,
        ))
        email = f"teacher.{uuid.uuid4().hex[:6]}@ecole.gn"
        db.add(User(
            id=teacher_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Aïssatou", last_name="Bah",
            password_hash=get_password_hash("x"), is_active=True, is_verified=True,
        ))
        db.commit()
    return tenant_id, student_id, teacher_id


class TestGradesIdempotency:
    def test_same_key_same_body_creates_grade_once(self):
        tenant_id, student_id, teacher_id = _make_tenant_and_student()
        headers = {**_as(tenant_id, teacher_id), "X-Idempotency-Key": f"key-{uuid.uuid4().hex}"}
        body = {"student_id": student_id, "score": 15.0, "max_score": 20.0, "coefficient": 1.0}

        resp1 = client.post(URL, json=body, headers=headers)
        resp2 = client.post(URL, json=body, headers=headers)

        assert resp1.status_code == 201, resp1.text
        assert resp2.status_code == 201, resp2.text
        assert resp1.json()["id"] == resp2.json()["id"]

        with SessionLocal() as db:
            count = db.query(Grade).filter(Grade.student_id == student_id).count()
            assert count == 1

    def test_same_key_different_body_returns_409(self):
        tenant_id, student_id, teacher_id = _make_tenant_and_student()
        key = f"key-{uuid.uuid4().hex}"
        headers = {**_as(tenant_id, teacher_id), "X-Idempotency-Key": key}

        resp1 = client.post(URL, json={"student_id": student_id, "score": 12.0, "max_score": 20.0}, headers=headers)
        assert resp1.status_code == 201, resp1.text

        resp2 = client.post(URL, json={"student_id": student_id, "score": 18.0, "max_score": 20.0}, headers=headers)
        assert resp2.status_code == 409

    def test_without_key_behaves_as_before_two_calls_create_two_grades(self):
        tenant_id, student_id, teacher_id = _make_tenant_and_student()
        headers = _as(tenant_id, teacher_id)
        body = {"student_id": student_id, "score": 14.0, "max_score": 20.0}

        resp1 = client.post(URL, json=body, headers=headers)
        resp2 = client.post(URL, json=body, headers=headers)
        assert resp1.status_code == 201
        assert resp2.status_code == 201
        assert resp1.json()["id"] != resp2.json()["id"]
