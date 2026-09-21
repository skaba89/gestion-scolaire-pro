"""GET /subjects/{id}/prerequisites/ — module université follow-up.

subject_prerequisites (self-referential M2M on Subject, added in the LMD
core PR) was never exposed via a GET endpoint, unlike its sibling
associations (subject_departments -> GET /subjects/{id}/departments/,
subject_levels -> GET /subjects/{id}/levels/) — a frontend editing
prerequisites (Subjects.tsx) needs the same lookup shape to pre-populate
its form when editing an existing subject.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.associations import subject_prerequisites  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

URL = "/api/v1/subjects/{subject_id}/prerequisites/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant_with_prerequisite_pair():
    tenant_id = str(uuid.uuid4())
    prereq_id = str(uuid.uuid4())
    advanced_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Prérequis Endpoint Test", slug=f"prereq-ep-{tenant_id[:8]}",
            type="university", country="GN", is_active=True, settings={},
        ))
        db.flush()
        db.add(Subject(id=prereq_id, tenant_id=tenant_id, name="Algorithmique", ects=6.0))
        db.add(Subject(id=advanced_id, tenant_id=tenant_id, name="Algorithmique Avancée", ects=6.0))
        db.flush()
        db.execute(subject_prerequisites.insert().values(
            tenant_id=tenant_id, subject_id=advanced_id, prerequisite_subject_id=prereq_id,
        ))
        db.commit()
    return {"tenant_id": tenant_id, "prereq_id": prereq_id, "advanced_id": advanced_id}


class TestGetSubjectPrerequisites:
    def test_returns_prerequisite_ids(self):
        ctx = _make_tenant_with_prerequisite_pair()
        resp = client.get(
            URL.format(subject_id=ctx["advanced_id"]),
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == [ctx["prereq_id"]]

    def test_returns_empty_list_when_no_prerequisites(self):
        ctx = _make_tenant_with_prerequisite_pair()
        resp = client.get(
            URL.format(subject_id=ctx["prereq_id"]),
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == []

    def test_tenant_isolation(self):
        ctx = _make_tenant_with_prerequisite_pair()
        other_tenant_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=other_tenant_id, name="Autre École", slug=f"other-{other_tenant_id[:8]}",
                type="university", country="GN", is_active=True, settings={},
            ))
            db.commit()
        resp = client.get(
            URL.format(subject_id=ctx["advanced_id"]),
            headers=_as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": other_tenant_id}),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == []

    def test_requires_settings_read_permission(self):
        """ALUMNI holds subjects:read but not settings:read (see
        ROLE_PERMISSIONS) — the right role to prove this endpoint's
        existing settings:read gate (unchanged, matches its
        departments/levels siblings) actually gates something."""
        ctx = _make_tenant_with_prerequisite_pair()
        resp = client.get(
            URL.format(subject_id=ctx["advanced_id"]),
            headers=_as({"id": str(uuid.uuid4()), "roles": ["ALUMNI"], "tenant_id": ctx["tenant_id"]}),
        )
        assert resp.status_code == 403, resp.text
