"""Add missing index on profiles.tenant_id — audit 2026-08 follow-up.

Every other tenant-scoped table (audit_logs, grades, invoices,
tenant_security_settings, rgpd_logs, ...) has an index on tenant_id, added
either via TenantMixin (index=True by construction) or explicitly. profiles
was the one exception — its tenant_id column has neither, despite RLS
policies filtering on it on every query against this table. Low-impact in
practice (profiles is a small one-row-per-user table, mostly looked up by
its PK/user id — see app/models/profile.py), but it's a real inconsistency
worth closing rather than leaving as an unexplained outlier.

Revision ID: 20260811_0001
Revises: 20260807_0001
Create Date: 2026-08-11

Non-destructive: purely additive index, no existing data touched.
"""
from alembic import op
from sqlalchemy import text

revision = "20260811_0001"
down_revision = "20260807_0001"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_profiles_tenant_id"


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
        op.create_index(op.f(INDEX_NAME), "profiles", ["tenant_id"], unique=False)


def downgrade():
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    if _index_exists(conn, INDEX_NAME):
        op.drop_index(op.f(INDEX_NAME), table_name="profiles")
