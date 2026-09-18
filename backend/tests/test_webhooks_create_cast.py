"""POST /webhooks/ — audit institutionnel 2026-09 (7e vague).

Le INSERT utilisait ``:events::text[]`` (aucun espace avant le cast
Postgres), le même bug de parsing de bind param SQLAlchemy déjà corrigé
dans finance/payment_schedules.py lors de la 5e vague — jamais couvert
par un test, donc jamais détecté malgré le fait que la création de
webhook n'a probablement jamais fonctionné en pratique.
"""
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
    reason="webhooks is a raw-DDL table using Postgres TEXT[]/JSONB casts.",
)

BASE = "/api/v1/webhooks"


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Webhooks Test", slug=f"webhooks-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


class TestCreateWebhook:
    def test_create_webhook_with_events_array(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(BASE + "/", json={
            "url": "https://example.com/hook",
            "events": ["student.created", "grade.created"],
            "description": "Test webhook",
        }, headers=headers)
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert set(body["events"]) == {"student.created", "grade.created"}
        assert body["has_secret"] is False

    def test_create_webhook_with_secret(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(BASE + "/", json={
            "url": "https://example.com/hook-secret",
            "events": ["student.created"],
            "secret": "s3cr3t",
        }, headers=headers)
        assert resp.status_code == 201, resp.text
        assert resp.json()["has_secret"] is True
