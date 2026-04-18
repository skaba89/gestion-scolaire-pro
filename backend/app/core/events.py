"""
SchoolFlow Pro — Domain Event Bus
==================================
Lightweight in-process pub/sub for domain events.

Webhooks, audit logs, and real-time notifications all subscribe to
these events. For multi-worker deployments, swap the in-process bus
for a Redis pub/sub or a message queue (NATS, RabbitMQ).

Usage::

    from app.core.events import publish_sync, DomainEvent, EventType

    # In a sync FastAPI endpoint:
    publish_sync(DomainEvent(
        event_type=EventType.STUDENT_CREATED,
        tenant_id=tenant_id,
        actor_id=current_user["id"],
        resource_type="student",
        resource_id=str(new_student.id),
        data={"name": new_student.full_name},
    ))
"""
import asyncio
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


# ─── Event Types ──────────────────────────────────────────────────────────────

class EventType(str, Enum):
    # ── Student lifecycle ──────────────────────────────────────────────────
    STUDENT_CREATED = "student.created"
    STUDENT_UPDATED = "student.updated"
    STUDENT_DELETED = "student.deleted"
    STUDENT_ENROLLED = "student.enrolled"
    STUDENT_GRADUATED = "student.graduated"

    # ── Grade events ───────────────────────────────────────────────────────
    GRADE_CREATED = "grade.created"
    GRADE_UPDATED = "grade.updated"
    GRADE_BULK_CREATED = "grade.bulk_created"
    GRADE_PUBLISHED = "grade.published"

    # ── Attendance ─────────────────────────────────────────────────────────
    ATTENDANCE_RECORDED = "attendance.recorded"
    ATTENDANCE_BULK_RECORDED = "attendance.bulk_recorded"
    ATTENDANCE_ABSENCE_ALERT = "attendance.absence_alert"

    # ── Payment events ─────────────────────────────────────────────────────
    PAYMENT_RECEIVED = "payment.received"
    PAYMENT_OVERDUE = "payment.overdue"
    PAYMENT_FAILED = "payment.failed"
    INVOICE_CREATED = "invoice.created"
    INVOICE_PAID = "invoice.paid"

    # ── User events ────────────────────────────────────────────────────────
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_LOGIN = "user.login"
    USER_LOGOUT = "user.logout"
    USER_PASSWORD_CHANGED = "user.password_changed"
    USER_DEACTIVATED = "user.deactivated"

    # ── Tenant lifecycle ───────────────────────────────────────────────────
    TENANT_CREATED = "tenant.created"
    TENANT_SETTINGS_UPDATED = "tenant.settings_updated"
    TENANT_PLAN_CHANGED = "tenant.plan_changed"
    TENANT_SUSPENDED = "tenant.suspended"

    # ── Academic calendar ──────────────────────────────────────────────────
    ACADEMIC_YEAR_STARTED = "academic_year.started"
    ACADEMIC_YEAR_ENDED = "academic_year.ended"
    TERM_STARTED = "term.started"
    TERM_ENDED = "term.ended"
    ENROLLMENT_CREATED = "enrollment.created"

    # ── Admissions ─────────────────────────────────────────────────────────
    ADMISSION_SUBMITTED = "admission.submitted"
    ADMISSION_ACCEPTED = "admission.accepted"
    ADMISSION_REJECTED = "admission.rejected"

    # ── Homework ───────────────────────────────────────────────────────────
    HOMEWORK_ASSIGNED = "homework.assigned"
    HOMEWORK_SUBMITTED = "homework.submitted"

    # ── Communication ──────────────────────────────────────────────────────
    MESSAGE_SENT = "message.sent"
    ANNOUNCEMENT_PUBLISHED = "announcement.published"
    NOTIFICATION_SENT = "notification.sent"


# ─── Domain Event ─────────────────────────────────────────────────────────────

class DomainEvent:
    """Represents a domain event with full metadata.

    Every event carries: type, tenant context, actor (who triggered it),
    resource (what was affected), and optional payload data.
    """

    __slots__ = (
        "event_type", "tenant_id", "actor_id", "resource_type",
        "resource_id", "data", "timestamp", "version",
    )

    def __init__(
        self,
        event_type: EventType,
        tenant_id: Optional[str],
        actor_id: Optional[str],
        resource_type: str,
        resource_id: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None,
    ):
        self.event_type = event_type
        self.tenant_id = tenant_id
        self.actor_id = actor_id
        self.resource_type = resource_type
        self.resource_id = resource_id
        self.data = data or {}
        self.timestamp = datetime.now(timezone.utc).isoformat()
        self.version = "1.0"

    def to_dict(self) -> dict:
        return {
            "event": self.event_type.value,
            "version": self.version,
            "timestamp": self.timestamp,
            "tenant_id": self.tenant_id,
            "actor_id": self.actor_id,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "data": self.data,
        }

    def __repr__(self) -> str:
        return (
            f"<DomainEvent type={self.event_type.value!r} "
            f"tenant={self.tenant_id!r} resource={self.resource_type}/{self.resource_id!r}>"
        )


# ─── Event Bus ────────────────────────────────────────────────────────────────

# Registry: event_type.value → list of handlers
_handlers: Dict[str, List[Callable]] = {}


def subscribe(event_type: EventType, handler: Callable) -> None:
    """Register a handler for an event type.

    The handler receives a single ``DomainEvent`` argument.
    Both sync and async handlers are supported.
    """
    key = event_type.value
    if key not in _handlers:
        _handlers[key] = []
    _handlers[key].append(handler)
    logger.debug("Subscribed %s to %s", handler.__name__, key)


def subscribe_all(handler: Callable) -> None:
    """Register a handler for ALL event types (e.g. audit logger)."""
    for event_type in EventType:
        subscribe(event_type, handler)


async def publish(event: DomainEvent) -> None:
    """Publish an event and await all registered async/sync handlers."""
    key = event.event_type.value
    handlers = _handlers.get(key, [])

    if not handlers:
        return

    logger.debug("Publishing %s to %d handlers", key, len(handlers))
    for handler in handlers:
        try:
            if asyncio.iscoroutinefunction(handler):
                await handler(event)
            else:
                handler(event)
        except Exception as exc:
            # Never let a handler failure break the main request flow
            logger.error(
                "Event handler %s failed for event %s: %s",
                handler.__name__, key, exc,
            )


def publish_sync(event: DomainEvent) -> None:
    """Fire-and-forget publish safe to call from synchronous endpoints.

    - If a running event loop exists, schedules the event as a background task.
    - Otherwise, runs sync-only handlers directly.
    """
    key = event.event_type.value
    handlers = _handlers.get(key, [])
    if not handlers:
        return

    try:
        loop = asyncio.get_running_loop()
        # Schedule on the running loop — non-blocking
        loop.create_task(publish(event))
    except RuntimeError:
        # No running loop (test environment or startup code)
        for handler in handlers:
            if not asyncio.iscoroutinefunction(handler):
                try:
                    handler(event)
                except Exception as exc:
                    logger.error(
                        "Sync handler %s failed for %s: %s",
                        handler.__name__, key, exc,
                    )
