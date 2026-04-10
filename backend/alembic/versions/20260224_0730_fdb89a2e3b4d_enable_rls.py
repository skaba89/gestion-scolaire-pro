"""Enable Row Level Security (RLS) for multi-tenant isolation

Revision ID: fdb89a2e3b4d
Revises: c8da52ea7989
Create Date: 2026-02-24 07:30:00.000000

NOTE: RLS is a PostgreSQL-only feature. On SQLite, tenant isolation is
handled at the application layer, so this migration is a no-op.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fdb89a2e3b4d'
down_revision = 'c8da52ea7989'
branch_labels = None
depends_on = None

TABLES = [
    'academic_years',
    'audit_logs',
    'campuses',
    'grades',
    'levels',
    'notifications',
    'payments',
    'invoices',
    'account_deletion_requests',
    'rgpd_logs',
    'students',
    'subjects',
    'terms',
    'users',
    'user_roles',
    'push_subscriptions'
]

def upgrade() -> None:
    conn = op.get_bind()
    dialect_name = conn.dialect.name

    if dialect_name == "sqlite":
        # SQLite does not support Row Level Security.
        # Tenant isolation is enforced at the application layer.
        return

    # 1. Enable RLS on each table
    for table in TABLES:
        # Create policy: only rows matching the current session tenant_id are visible/modifiable
        # We use current_setting('app.current_tenant_id', true) which returns NULL if not set
        op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text(f"""
            CREATE POLICY {table}_tenant_isolation ON {table}
            USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
        """))
    
    # 2. Grant bypass for superadmins if needed or handled via role
    # For now, we enforce it for everyone using the app session.

def downgrade() -> None:
    conn = op.get_bind()
    dialect_name = conn.dialect.name

    if dialect_name == "sqlite":
        return

    for table in TABLES:
        op.execute(sa.text(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}"))
        op.execute(sa.text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
