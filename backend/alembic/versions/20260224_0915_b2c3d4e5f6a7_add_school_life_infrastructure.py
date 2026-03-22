"""add_school_life_infrastructure

Revision ID: b2c3d4e5f6a7
Revises: 9a1b2c3d4e5f
Create Date: 2026-02-24 09:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = '9a1b2c3d4e5f'
branch_labels = None
depends_on = None

SL_TABLES = [
    'assessments',
    'attendance',
    'school_events',
    'student_check_ins'
]

def upgrade() -> None:
    # 1. Assessments
    op.create_table('assessments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('max_score', sa.Float(), nullable=False),
        sa.Column('date', sa.DateTime(), nullable=False),
        sa.Column('assessment_type', sa.String(length=50), nullable=True),
        sa.Column('subject_id', sa.UUID(), nullable=False),
        sa.Column('academic_year_id', sa.UUID(), nullable=True),
        sa.Column('term_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['academic_year_id'], ['academic_years.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['term_id'], ['terms.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_assessments_tenant_id'), 'assessments', ['tenant_id'], unique=False)

    # 2. Attendance
    op.create_table('attendance',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('subject_id', sa.UUID(), nullable=True),
        sa.Column('classroom_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['classroom_id'], ['classes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_attendance_tenant_id'), 'attendance', ['tenant_id'], unique=False)

    # 3. School Events
    op.create_table('school_events',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('start_date', sa.DateTime(), nullable=False),
        sa.Column('end_date', sa.DateTime(), nullable=True),
        sa.Column('location', sa.String(length=255), nullable=True),
        sa.Column('is_all_day', sa.Boolean(), nullable=True),
        sa.Column('event_type', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_school_events_tenant_id'), 'school_events', ['tenant_id'], unique=False)

    # 4. Student Check-ins
    op.create_table('student_check_ins',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('checked_at', sa.DateTime(), nullable=False),
        sa.Column('direction', sa.String(length=20), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=True),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_student_check_ins_tenant_id'), 'student_check_ins', ['tenant_id'], unique=False)

    # 5. Refactor Grades Table
    # Drop old columns (careful with data if needed, but here it's a migration project)
    op.add_column('grades', sa.Column('assessment_id', sa.UUID(), nullable=True))
    op.add_column('grades', sa.Column('subject_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_grades_assessment', 'grades', 'assessments', ['assessment_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_grades_subject', 'grades', 'subjects', ['subject_id'], ['id'], ondelete='SET NULL')
    
    # Remove redundant columns from original Grade model if they are now in Assessment
    # Note: For now I'll keep them as nullable to avoid breaking any existing data until fully migrated
    op.alter_column('grades', 'subject', existing_type=sa.String(100), nullable=True)
    op.alter_column('grades', 'academic_year', existing_type=sa.String(20), nullable=True)

    # 6. Enable RLS on new tables
    for table in SL_TABLES:
        op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text(f"""
            CREATE POLICY {table}_tenant_isolation ON {table}
            USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
        """))

def downgrade() -> None:
    # Reverse grade refactor
    op.drop_constraint('fk_grades_subject', 'grades', type_='foreignkey')
    op.drop_constraint('fk_grades_assessment', 'grades', type_='foreignkey')
    op.drop_column('grades', 'subject_id')
    op.drop_column('grades', 'assessment_id')

    for table in reversed(SL_TABLES):
        op.execute(sa.text(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}"))
        op.execute(sa.text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
        op.drop_table(table)
