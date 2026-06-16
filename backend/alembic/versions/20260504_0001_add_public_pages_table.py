"""Add public_pages table for tenant landing page content.

Revision ID: 20260504_0001
Revises: 20260428_0001
Create Date: 2026-05-04

Creates the public_pages table used by PublicPage ORM model and
the /public-pages/ API endpoint. This is a targeted migration that
only adds the new table without touching existing schema.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260504_0001"
down_revision = "20260428_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "public_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("page_type", sa.String(50), nullable=False, server_default="CUSTOM"),
        sa.Column("content", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("template", sa.String(50), nullable=True),
        sa.Column("primary_color", sa.String(7), nullable=True),
        sa.Column("secondary_color", sa.String(7), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("meta_title", sa.String(200), nullable=True),
        sa.Column("meta_description", sa.Text(), nullable=True),
        sa.Column("hero_image", sa.String(500), nullable=True),
        sa.Column("show_in_nav", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("nav_label", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_public_pages_tenant_id", "public_pages", ["tenant_id"])
    op.create_index("ix_public_pages_slug", "public_pages", ["slug"])
    op.create_index(
        "ix_public_pages_tenant_published",
        "public_pages",
        ["tenant_id", "is_published"],
    )


def downgrade() -> None:
    op.drop_index("ix_public_pages_tenant_published", table_name="public_pages")
    op.drop_index("ix_public_pages_slug", table_name="public_pages")
    op.drop_index("ix_public_pages_tenant_id", table_name="public_pages")
    op.drop_table("public_pages")
