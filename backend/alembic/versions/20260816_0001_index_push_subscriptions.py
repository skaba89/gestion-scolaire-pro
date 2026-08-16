"""Add missing composite index on push_subscriptions(tenant_id, user_id) —
audit 2026-08-16 follow-up (round 2).

Same class of gap as 20260811_0001 (profiles.tenant_id): push_subscriptions
has neither TenantMixin's automatic index=True nor an explicit one on
tenant_id, despite RLS filtering on it on every query, and every real
lookup in the app (GET/POST /notifications/subscriptions/, the aliased
push-subscribe endpoint in aliases.py — see app/api/v1/endpoints/core/
notifications.py and app/api/v1/endpoints/aliases.py) filters by
user_id, with tenant_id enforced underneath by RLS. A composite index on
(tenant_id, user_id) covers both the RLS predicate and the app-level
filter in a single index, rather than two single-column indexes.

Revision ID: 20260816_0001
Revises: 20260815_0001
Create Date: 2026-08-16

Non-destructive: purely additive index, no existing data touched.
"""
from alembic import op
from sqlalchemy import text

revision = "20260816_0001"
down_revision = "20260815_0001"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_push_subscriptions_tenant_id_user_id"


def _index_exists(conn, index_name: str) -> bool:
    return bool(conn.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM pg_indexes"
            "  WHERE schemaname = 'public' AND indexname = :name"
            ")"
        ),
        {"name": index_name},
    ).scalar())


def upgrade():
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        # SQLite test DBs are built from the ORM metadata directly, not
        # via migrations — nothing to do here for that path.
        return
    if not _index_exists(conn, INDEX_NAME):
        op.create_index(
            op.f(INDEX_NAME), "push_subscriptions", ["tenant_id", "user_id"], unique=False,
        )


def downgrade():
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    if _index_exists(conn, INDEX_NAME):
        op.drop_index(op.f(INDEX_NAME), table_name="push_subscriptions")
