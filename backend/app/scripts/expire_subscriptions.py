"""Expire les abonnements SaaS dont la période payée est terminée.

Usage (quotidien via cron ou timer systemd) :
    cd backend
    python -m app.scripts.expire_subscriptions

En Docker :
    docker compose exec -T api python -m app.scripts.expire_subscriptions

Idempotent : un abonnement déjà expiré n'est jamais retraité.
"""
from __future__ import annotations

from app.core.database import SessionLocal
from app.services.subscription_maintenance import expire_overdue_subscriptions


def main() -> None:
    with SessionLocal() as db:
        summary = expire_overdue_subscriptions(db)
    print(
        f"Expired {summary['expired']} subscription(s)"
        + (f": {', '.join(summary['tenants'])}" if summary["tenants"] else "")
    )


if __name__ == "__main__":
    main()
