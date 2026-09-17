"""Institutional-readiness audit (2026-09), business-rules subagent —
DELETE /quiz-questions/{id}/ (aliases.py) never called db.commit(). Every
sibling delete endpoint in that file commits explicitly; this one didn't,
so SessionLocal's autocommit=False + get_db()'s bare db.close() silently
rolled the delete back — the API returned 204 but the row was never
actually removed.

quiz_questions is a raw-SQL operational table (DDL only in
app/core/operational_tables.py, no ORM model, never created by
Base.metadata.create_all()) — Postgres-only, same pattern as
test_message_reactions_authorization.py."""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="quiz_questions is a raw-SQL operational table whose DDL is "
           "Postgres-specific and never created on SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

BASE = "/api/v1/quiz-questions"


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Quiz Test", slug=f"quiz-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


class TestDeleteQuizQuestionActuallyPersists:
    def test_deleted_question_does_not_reappear_in_a_fresh_session(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        quiz_id = str(uuid.uuid4())

        created = client.post(f"{BASE}/", json={"quiz_id": quiz_id, "question_text": "Q1"}, headers=headers)
        assert created.status_code == 201, created.text

        before = client.get(f"{BASE}/", params={"quiz_id": quiz_id}, headers=headers).json()
        assert len(before) == 1
        question_id = before[0]["id"]

        deleted = client.delete(f"{BASE}/{question_id}/", headers=headers)
        assert deleted.status_code == 204, deleted.text

        # get_db() opens a brand-new SessionLocal per request — if the
        # DELETE's transaction never committed, this fresh session would
        # still see the row (the whole point of this regression test).
        after = client.get(f"{BASE}/", params={"quiz_id": quiz_id}, headers=headers).json()
        assert after == []

        with SessionLocal() as db:
            from sqlalchemy import text
            row = db.execute(text("SELECT id FROM quiz_questions WHERE id = :id"), {"id": question_id}).first()
            assert row is None
