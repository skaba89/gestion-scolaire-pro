"""Add PENDING/PARTIAL to InvoiceStatus, REVERSED to PaymentStatus, and invoice columns

Revision ID: 20260406_payment_enums
Revises: 20260406_drop_keycloak_id
Create Date: 2026-04-06
"""
from alembic import op
import sqlalchemy as sa

revision = "20260406_payment_enums"
down_revision = "20260406_drop_keycloak_id"
branch_labels = None
depends_on = None


def upgrade():
    # Add REVERSED to PaymentStatus enum type
    op.execute("ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'REVERSED'")
    # Add PENDING and PARTIAL to InvoiceStatus enum type
    op.execute("ALTER TYPE invoicestatus ADD VALUE IF NOT EXISTS 'PENDING'")
    op.execute("ALTER TYPE invoicestatus ADD VALUE IF NOT EXISTS 'PARTIAL'")

    # Add missing columns to invoices table
    op.add_column("invoices", sa.Column("has_payment_plan", sa.Boolean(), server_default="false", nullable=True))
    op.add_column("invoices", sa.Column("installments_count", sa.Integer(), server_default="1", nullable=True))


def downgrade():
    op.drop_column("invoices", "installments_count")
    op.drop_column("invoices", "has_payment_plan")
    # PostgreSQL doesn't support removing enum values easily, so we skip that
