"""POST/PUT /assessments/ (academic/assessments.py) — institutional-
readiness audit, 2026-09.

Two bugs found together. (a) subject_id/term_id/class_id were inserted/
updated verbatim with no check they belong to the caller's tenant — a
staff account could attach an assessment to another tenant's subject/
term/class, corrupting joins used by grades/report cards/transcripts.
(b) AssessmentCreate.class_id (and description) were accepted by the
request schema but never added to create_assessment's dynamic INSERT
column list — a caller setting class_id on creation got no error, but
the row was silently saved with class_id = NULL until a follow-up PUT
(which did honor it) was issued."""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.term import Term  # noqa: E402

BASE = "/api/v1/assessments"

_needs_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="raw SQL WHERE id=:param can't match SQLite's hex-no-dash GUID storage (see assessments.py).",
)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Évaluations Test", slug=f"assess-{tenant_id[:8]}",
            type="secondary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_subject(tenant_id: str) -> str:
    subject_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Subject(id=subject_id, tenant_id=tenant_id, name="Mathématiques"))
        db.commit()
    return subject_id


def _make_term(tenant_id: str) -> str:
    term_id = str(uuid.uuid4())
    year_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(AcademicYear(
            id=year_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
            start_date=date(2026, 9, 1), end_date=date(2027, 7, 1),
        ))
        db.commit()
        db.add(Term(
            id=term_id, tenant_id=tenant_id, academic_year_id=year_id, name="Trimestre 1",
            start_date=date(2026, 9, 1), end_date=date(2026, 12, 1),
        ))
        db.commit()
    return term_id


def _make_classroom(tenant_id: str) -> str:
    class_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Classroom(id=class_id, tenant_id=tenant_id, name="6eme A"))
        db.commit()
    return class_id


def _payload(subject_id: str, term_id: str = None, class_id: str = None) -> dict:
    body = {"subject_id": subject_id, "name": "Contrôle", "type": "QUIZ", "date": "2026-11-01", "max_score": 20.0}
    if term_id:
        body["term_id"] = term_id
    if class_id:
        body["class_id"] = class_id
    return body


class TestCreateAssessmentValidatesForeignKeys:
    @_needs_postgres
    def test_subject_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        foreign_subject_id = _make_subject(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/", json=_payload(foreign_subject_id), headers=headers)
        assert resp.status_code == 404, resp.text

    @_needs_postgres
    def test_term_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        subject_id = _make_subject(tenant_a)
        foreign_term_id = _make_term(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/", json=_payload(subject_id, term_id=foreign_term_id), headers=headers)
        assert resp.status_code == 404, resp.text

    @_needs_postgres
    def test_class_from_another_tenant_is_rejected(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        subject_id = _make_subject(tenant_a)
        foreign_class_id = _make_classroom(tenant_b)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})

        resp = client.post(f"{BASE}/", json=_payload(subject_id, class_id=foreign_class_id), headers=headers)
        assert resp.status_code == 404, resp.text

    @_needs_postgres
    def test_class_id_is_actually_persisted_on_create(self):
        """Regression: class_id used to be silently dropped from the
        dynamic INSERT — it was accepted by the schema but never written."""
        tenant_id = _make_tenant()
        subject_id = _make_subject(tenant_id)
        class_id = _make_classroom(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/", json=_payload(subject_id, class_id=class_id), headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["class_id"] == class_id

    @_needs_postgres
    def test_valid_assessment_without_class_is_created(self):
        tenant_id = _make_tenant()
        subject_id = _make_subject(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/", json=_payload(subject_id), headers=headers)
        assert resp.status_code == 200, resp.text


class TestUpdateAssessmentValidatesForeignKeys:
    @_needs_postgres
    def test_update_rejects_subject_from_another_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        subject_id = _make_subject(tenant_a)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})
        created = client.post(f"{BASE}/", json=_payload(subject_id), headers=headers)
        assert created.status_code == 200, created.text
        assessment_id = created.json()["id"]

        foreign_subject_id = _make_subject(tenant_b)
        updated = client.put(f"{BASE}/{assessment_id}/", json={"subject_id": foreign_subject_id}, headers=headers)
        assert updated.status_code == 404, updated.text
