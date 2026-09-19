"""RGPD anonymization must reach linked Student rows, not just User/Profile.

Institutional-readiness audit (2026-09), account-lifecycle/RGPD subagent
finding #1: `_anonymize_user` (app/api/v1/endpoints/core/rgpd.py) used to
touch only User.email/username/first_name/last_name/phone/address/
occupation/avatar_url and Profile.phone/avatar_url. A student's own PII
duplicated onto their `students` row (name, email, phone, address, city)
— or a parent's contact info duplicated onto their child's row
(parent_name/parent_phone/parent_email) — was left fully intact and
queryable after "deletion", directly breaking the droit à l'oubli promise.

These tests exercise the real DB (SessionLocal, not mocks) through
direct_delete_user via HTTP, proving:
- anonymizing a STUDENT's own account clears their Student row's PII
- anonymizing a PARENT clears only parent_* contact fields on linked
  students, never the child's own identity
- a student unrelated to the anonymized user is left untouched
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

DIRECT_DELETE_URL = "/api/v1/rgpd/direct-delete/{user_id}/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class _AuthedClient:
    def __init__(self, headers: dict):
        self._headers = headers

    def post(self, url, **kwargs):
        return client.post(url, headers=self._headers, **kwargs)


def _as(user: dict) -> _AuthedClient:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token(
        {"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])}
    )
    return _AuthedClient({"Authorization": f"Bearer {token}"})


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École RGPD Test", slug=f"rgpd-{tenant_id[:8]}",
            type="school", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str, *, email: str | None = None) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        user = User(
            id=user_id, tenant_id=tenant_id,
            email=email or f"u.{user_id[:8]}@ecole.gn",
            username=f"u.{user_id[:8]}", first_name="Amadou", last_name="Bah",
            password_hash="x", is_active=True,
        )
        db.add(user)
        db.flush()
        db.commit()
    return user_id


def _make_student(tenant_id: str, *, user_id: str | None = None, email: str | None = None) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, user_id=user_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Fatoumata", last_name="Diallo",
            date_of_birth=date(2005, 1, 1), gender=Gender.FEMALE,
            email=email, phone="+224611111111", address="Kaloum",
            city="Conakry",
            parent_name="Mariama Diallo", parent_phone="+224622222222",
            parent_email="mariama@example.gn",
        ))
        db.commit()
    return student_id


def _link_parent(tenant_id: str, *, parent_id: str, student_id: str) -> None:
    with SessionLocal() as db:
        db.add(ParentStudent(
            id=str(uuid.uuid4()), tenant_id=tenant_id,
            parent_id=parent_id, student_id=student_id,
        ))
        db.commit()


def _get_student(student_id: str) -> Student:
    with SessionLocal() as db:
        return db.query(Student).filter(Student.id == student_id).first()


class TestAnonymizationCoversStudentPII:
    def test_anonymizing_own_student_account_clears_student_row(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        student_id = _make_student(tenant_id, user_id=user_id)

        resp = _as({
            "id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": ["DIRECTOR"],
        }).post(DIRECT_DELETE_URL.format(user_id=user_id))
        assert resp.status_code == 200, resp.text

        student = _get_student(student_id)
        assert student.first_name == "Élève"
        assert student.last_name == "Anonymisé"
        assert student.email is None
        assert student.phone is None
        assert student.address is None
        assert student.city is None
        assert student.parent_name is None
        assert student.parent_phone is None
        assert student.parent_email is None

    def test_anonymizing_parent_clears_only_contact_fields_on_child(self):
        tenant_id = _make_tenant()
        parent_id = _make_user(tenant_id)
        student_id = _make_student(tenant_id)
        _link_parent(tenant_id, parent_id=parent_id, student_id=student_id)

        resp = _as({
            "id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": ["DIRECTOR"],
        }).post(DIRECT_DELETE_URL.format(user_id=parent_id))
        assert resp.status_code == 200, resp.text

        student = _get_student(student_id)
        # Child's own identity must survive erasing the parent's data.
        assert student.first_name == "Fatoumata"
        assert student.last_name == "Diallo"
        assert student.parent_name is None
        assert student.parent_phone is None
        assert student.parent_email is None

    def test_unrelated_student_is_untouched(self):
        tenant_id = _make_tenant()
        user_id = _make_user(tenant_id)
        _make_student(tenant_id, user_id=user_id)
        unrelated_student_id = _make_student(tenant_id)

        resp = _as({
            "id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": ["DIRECTOR"],
        }).post(DIRECT_DELETE_URL.format(user_id=user_id))
        assert resp.status_code == 200, resp.text

        unrelated = _get_student(unrelated_student_id)
        assert unrelated.first_name == "Fatoumata"
        assert unrelated.parent_name == "Mariama Diallo"
        assert unrelated.parent_phone == "+224622222222"
