"""Account invitation and password lifecycle regression tests."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest
from fastapi import HTTPException
from starlette.requests import Request


@pytest.mark.asyncio
async def test_password_setup_link_is_stored_and_emailed():
    from app.services.account_provisioning import deliver_password_setup_link

    sender = MagicMock()
    sender.send.return_value = True
    with (
        patch("app.services.account_provisioning.redis_client.set", new=AsyncMock(return_value=True)) as store,
        patch("app.services.account_provisioning._sender", return_value=sender),
    ):
        delivery = await deliver_password_setup_link(
            user_id="user-123",
            email="user@example.gn",
            user_name="Mamadou Diallo",
            purpose="invitation",
            expires_in=86400,
        )

    assert delivery.expires_in == 86400
    store.assert_awaited_once()
    assert store.await_args.kwargs["expire"] == 86400
    assert store.await_args.args[0].startswith("pw_reset:")
    assert "reset-password?token=" in sender.send.call_args.args[3]


@pytest.mark.asyncio
async def test_failed_email_revokes_setup_token():
    from app.services.account_provisioning import (
        PasswordSetupDeliveryError,
        deliver_password_setup_link,
    )

    sender = MagicMock()
    sender.send.return_value = False
    with (
        patch("app.services.account_provisioning.redis_client.set", new=AsyncMock(return_value=True)),
        patch("app.services.account_provisioning.redis_client.delete", new=AsyncMock()) as delete,
        patch("app.services.account_provisioning._sender", return_value=sender),
    ):
        with pytest.raises(PasswordSetupDeliveryError):
            await deliver_password_setup_link(
                user_id="user-123",
                email="user@example.gn",
                user_name="Mamadou Diallo",
                purpose="reset",
            )

    delete.assert_awaited_once()


@pytest.mark.asyncio
async def test_email_transport_exception_revokes_setup_token():
    from app.services.account_provisioning import (
        PasswordSetupDeliveryError,
        deliver_password_setup_link,
    )

    sender = MagicMock()
    sender.send.side_effect = OSError("mail transport unavailable")
    with (
        patch("app.services.account_provisioning.redis_client.set", new=AsyncMock(return_value=True)),
        patch("app.services.account_provisioning.redis_client.delete", new=AsyncMock()) as delete,
        patch("app.services.account_provisioning._sender", return_value=sender),
    ):
        with pytest.raises(PasswordSetupDeliveryError):
            await deliver_password_setup_link(
                user_id="user-123",
                email="user@example.gn",
                user_name="Mamadou Diallo",
                purpose="reset",
            )

    delete.assert_awaited_once()


@pytest.mark.asyncio
async def test_password_setup_token_is_consumed_atomically():
    from app.services.account_provisioning import consume_password_setup_token

    client = AsyncMock()
    client.getdel.return_value = "user-123"

    class RedisStub:
        @property
        async def client(self):
            return client

    with patch("app.services.account_provisioning.redis_client", RedisStub()):
        user_id = await consume_password_setup_token("single-use-token")

    assert user_id == "user-123"
    client.getdel.assert_awaited_once_with("sfp:pw_reset:single-use-token")


@pytest.mark.asyncio
async def test_user_creation_commits_only_after_invitation_delivery():
    from app.api.v1.endpoints.core.users import UserCreate, create_user
    from app.models import User
    from app.services.account_provisioning import PasswordSetupDelivery

    account_id = uuid.uuid4()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    def assign_account_id():
        account = next(call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], User))
        account.id = account_id

    db.flush.side_effect = assign_account_id
    with (
        patch("app.core.security.get_password_hash", return_value="hashed-random-secret"),
        patch(
            "app.services.account_provisioning.deliver_password_setup_link",
            new=AsyncMock(return_value=PasswordSetupDelivery("token", 86400)),
        ) as deliver,
    ):
        result = await create_user(
            body=UserCreate(
                email="TEACHER@example.gn",
                first_name="Mamadou",
                last_name="Diallo",
                roles=["TEACHER"],
            ),
            db=db,
            current_user={
                "id": str(uuid.uuid4()),
                "tenant_id": str(uuid.uuid4()),
                "roles": ["TENANT_ADMIN"],
            },
        )

    account = next(call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], User))
    assert account.email == "teacher@example.gn"
    assert account.must_change_password is True
    assert result["invitation_sent"] is True
    deliver.assert_awaited_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_user_creation_rolls_back_when_invitation_fails():
    from app.api.v1.endpoints.core.users import UserCreate, create_user
    from app.models import User
    from app.services.account_provisioning import PasswordSetupDeliveryError

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    def assign_account_id():
        account = next(call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], User))
        account.id = uuid.uuid4()

    db.flush.side_effect = assign_account_id
    with (
        patch("app.core.security.get_password_hash", return_value="hashed-random-secret"),
        patch(
            "app.services.account_provisioning.deliver_password_setup_link",
            new=AsyncMock(side_effect=PasswordSetupDeliveryError("email unavailable")),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await create_user(
                body=UserCreate(
                    email="teacher@example.gn",
                    first_name="Mamadou",
                    last_name="Diallo",
                    roles=["TEACHER"],
                ),
                db=db,
                current_user={
                    "id": str(uuid.uuid4()),
                    "tenant_id": str(uuid.uuid4()),
                    "roles": ["TENANT_ADMIN"],
                },
            )

    assert exc_info.value.status_code == 503
    db.rollback.assert_called_once()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_admin_reset_rolls_back_when_email_delivery_fails():
    from app.api.v1.endpoints.core.users import reset_user_password
    from app.services.account_provisioning import PasswordSetupDeliveryError

    user_id = str(uuid.uuid4())
    db = MagicMock()
    db.execute.return_value.fetchone.return_value = SimpleNamespace(
        id=user_id,
        email="teacher@example.gn",
        first_name="Mamadou",
        last_name="Diallo",
    )
    with (
        patch("app.core.security.get_password_hash", return_value="invalidated-hash"),
        patch(
            "app.services.account_provisioning.deliver_password_setup_link",
            new=AsyncMock(side_effect=PasswordSetupDeliveryError("email unavailable")),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await reset_user_password(
                user_id=user_id,
                db=db,
                current_user={"id": str(uuid.uuid4()), "tenant_id": str(uuid.uuid4())},
            )

    assert exc_info.value.status_code == 503
    db.rollback.assert_called_once()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_reset_token_clears_forced_password_flag():
    from app.api.v1.endpoints.core.auth import ResetPasswordRequest, reset_password

    user_id = str(uuid.uuid4())
    user = SimpleNamespace(
        id=user_id,
        is_active=True,
        password_hash=None,
        must_change_password=True,
        updated_at=None,
    )
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user
    client = AsyncMock()
    client.get.return_value = None

    class RedisStub:
        @property
        async def client(self):
            return client

    with (
        patch("app.core.cache.redis_client", RedisStub()),
        patch(
            "app.services.account_provisioning.get_password_setup_user_id",
            new=AsyncMock(return_value=user_id),
        ),
        patch(
            "app.services.account_provisioning.consume_password_setup_token",
            new=AsyncMock(return_value=user_id),
        ) as consume,
        patch("app.core.security.get_password_hash", return_value="new-hash"),
        patch(
            "app.api.v1.endpoints.core.auth.blacklist_all_user_tokens",
            new=AsyncMock(),
        ),
    ):
        result = await reset_password(
            request=Request({
                "type": "http",
                "method": "POST",
                "path": "/api/v1/auth/reset-password/",
                "headers": [],
                "client": ("testclient", 50000),
            }),
            body=ResetPasswordRequest(token="single-use-token", new_password="Strong@Password2026"),
            db=db,
        )

    assert user.password_hash == "new-hash"
    assert user.must_change_password is False
    db.commit.assert_called_once()
    consume.assert_awaited_once_with("single-use-token")
    assert "succès" in result["message"]
