"""POST /trusted-devices/ (aliases.py::register_trusted_device) —
institutional-readiness audit, 2026-09.

user_id used to come straight from the request body, falling back to the
caller only if absent — any authenticated user could pass an arbitrary
user_id and register their own device as a trusted (2FA-bypassing) device
for a victim account, with no ownership check at all. This is a
self-service endpoint: it must always register the device for the caller,
ignoring any user_id in the body.

trusted_devices is a raw-SQL operational table (DDL only in
app/core/operational_tables.py, Postgres-specific gen_random_uuid()/
TIMESTAMPTZ) never created in the SQLite test lifespan — same constraint
as test_alumni_ownership_authorization.py."""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="trusted_devices is a raw-SQL operational table whose DDL is "
           "Postgres-specific and never created on SQLite test runs.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)

BASE = "/api/v1/trusted-devices"


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
            id=tenant_id, name="École Appareils Test", slug=f"devices-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", is_active=True,
        ))
        db.commit()
    return user_id


class TestRegisterTrustedDeviceOwnership:
    def test_client_supplied_user_id_is_ignored_registers_for_caller(self):
        tenant_id = _make_tenant()
        caller_id = _make_user(tenant_id)
        victim_id = _make_user(tenant_id)
        headers = _as({"id": caller_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.post(BASE + "/", json={
            "user_id": victim_id, "device_name": "Attacker Phone",
            "device_fingerprint": "attacker-device-123",
        }, headers=headers)
        assert resp.status_code == 201, resp.text

        with SessionLocal() as db:
            from sqlalchemy import text
            rows = db.execute(text(
                "SELECT user_id FROM trusted_devices WHERE device_fingerprint = :fp"
            ), {"fp": "attacker-device-123"}).mappings().all()
        assert len(rows) == 1
        assert str(rows[0]["user_id"]) == caller_id
        assert str(rows[0]["user_id"]) != victim_id

    def test_self_registration_still_works(self):
        tenant_id = _make_tenant()
        caller_id = _make_user(tenant_id)
        headers = _as({"id": caller_id, "roles": ["TEACHER"], "tenant_id": tenant_id})

        resp = client.post(BASE + "/", json={
            "device_name": "Mon téléphone", "device_fingerprint": "own-device-456",
            "expires_at": "2099-01-01T00:00:00Z",
        }, headers=headers)
        assert resp.status_code == 201, resp.text

        listed = client.get(BASE + "/", headers=headers)
        assert any(d["device_fingerprint"] == "own-device-456" for d in listed.json())
