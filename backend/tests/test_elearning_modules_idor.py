"""GET /analytics/elearning/courses/{course_id}/modules/ — audit
institutionnel 2026-09 (7e vague).

Contrairement aux autres endpoints e-learning du même fichier (qui
filtrent tous par tenant_id), cet endpoint ne vérifiait ni que course_id
appartient au tenant courant, ni aucun tenant_id du tout : un utilisateur
authentifié avec homework:read pouvait énumérer les modules (titres,
descriptions) de n'importe quel cours d'un autre établissement en
devinant/énumérant un course_id.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from sqlalchemy import text  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="elearning_courses/elearning_modules are raw-DDL tables using gen_random_uuid().",
)

BASE = "/api/v1/analytics"


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
            id=tenant_id, name="École E-Learning Test", slug=f"elearning-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_course_with_module(tenant_id: str) -> str:
    with SessionLocal() as db:
        course = db.execute(text("""
            INSERT INTO elearning_courses (tenant_id, title, status, is_published)
            VALUES (:tid, 'Cours Secret', 'draft', false)
            RETURNING id
        """), {"tid": tenant_id}).mappings().first()
        course_id = str(course["id"])
        db.execute(text("""
            INSERT INTO elearning_modules (course_id, title, description, order_index)
            VALUES (:cid, 'Module confidentiel', 'contenu sensible', 0)
        """), {"cid": course_id})
        db.commit()
    return course_id


class TestElearningModulesIdor:
    def test_owning_tenant_can_list_modules(self):
        tenant_id = _make_tenant()
        course_id = _make_course_with_module(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.get(f"{BASE}/elearning/courses/{course_id}/modules/", headers=headers)
        assert resp.status_code == 200, resp.text
        titles = [m["title"] for m in resp.json()]
        assert "Module confidentiel" in titles

    def test_other_tenant_cannot_list_modules(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        course_id = _make_course_with_module(tenant_a)
        headers_b = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_b})

        resp = client.get(f"{BASE}/elearning/courses/{course_id}/modules/", headers=headers_b)
        assert resp.status_code == 404
