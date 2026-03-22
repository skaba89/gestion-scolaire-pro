"""add_parents_infrastructure

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-02-24 09:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # 1. Parent-Student association table
    op.create_table('parent_students',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('parent_id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('is_primary', sa.Boolean(), nullable=True),
        sa.Column('relationship', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['parent_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('parent_id', 'student_id', name='uix_parent_student')
    )
    op.create_index(op.f('ix_parent_students_tenant_id'), 'parent_students', ['tenant_id'], unique=False)

    # 2. Enable RLS
    op.execute(sa.text("ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY"))
    op.execute(sa.text("""
        CREATE POLICY parent_students_tenant_isolation ON parent_students
        USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
        WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
    """))

def downgrade() -> None:
    op.execute(sa.text("DROP POLICY IF EXISTS parent_students_tenant_isolation ON parent_students"))
    op.execute(sa.text("ALTER TABLE parent_students DISABLE ROW LEVEL SECURITY"))
    op.drop_table('parent_students')
