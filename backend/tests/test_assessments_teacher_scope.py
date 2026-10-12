"""POST/PUT/DELETE /assessments/ — un enseignant gère les évaluations de SES
classes (et matières), pas celles des autres.

Régression trouvée par les parcours E2E (2026-10-12) : seul settings:write
(administration) était accepté, donc le bouton « Nouvelle évaluation » de
l'espace enseignant répondait toujours 403.
"""
import uuid

import pytest
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from test_assessment_business_rules import (  # noqa: E402
    _as, _make_classroom, _make_subject, _make_tenant, _payload,
)
from test_enrollments_teacher_scope import _user  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="teacher_assignments est créée par migration (PostgreSQL).",
)

BASE = "/api/v1/assessments"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _assign(user_id: str, tenant_id: str, class_id: str, subject_id=None) -> None:
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO teacher_assignments (id, tenant_id, user_id, classroom_id, subject_id, created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :uid, :cid, :sid, NOW(), NOW())
        """), {"tid": tenant_id, "uid": user_id, "cid": class_id, "sid": subject_id})
        db.commit()


@pytest.fixture
def school():
    tenant_id = _make_tenant()
    subject = _make_subject(tenant_id)
    mine, other = _make_classroom(tenant_id), _make_classroom(tenant_id)
    teacher = _user(tenant_id, "TEACHER")
    _assign(teacher["id"], tenant_id, mine, subject)
    admin = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"]}
    return {"tenant_id": tenant_id, "subject": subject, "mine": mine, "other": other,
            "teacher": teacher, "admin": admin}


def _create(user, payload):
    return client.post(f"{BASE}/", json=payload, headers=_as(user))


def test_teacher_creates_an_assessment_for_an_assigned_class(school):
    resp = _create(school["teacher"], _payload(school["subject"], class_id=school["mine"]))
    assert resp.status_code == 200, resp.text
    assert resp.json()["class_id"] == school["mine"]


def test_teacher_cannot_create_for_a_colleagues_class(school):
    resp = _create(school["teacher"], _payload(school["subject"], class_id=school["other"]))
    assert resp.status_code == 403


def test_teacher_cannot_create_without_a_class(school):
    assert _create(school["teacher"], _payload(school["subject"])).status_code == 403


def test_teacher_cannot_create_for_another_subject_of_their_class(school):
    with SessionLocal() as db:
        subject = Subject(tenant_id=school["tenant_id"], name=f"Statistique {uuid.uuid4().hex[:6]}")
        db.add(subject)
        db.commit()
        other_subject = str(subject.id)
    resp = _create(school["teacher"], _payload(other_subject, class_id=school["mine"]))
    assert resp.status_code == 403


def test_teacher_cannot_edit_or_delete_another_class_assessment(school):
    theirs = _create(school["admin"], _payload(school["subject"], class_id=school["other"])).json()["id"]

    put = client.put(f"{BASE}/{theirs}/", json={"name": "Modifié"}, headers=_as(school["teacher"]))
    delete = client.delete(f"{BASE}/{theirs}/", headers=_as(school["teacher"]))

    assert put.status_code == 403
    assert delete.status_code == 403


def test_teacher_cannot_move_their_assessment_to_a_colleagues_class(school):
    own = _create(school["teacher"], _payload(school["subject"], class_id=school["mine"])).json()["id"]

    resp = client.put(f"{BASE}/{own}/", json={"class_id": school["other"]}, headers=_as(school["teacher"]))

    assert resp.status_code == 403


def test_teacher_edits_and_deletes_their_own_assessment(school):
    own = _create(school["teacher"], _payload(school["subject"], class_id=school["mine"])).json()["id"]

    assert client.put(f"{BASE}/{own}/", json={"name": "Partiel"}, headers=_as(school["teacher"])).status_code == 200
    assert client.delete(f"{BASE}/{own}/", headers=_as(school["teacher"])).status_code == 200


def test_student_role_is_still_refused(school):
    student = _user(school["tenant_id"], "STUDENT")
    _assign(student["id"], school["tenant_id"], school["mine"])  # ligne parasite : ne doit rien ouvrir
    resp = _create(student, _payload(school["subject"], class_id=school["mine"]))
    assert resp.status_code == 403


def test_admin_unchanged(school):
    resp = _create(school["admin"], _payload(school["subject"], class_id=school["other"]))
    assert resp.status_code == 200, resp.text
