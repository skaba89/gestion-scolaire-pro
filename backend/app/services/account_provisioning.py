"""Secure delivery of one-time password setup links."""
from __future__ import annotations

import asyncio
import logging
import secrets
from dataclasses import dataclass

from app.core.cache import redis_client
from app.core.config import settings
from app.services.notifications import EmailSender, Templates


logger = logging.getLogger(__name__)


class PasswordSetupDeliveryError(RuntimeError):
    """Raised when a one-time setup link cannot be stored or delivered."""


@dataclass(frozen=True)
class PasswordSetupDelivery:
    token: str
    expires_in: int


def _sender() -> EmailSender:
    return EmailSender(
        resend_api_key=settings.RESEND_API_KEY,
        smtp_host=settings.SMTP_HOST,
        smtp_port=settings.SMTP_PORT,
        smtp_user=settings.SMTP_USER,
        smtp_pass=settings.SMTP_PASS,
        from_email=settings.FROM_EMAIL,
        from_name=settings.FROM_NAME,
    )


async def delete_password_setup_token(token: str) -> None:
    try:
        await redis_client.delete(f"pw_reset:{token}")
    except Exception as exc:
        logger.warning("Unable to delete password setup token: %s", exc)


async def get_password_setup_user_id(token: str) -> str | None:
    try:
        return await redis_client.get(f"pw_reset:{token}")
    except Exception as exc:
        logger.error("Redis unavailable during password setup validation: %s", exc)
        raise PasswordSetupDeliveryError("Password setup storage is unavailable") from exc


async def consume_password_setup_token(token: str) -> str | None:
    """Atomically read and delete a token so concurrent replays cannot succeed."""
    try:
        client = await redis_client.client
        return await client.getdel(f"sfp:pw_reset:{token}")
    except Exception as exc:
        logger.error("Redis unavailable while consuming a password setup token: %s", exc)
        raise PasswordSetupDeliveryError("Password setup storage is unavailable") from exc


async def deliver_password_setup_link(
    *,
    user_id: str,
    email: str,
    user_name: str,
    purpose: str,
    expires_in: int = 900,
) -> PasswordSetupDelivery:
    """Store a single-use token and deliver it without exposing a password."""
    token = secrets.token_urlsafe(32)
    try:
        stored = await redis_client.set(
            f"pw_reset:{token}",
            str(user_id),
            expire=expires_in,
        )
    except Exception as exc:
        logger.error("Redis unavailable while issuing a password setup link: %s", exc)
        raise PasswordSetupDeliveryError("Password setup storage is unavailable") from exc
    if not stored:
        raise PasswordSetupDeliveryError("Password setup token was not stored")

    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    expires_minutes = max(1, expires_in // 60)
    if purpose == "invitation":
        message = Templates.account_invitation(
            user_name=user_name,
            setup_url=reset_url,
            school_name=settings.FROM_NAME,
            expires_minutes=expires_minutes,
        )
    else:
        message = Templates.password_reset(
            user_name=user_name,
            reset_url=reset_url,
            school_name=settings.FROM_NAME,
            expires_minutes=expires_minutes,
        )

    try:
        sent = await asyncio.to_thread(
            _sender().send,
            email,
            message["subject"],
            message["html"],
            message["text"],
        )
    except Exception as exc:
        await delete_password_setup_token(token)
        logger.error("Password setup email delivery raised an error: %s", exc)
        raise PasswordSetupDeliveryError("Password setup email was not delivered") from exc
    if not sent:
        await delete_password_setup_token(token)
        raise PasswordSetupDeliveryError("Password setup email was not delivered")

    return PasswordSetupDelivery(token=token, expires_in=expires_in)
