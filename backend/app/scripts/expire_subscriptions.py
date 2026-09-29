"""Expire les abonnements SaaS dont la période payée est terminée.

Usage (quotidien via cron ou timer systemd) :
    cd backend
    python -m app.scripts.expire_subscriptions

En Docker :
    docker compose exec -T api python -m app.scripts.expire_subscriptions

Idempotent : un abonnement déjà expiré n'est jamais retraité.
"""
from __future__ import annotations

from app.core.database import platform_db_session
from app.services.subscription_maintenance import expire_overdue_subscriptions


def main() -> None:
    # Platform-scoped by nature (sweeps every tenant's subscriptions) - see
    # docs/POSTGRES_APP_ROLE.md and expire_overdue_subscriptions()'s own
    # docstring for why it positions the RLS context itself, per tenant.
    with platform_db_session() as db:
        summary = expire_overdue_subscriptions(db)
    print(
        f"Expired {summary['expired']} subscription(s)"
        + (f": {', '.join(summary['tenants'])}" if summary["tenants"] else "")
    )


if __name__ == "__main__":
    main()
