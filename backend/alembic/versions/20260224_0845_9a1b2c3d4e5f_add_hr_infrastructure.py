"""add_hr_infrastructure

Revision ID: 9a1b2c3d4e5f
Revises: 86f4b6d4e2a1
Create Date: 2026-02-24 08:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '9a1b2c3d4e5f'
down_revision = '86f4b6d4e2a1'
branch_labels = None
depends_on = None

HR_TABLES = [
    'employees',
    'employment_contracts',
    'leave_requests',
    'payslips'
]

def upgrade() -> None:
    # 1. Employees
    op.create_table('employees',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('employee_number', sa.String(length=50), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=False),
        sa.Column('last_name', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('job_title', sa.String(length=100), nullable=True),
        sa.Column('department', sa.String(length=100), nullable=True),
        sa.Column('hire_date', sa.Date(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('date_of_birth', sa.Date(), nullable=True),
        sa.Column('place_of_birth', sa.String(length=100), nullable=True),
        sa.Column('nationality', sa.String(length=100), nullable=True),
        sa.Column('social_security_number', sa.String(length=100), nullable=True),
        sa.Column('address', sa.String(length=255), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('postal_code', sa.String(length=20), nullable=True),
        sa.Column('country', sa.String(length=100), nullable=True),
        sa.Column('bank_name', sa.String(length=100), nullable=True),
        sa.Column('bank_iban', sa.String(length=100), nullable=True),
        sa.Column('bank_bic', sa.String(length=50), nullable=True),
        sa.Column('emergency_contact_name', sa.String(length=100), nullable=True),
        sa.Column('emergency_contact_phone', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_employees_tenant_id'), 'employees', ['tenant_id'], unique=False)

    # 2. Employment Contracts
    op.create_table('employment_contracts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('contract_number', sa.String(length=50), nullable=False),
        sa.Column('contract_type', sa.String(length=50), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('trial_period_end', sa.Date(), nullable=True),
        sa.Column('job_title', sa.String(length=100), nullable=False),
        sa.Column('gross_monthly_salary', sa.Float(), nullable=False),
        sa.Column('weekly_hours', sa.Float(), nullable=True),
        sa.Column('notes', sa.String(length=1000), nullable=True),
        sa.Column('is_current', sa.Boolean(), nullable=True),
        sa.Column('employee_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_employment_contracts_tenant_id'), 'employment_contracts', ['tenant_id'], unique=False)

    # 3. Leave Requests
    op.create_table('leave_requests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('leave_type', sa.String(length=50), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('total_days', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('reviewed_at', sa.Date(), nullable=True),
        sa.Column('employee_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_leave_requests_tenant_id'), 'leave_requests', ['tenant_id'], unique=False)

    # 4. Payslips
    op.create_table('payslips',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('period_month', sa.Integer(), nullable=False),
        sa.Column('period_year', sa.Integer(), nullable=False),
        sa.Column('gross_salary', sa.Float(), nullable=False),
        sa.Column('net_salary', sa.Float(), nullable=False),
        sa.Column('pay_date', sa.Date(), nullable=False),
        sa.Column('is_final', sa.String(length=50), nullable=True),
        sa.Column('pdf_url', sa.String(length=500), nullable=True),
        sa.Column('employee_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_payslips_tenant_id'), 'payslips', ['tenant_id'], unique=False)

    # 5. Enable RLS on new tables
    for table in HR_TABLES:
        op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text(f"""
            CREATE POLICY {table}_tenant_isolation ON {table}
            USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
        """))

def downgrade() -> None:
    for table in reversed(HR_TABLES):
        op.execute(sa.text(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}"))
        op.execute(sa.text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
        op.drop_table(table)
