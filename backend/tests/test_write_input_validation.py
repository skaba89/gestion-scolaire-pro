"""Saisies mal formées : 422, jamais 500 (parcours CRAWL-W, lot C, 2026-11-11).

Le parcours des routes d'écriture envoyait des valeurs non UUID ou des dates
illisibles : une vingtaine de routes laissaient la valeur atteindre
PostgreSQL et répondaient 500. Trois correctifs :
- `sqlalchemy.exc.DataError` (SQLSTATE 22) → 422 globalement ;
- identifiants typés `UUIDStr` là où un `except Exception` avalait l'erreur ;
- corps typés (forums) et `ValueError` de contrôle converti (POST /classrooms/).
"""
import asyncio
import json
import os
import uuid
from datetime import date

import pytest
from sqlalchemy.exc import DataError
from starlette.requests import Request

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.exceptions import data_error_handler  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

IS_POSTGRES = os.environ.get("DATABASE_URL", "").startswith("postgresql")


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _tenant() -> str:
    tid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École Saisies", slug=f"in-{tid[:8]}", type="primary",
                      country="GN", is_active=True, settings={}))
        db.commit()
    return tid


def _admin(tenant_id: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": tenant_id, "roles": user["roles"]})
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


def test_data_error_handler_answers_422_without_echoing_the_value():
    request = Request({"type": "http", "method": "POST", "path": "/x", "headers": [], "query_string": b""})
    exc = DataError("INSERT …", {"v": "valeur-secrète"}, Exception('invalid input syntax for type uuid: "valeur-secrète"'))
    resp = asyncio.run(data_error_handler(request, exc))
    assert resp.status_code == 422
    body = json.loads(resp.body)
    assert body["error"] == "INVALID_DATA"
    assert "valeur-secrète" not in resp.body.decode()


@pytest.mark.parametrize("path,body", [
    ("/api/v1/inventory/adjust/", {"item_id": "crawl", "quantity": 1, "type": "IN"}),
    ("/api/v1/school-life/event-registrations/", {"event_id": "crawl"}),
    ("/api/v1/school-life/generate-report-card/v2/",
     {"student_id": "crawl", "term_id": "crawl", "classroom_id": "crawl"}),
    ("/api/v1/school-life/generate-report-card/pdf/",
     {"student_id": "crawl", "term_id": "crawl", "classroom_id": "crawl"}),
    ("/api/v1/school-life/generate-certificate/pdf/", {"student_id": "crawl"}),
    ("/api/v1/communication/forums/", {}),
])
def test_malformed_body_is_422(path, body):
    tid = _tenant()
    resp = client.post(path, json=body, headers=_admin(tid))
    assert resp.status_code == 422, f"{path} -> {resp.status_code} {resp.text}"


def test_classroom_alias_with_another_schools_level_is_404_not_500():
    tenant_a, tenant_b = _tenant(), _tenant()
    level_b = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Level(id=level_b, tenant_id=tenant_b, name="6e"))
        db.commit()
    resp = client.post("/api/v1/classrooms/", json={"name": "6e A", "level_id": level_b}, headers=_admin(tenant_a))
    assert resp.status_code == 404, resp.text


@pytest.mark.skipif(not IS_POSTGRES, reason="DataError réel : PostgreSQL")
def test_unparseable_timestamp_reaching_postgres_is_422():
    tid = _tenant()
    resp = client.patch(f"/api/v1/audit/data-quality/{uuid.uuid4()}/",
                        json={"is_resolved": True, "resolved_at": "pas-une-date"}, headers=_admin(tid))
    assert resp.status_code == 422, resp.text
    assert resp.json()["error"] == "INVALID_DATA"


@pytest.mark.skipif(not IS_POSTGRES, reason="student_forums : table opérationnelle (PostgreSQL)")
def test_updating_an_unknown_forum_is_404():
    tid = _tenant()
    resp = client.patch(f"/api/v1/communication/forums/{uuid.uuid4()}/", json={"title": "Annonces"},
                        headers=_admin(tid))
    assert resp.status_code == 404, resp.text
