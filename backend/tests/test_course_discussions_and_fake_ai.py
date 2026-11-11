"""E-learning, correction honnête (2026-11-11).

- `POST /ai/generate/` renvoyait un résumé et un QCM FICTIFS présentés comme
  générés par IA : la route est retirée.
- `GET /course-discussions/` : l'accueil élève demandait les messages
  principaux (`parent_id__isnull`, ignoré) et lisait des champs absents
  (`profiles`, `courses`) ; désormais `top_level=true`, `author` et `course`.
  Les erreurs ne sont plus avalées en liste vide.
"""
import uuid

import pytest
from conftest import get_test_client
from sqlalchemy import text

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
_CREATED: list[str] = []


def _as(tid: str, uid: str | None = None, role: str = "STUDENT"):
    app.dependency_overrides[get_current_user] = lambda: {"id": uid or str(uuid.uuid4()), "tenant_id": tid, "roles": [role]}
    return client


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    app.dependency_overrides.pop(get_current_user, None)
    tenants = list(_CREATED)
    _CREATED.clear()
    if not tenants or engine.dialect.name != "postgresql":
        return
    with SessionLocal() as db:
        params = {"t": tenants}
        for table in ("course_discussions", "elearning_courses", "users"):
            db.execute(text(f"DELETE FROM {table} WHERE tenant_id = ANY(CAST(:t AS uuid[]))"), params)
        db.execute(text("DELETE FROM tenants WHERE id = ANY(CAST(:t AS uuid[]))"), params)
        db.commit()


def test_fake_ai_generation_route_is_gone():
    r = _as(str(uuid.uuid4()), role="TENANT_ADMIN").post(
        "/api/v1/ai/generate/", json={"lesson_id": "x", "type": "SUMMARY"}, headers=HEADERS)
    assert r.status_code in (404, 405)


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Tables e-learning sans modèle ORM : PostgreSQL")
def test_top_level_discussions_with_author_and_course_title():
    tid, uid = str(uuid.uuid4()), str(uuid.uuid4())
    _CREATED.append(tid)
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École E-learning", slug=f"el-{tid[:12]}", type="primary",
                      country="GN", is_active=True, settings={}))
        db.flush()
        db.add(User(id=uid, tenant_id=tid, email=f"{uid[:12]}@example.com", username=uid,
                    first_name="Awa", last_name="Bah", is_active=True))
        db.flush()
        course_id = db.execute(text(
            "INSERT INTO elearning_courses (tenant_id, title) VALUES (:t, 'Algèbre') RETURNING id"
        ), {"t": tid}).scalar()
        root = db.execute(text(
            "INSERT INTO course_discussions (tenant_id, course_id, user_id, content) "
            "VALUES (:t, :c, :u, 'Question sur les équations') RETURNING id"
        ), {"t": tid, "c": course_id, "u": uid}).scalar()
        db.execute(text(
            "INSERT INTO course_discussions (tenant_id, course_id, user_id, content, parent_id) "
            "VALUES (:t, :c, :u, 'Réponse', :p)"
        ), {"t": tid, "c": course_id, "u": uid, "p": root})
        db.commit()

    everything = _as(tid).get("/api/v1/course-discussions/", headers=HEADERS).json()
    assert len(everything) == 2
    [top] = _as(tid).get("/api/v1/course-discussions/", params={"top_level": True}, headers=HEADERS).json()
    assert top["content"] == "Question sur les équations"
    assert top["author"] == {"first_name": "Awa", "last_name": "Bah"}
    assert top["course"]["title"] == "Algèbre"
    # Autre établissement (réel) : rien.
    other = str(uuid.uuid4())
    _CREATED.append(other)
    with SessionLocal() as db:
        db.add(Tenant(id=other, name="Autre école", slug=f"el2-{other[:12]}", type="primary",
                      country="GN", is_active=True, settings={}))
        db.commit()
    r = _as(other).get("/api/v1/course-discussions/", headers=HEADERS)
    assert r.status_code == 200 and r.json() == []
