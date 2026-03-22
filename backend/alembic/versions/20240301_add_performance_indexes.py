"""Add performance indexes on high-traffic columns.

Revision ID: add_perf_indexes_001
Revises: 659b47b029bd
Create Date: 2024-03-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "add_perf_indexes_001"
down_revision: Union[str, None] = "659b47b029bd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Students
    op.create_index("ix_students_tenant_id", "students", ["tenant_id"], if_not_exists=True)
    op.create_index("ix_students_tenant_status", "students", ["tenant_id", "status"], if_not_exists=True)

    # Users
    op.create_index("ix_users_keycloak_id", "users", ["keycloak_id"], if_not_exists=True)
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"], if_not_exists=True)

    # Grades
    op.create_index("ix_grades_student_id", "grades", ["student_id"], if_not_exists=True)
    op.create_index("ix_grades_tenant_id", "grades", ["tenant_id"], if_not_exists=True)

    # Attendance
    op.create_index("ix_attendance_student_id", "attendance", ["student_id"], if_not_exists=True)
    op.create_index("ix_attendance_tenant_date", "attendance", ["tenant_id", "date"], if_not_exists=True)

    # Payments
    op.create_index("ix_payments_student_id", "payments", ["student_id"], if_not_exists=True)
    op.create_index("ix_payments_tenant_id", "payments", ["tenant_id"], if_not_exists=True)

    # Audit log (most queried by tenant + date)
    op.create_index("ix_audit_log_tenant_created", "audit_logs", ["tenant_id", "created_at"], if_not_exists=True)

    # Tenants
    op.create_index("ix_tenants_slug", "tenants", ["slug"], if_not_exists=True)
    op.create_index("ix_tenants_is_active", "tenants", ["is_active"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_students_tenant_id", table_name="students", if_exists=True)
    op.drop_index("ix_students_tenant_status", table_name="students", if_exists=True)
    op.drop_index("ix_users_keycloak_id", table_name="users", if_exists=True)
    op.drop_index("ix_users_tenant_id", table_name="users", if_exists=True)
    op.drop_index("ix_grades_student_id", table_name="grades", if_exists=True)
    op.drop_index("ix_grades_tenant_id", table_name="grades", if_exists=True)
    op.drop_index("ix_attendance_student_id", table_name="attendance", if_exists=True)
    op.drop_index("ix_attendance_tenant_date", table_name="attendance", if_exists=True)
    op.drop_index("ix_payments_student_id", table_name="payments", if_exists=True)
    op.drop_index("ix_payments_tenant_id", table_name="payments", if_exists=True)
    op.drop_index("ix_audit_log_tenant_created", table_name="audit_log", if_exists=True)
    op.drop_index("ix_tenants_slug", table_name="tenants", if_exists=True)
    op.drop_index("ix_tenants_is_active", table_name="tenants", if_exists=True)
