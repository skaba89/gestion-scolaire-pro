"""enforce rls on all tables

Revision ID: 659b47b029bd
Revises: d44deb7473be
Create Date: 2026-02-27 23:09:31.312812

NOTE: RLS is a PostgreSQL-only feature. On SQLite, tenant isolation is
handled at the application layer, so this migration is a no-op.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '659b47b029bd'
down_revision = 'd44deb7473be'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect_name = conn.dialect.name

    if dialect_name == "sqlite":
        # SQLite does not support Row Level Security.
        # Tenant isolation is enforced at the application layer.
        return

    tables = conn.execute(sa.text("""
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'tenant_id' 
          AND table_schema = 'public'
    """)).fetchall()

    for (table_name,) in tables:
        # Avoid creating policy on 'tenants' table itself if it surprisingly has tenant_id
        if table_name == 'tenants':
            continue
            
        op.execute(sa.text(f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text(f"DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name}"))
        op.execute(sa.text(f"DROP POLICY IF EXISTS tenant_isolation_policy ON {table_name}"))
        
        op.execute(sa.text(f"""
            CREATE POLICY {table_name}_tenant_isolation ON {table_name}
            AS PERMISSIVE FOR ALL
            USING (
                tenant_id = (current_setting('app.current_tenant_id', true))::uuid
            )
            WITH CHECK (
                tenant_id = (current_setting('app.current_tenant_id', true))::uuid
            )
        """))
        
        # Ensure that the table owner (or postgres user) bypasses RLS if absolutely needed
        op.execute(sa.text(f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY"))

def downgrade() -> None:
    conn = op.get_bind()
    dialect_name = conn.dialect.name

    if dialect_name == "sqlite":
        return

    tables = conn.execute(sa.text("""
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'tenant_id' 
          AND table_schema = 'public'
    """)).fetchall()

    for (table_name,) in tables:
        if table_name == 'tenants':
            continue
        op.execute(sa.text(f"DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name}"))
        op.execute(sa.text(f"ALTER TABLE {table_name} DISABLE ROW LEVEL SECURITY"))
