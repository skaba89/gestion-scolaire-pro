"""app/core/idempotency.py — backend idempotency for the offline queue
(Phase 5, WhatsApp/offline hardening brief). Unit-level tests against the
helpers directly (get_idempotent_response_or_lock / store_idempotent_response),
independent of any specific endpoint — see test_whatsapp_reply.py and
test_communication_whatsapp_tracking.py-adjacent suites for endpoint-level
wiring checks on the /attendance/ and /communication/ routes.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from conftest import get_test_client

get_test_client()  # triggers Base.metadata.create_all(), incl. idempotency_keys

from app.core.database import SessionLocal  # noqa: E402
from app.core.idempotency import get_idempotent_response_or_lock, store_idempotent_response
from app.core.security import get_password_hash
from app.models.idempotency_key import IdempotencyKey
from app.models.tenant import Tenant
from app.models.user import User


def _make_tenant_and_user() -> tuple[str, str]:
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    email = f"idem.{uuid.uuid4().hex[:6]}@example.gn"
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Idem Test", slug=f"idem-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=email, username=email,
            first_name="Fatoumata", last_name="Sow",
            password_hash=get_password_hash("x"), is_active=True, is_verified=True,
        ))
        db.commit()
    return tenant_id, user_id


class TestIdempotency:
    def test_no_key_is_a_pure_no_op(self):
        tenant_id, user_id = _make_tenant_and_user()
        with SessionLocal() as db:
            cached = get_idempotent_response_or_lock(
                db, tenant_id=tenant_id, user_id=user_id, key="", method="POST",
                endpoint="/attendance/", request_body={"status": "PRESENT"},
            )
            assert cached is None

    def test_new_key_returns_none_then_second_lookup_returns_stored_response(self):
        tenant_id, user_id = _make_tenant_and_user()
        key = f"key-{uuid.uuid4().hex}"
        body = {"student_id": "s1", "status": "PRESENT"}
        with SessionLocal() as db:
            first = get_idempotent_response_or_lock(
                db, tenant_id=tenant_id, user_id=user_id, key=key, method="POST",
                endpoint="/attendance/", request_body=body,
            )
            assert first is None

            store_idempotent_response(
                db, tenant_id=tenant_id, user_id=user_id, key=key, method="POST",
                endpoint="/attendance/", request_body=body,
                response_body={"id": "att-1", "status": "PRESENT"}, status_code=201,
            )

        with SessionLocal() as db:
            second = get_idempotent_response_or_lock(
                db, tenant_id=tenant_id, user_id=user_id, key=key, method="POST",
                endpoint="/attendance/", request_body=body,
            )
            assert second is not None
            response_body, status_code = second
            assert status_code == 201
            assert response_body == {"id": "att-1", "status": "PRESENT"}

    def test_same_key_different_body_raises_409(self):
        tenant_id, user_id = _make_tenant_and_user()
        key = f"key-{uuid.uuid4().hex}"
        with SessionLocal() as db:
            store_idempotent_response(
                db, tenant_id=tenant_id, user_id=user_id, key=key, method="POST",
                endpoint="/attendance/", request_body={"status": "PRESENT"},
                response_body={"id": "att-1"}, status_code=201,
            )

        with SessionLocal() as db:
            with pytest.raises(HTTPException) as exc_info:
                get_idempotent_response_or_lock(
                    db, tenant_id=tenant_id, user_id=user_id, key=key, method="POST",
                    endpoint="/attendance/", request_body={"status": "ABSENT"},
                )
            assert exc_info.value.status_code == 409

    def test_different_tenant_same_key_does_not_collide(self):
        tenant_a, user_a = _make_tenant_and_user()
        tenant_b, user_b = _make_tenant_and_user()
        key = f"shared-key-{uuid.uuid4().hex}"
        body = {"status": "PRESENT"}
        with SessionLocal() as db:
            store_idempotent_response(
                db, tenant_id=tenant_a, user_id=user_a, key=key, method="POST",
                endpoint="/attendance/", request_body=body,
                response_body={"id": "att-a"}, status_code=201,
            )

        with SessionLocal() as db:
            cached_for_b = get_idempotent_response_or_lock(
                db, tenant_id=tenant_b, user_id=user_b, key=key, method="POST",
                endpoint="/attendance/", request_body=body,
            )
            assert cached_for_b is None

    def test_different_user_same_tenant_same_key_does_not_collide(self):
        tenant_id, user_a = _make_tenant_and_user()
        _, user_b = _make_tenant_and_user()
        key = f"shared-key-{uuid.uuid4().hex}"
        body = {"status": "PRESENT"}
        with SessionLocal() as db:
            store_idempotent_response(
                db, tenant_id=tenant_id, user_id=user_a, key=key, method="POST",
                endpoint="/attendance/", request_body=body,
                response_body={"id": "att-a"}, status_code=201,
            )

        with SessionLocal() as db:
            cached_for_b = get_idempotent_response_or_lock(
                db, tenant_id=tenant_id, user_id=user_b, key=key, method="POST",
                endpoint="/attendance/", request_body=body,
            )
            assert cached_for_b is None

    def test_storing_twice_for_same_key_keeps_first_response(self):
        """A concurrent double-store (e.g. two retries racing) must never
        overwrite the first recorded response — the first writer wins."""
        tenant_id, user_id = _make_tenant_and_user()
        key = f"key-{uuid.uuid4().hex}"
        body = {"status": "PRESENT"}
        with SessionLocal() as db:
            store_idempotent_response(
                db, tenant_id=tenant_id, user_id=user_id, key=key, method="POST",
                endpoint="/attendance/", request_body=body,
                response_body={"id": "first"}, status_code=201,
            )
            store_idempotent_response(
                db, tenant_id=tenant_id, user_id=user_id, key=key, method="POST",
                endpoint="/attendance/", request_body=body,
                response_body={"id": "second"}, status_code=201,
            )

        with SessionLocal() as db:
            cached = get_idempotent_response_or_lock(
                db, tenant_id=tenant_id, user_id=user_id, key=key, method="POST",
                endpoint="/attendance/", request_body=body,
            )
            assert cached[0] == {"id": "first"}


class TestConcurrentInsertProtection:
    """Fine points brief, Phase 3: the app-level SELECT-then-INSERT in
    store_idempotent_response() is only half the story — a true race (two
    requests both passing the SELECT before either commits) is closed at
    the DB level by the unique index on (tenant_id, user_id, key)
    (ux_idempotency_keys_tenant_user_key, see
    alembic/versions/20260804_0002_idempotency_keys.py). This test bypasses
    the app-level check entirely and inserts two rows directly, to prove
    the constraint itself — not just the Python guard — makes a duplicate
    impossible."""

    def test_double_insert_concurrent_same_key_impossible(self):
        tenant_id, user_id = _make_tenant_and_user()
        key = f"race-key-{uuid.uuid4().hex}"
        now = datetime.now(timezone.utc)

        with SessionLocal() as db:
            db.add(IdempotencyKey(
                key=key, tenant_id=tenant_id, user_id=user_id, method="POST",
                endpoint="/attendance/", request_hash="a" * 64,
                response_json="{}", status_code=201,
                expires_at=now + timedelta(hours=1),
            ))
            db.commit()

        with SessionLocal() as db:
            db.add(IdempotencyKey(
                key=key, tenant_id=tenant_id, user_id=user_id, method="POST",
                endpoint="/attendance/", request_hash="b" * 64,
                response_json="{}", status_code=201,
                expires_at=now + timedelta(hours=1),
            ))
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()

        with SessionLocal() as db:
            count = (
                db.query(IdempotencyKey)
                .filter(IdempotencyKey.tenant_id == tenant_id, IdempotencyKey.key == key)
                .count()
            )
            assert count == 1


class TestPurgeExpiredIdempotencyKeys:
    """Fine points brief, Phase 3: the purge job
    (app.workers.tasks.purge_expired_idempotency_keys) must delete only
    rows past their expires_at, leaving still-valid keys untouched — a
    retry that legitimately arrives just before expiry must still be
    served the stored response, not silently redo the work."""

    def test_expired_keys_purge(self):
        import asyncio

        from app.workers.tasks import purge_expired_idempotency_keys

        tenant_id, user_id = _make_tenant_and_user()
        expired_key = f"expired-{uuid.uuid4().hex}"
        live_key = f"live-{uuid.uuid4().hex}"
        now = datetime.now(timezone.utc)

        with SessionLocal() as db:
            db.add(IdempotencyKey(
                key=expired_key, tenant_id=tenant_id, user_id=user_id, method="POST",
                endpoint="/attendance/", request_hash="a" * 64,
                response_json="{}", status_code=201,
                expires_at=now - timedelta(hours=1),  # already expired
            ))
            db.add(IdempotencyKey(
                key=live_key, tenant_id=tenant_id, user_id=user_id, method="POST",
                endpoint="/attendance/", request_hash="b" * 64,
                response_json="{}", status_code=201,
                expires_at=now + timedelta(hours=1),  # still valid
            ))
            db.commit()

        result = asyncio.run(purge_expired_idempotency_keys({}))
        assert result["deleted"] >= 1

        with SessionLocal() as db:
            remaining_keys = {
                row.key for row in
                db.query(IdempotencyKey).filter(IdempotencyKey.tenant_id == tenant_id).all()
            }
            assert expired_key not in remaining_keys
            assert live_key in remaining_keys
