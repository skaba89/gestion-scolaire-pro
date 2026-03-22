"""add_academic_infrastructure_models

Revision ID: 86f4b6d4e2a1
Revises: fdb89a2e3b4d
Create Date: 2026-02-24 08:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '86f4b6d4e2a1'
down_revision = 'fdb89a2e3b4d'
branch_labels = None
depends_on = None

NEW_TABLES = [
    'departments',
    'rooms',
    'programs',
    'classes',
    'enrollments',
    'subject_levels',
    'subject_departments',
    'classroom_departments',
    'class_subjects'
]

def upgrade() -> None:
    # 1. Departments
    op.create_table('departments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=True),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('head_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['head_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_departments_tenant_id'), 'departments', ['tenant_id'], unique=False)

    # 2. Rooms
    op.create_table('rooms',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('capacity', sa.Integer(), nullable=True),
        sa.Column('campus_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['campus_id'], ['campuses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_rooms_tenant_id'), 'rooms', ['tenant_id'], unique=False)

    # 3. Programs
    op.create_table('programs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=True),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_programs_tenant_id'), 'programs', ['tenant_id'], unique=False)

    # 4. Classes
    op.create_table('classes',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('capacity', sa.Integer(), nullable=True),
        sa.Column('level_id', sa.UUID(), nullable=True),
        sa.Column('campus_id', sa.UUID(), nullable=True),
        sa.Column('program_id', sa.UUID(), nullable=True),
        sa.Column('academic_year_id', sa.UUID(), nullable=True),
        sa.Column('main_room_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['academic_year_id'], ['academic_years.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['campus_id'], ['campuses.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['level_id'], ['levels.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['main_room_id'], ['rooms.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['program_id'], ['programs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_classes_tenant_id'), 'classes', ['tenant_id'], unique=False)

    # 5. Enrollments
    op.create_table('enrollments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('class_id', sa.UUID(), nullable=False),
        sa.Column('academic_year_id', sa.UUID(), nullable=False),
        sa.Column('enrollment_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['academic_year_id'], ['academic_years.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['class_id'], ['classes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_enrollments_tenant_id'), 'enrollments', ['tenant_id'], unique=False)

    # 6. subject_levels (Join table)
    op.create_table('subject_levels',
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('subject_id', sa.UUID(), nullable=False),
        sa.Column('level_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['level_id'], ['levels.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('subject_id', 'level_id'),
        sa.UniqueConstraint('subject_id', 'level_id', name='uix_subject_level')
    )
    op.create_index(op.f('ix_subject_levels_tenant_id'), 'subject_levels', ['tenant_id'], unique=False)

    # 7. subject_departments (Join table)
    op.create_table('subject_departments',
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('subject_id', sa.UUID(), nullable=False),
        sa.Column('department_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('subject_id', 'department_id'),
        sa.UniqueConstraint('subject_id', 'department_id', name='uix_subject_department')
    )
    op.create_index(op.f('ix_subject_departments_tenant_id'), 'subject_departments', ['tenant_id'], unique=False)

    # 8. classroom_departments (Join table)
    op.create_table('classroom_departments',
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('class_id', sa.UUID(), nullable=False),
        sa.Column('department_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['class_id'], ['classes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('class_id', 'department_id'),
        sa.UniqueConstraint('class_id', 'department_id', name='uix_classroom_department')
    )
    op.create_index(op.f('ix_classroom_departments_tenant_id'), 'classroom_departments', ['tenant_id'], unique=False)

    # 9. class_subjects (Join table with extra fields)
    op.create_table('class_subjects',
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('class_id', sa.UUID(), nullable=False),
        sa.Column('subject_id', sa.UUID(), nullable=False),
        sa.Column('academic_year_id', sa.UUID(), nullable=True),
        sa.Column('is_optional', sa.Boolean(), nullable=True),
        sa.Column('coefficient', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['academic_year_id'], ['academic_years.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['class_id'], ['classes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('class_id', 'subject_id'),
        sa.UniqueConstraint('class_id', 'subject_id', name='uix_class_subject')
    )
    op.create_index(op.f('ix_class_subjects_tenant_id'), 'class_subjects', ['tenant_id'], unique=False)

    # 10. Enable RLS on new tables
    for table in NEW_TABLES:
        op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text(f"""
            CREATE POLICY {table}_tenant_isolation ON {table}
            USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
        """))

def downgrade() -> None:
    for table in reversed(NEW_TABLES):
        op.execute(sa.text(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}"))
        op.execute(sa.text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
        op.drop_table(table)
