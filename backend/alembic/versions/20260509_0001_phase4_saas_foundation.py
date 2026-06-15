"""Phase 4 advanced SaaS foundation.

Revision ID: 20260509_0001
Revises: 20260424_0003
Create Date: 2026-05-09

Adds normalized SaaS tables for plans, tenant subscriptions, quota metering,
billing event idempotency and tenant domain mapping.

This migration is intentionally non-destructive and keeps the legacy billing
columns on tenants for backward compatibility.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260509_0001"
down_revision = "20260424_0003"
branch_labels = None
depends_on = None


def _json_type():
    bind = op.get_bind()
    return postgresql.JSONB(astext_type=sa.Text()) if bind.dialect.name == "postgresql" else sa.JSON()


def _uuid_type():
    bind = op.get_bind()
    return postgresql.UUID(as_uuid=True) if bind.dialect.name == "postgresql" else sa.CHAR(32)


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {col["name"] for col in inspector.get_columns(table_name)}
    if column.name not in existing:
        op.add_column(table_name, column)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {idx["name"] for idx in inspector.get_indexes(table_name)}
    if index_name not in existing:
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    uuid_type = _uuid_type()
    json_type = _json_type()

    # Legacy tenant billing fields used by existing /billing and /platform routes.
    # Non-destructive: these columns are added only if missing.
    _add_column_if_missing("tenants", sa.Column("billing_email", sa.String(length=255), nullable=True))
    _add_column_if_missing("tenants", sa.Column("subscription_plan", sa.String(length=50), nullable=True, server_default="starter"))
    _add_column_if_missing("tenants", sa.Column("subscription_status", sa.String(length=50), nullable=True, server_default="trialing"))
    _add_column_if_missing("tenants", sa.Column("trial_ends_at", sa.DateTime(), nullable=True))
    _add_column_if_missing("tenants", sa.Column("stripe_customer_id", sa.String(length=255), nullable=True))
    _add_column_if_missing("tenants", sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True))
    _create_index_if_missing("ix_tenants_stripe_customer_id", "tenants", ["stripe_customer_id"])
    _create_index_if_missing("ix_tenants_stripe_subscription_id", "tenants", ["stripe_subscription_id"])

    op.create_table(
        "subscription_plans",
        sa.Column("id", uuid_type, primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column("price_monthly", sa.Float(), nullable=False, server_default="0"),
        sa.Column("price_yearly", sa.Float(), nullable=False, server_default="0"),
        sa.Column("max_students", sa.Integer(), nullable=True),
        sa.Column("max_users", sa.Integer(), nullable=True),
        sa.Column("max_storage_gb", sa.Integer(), nullable=True),
        sa.Column("max_ai_requests", sa.Integer(), nullable=True),
        sa.Column("max_exports_per_day", sa.Integer(), nullable=True),
        sa.Column("max_campuses", sa.Integer(), nullable=True),
        sa.Column("stripe_price_monthly_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_price_yearly_id", sa.String(length=255), nullable=True),
        sa.Column("features", json_type, nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("slug", name="uq_subscription_plans_slug"),
    )
    op.create_index("ix_subscription_plans_slug", "subscription_plans", ["slug"])

    op.create_table(
        "tenant_subscriptions",
        sa.Column("id", uuid_type, primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("tenant_id", uuid_type, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", uuid_type, sa.ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="trialing"),
        sa.Column("billing_cycle", sa.String(length=20), nullable=False, server_default="monthly"),
        sa.Column("payment_provider", sa.String(length=50), nullable=False, server_default="stripe"),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        sa.Column("provider_reference", sa.String(length=255), nullable=True),
        sa.Column("provider_status", sa.String(length=100), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("current_period_start", sa.DateTime(), nullable=True),
        sa.Column("current_period_end", sa.DateTime(), nullable=True),
        sa.Column("trial_ends_at", sa.DateTime(), nullable=True),
        sa.Column("canceled_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("tenant_id", "stripe_subscription_id", name="uq_tenant_subscription_stripe_subscription"),
    )
    op.create_index("ix_tenant_subscriptions_tenant_id", "tenant_subscriptions", ["tenant_id"])
    op.create_index("ix_tenant_subscriptions_plan_id", "tenant_subscriptions", ["plan_id"])
    op.create_index("ix_tenant_subscriptions_status", "tenant_subscriptions", ["status"])
    op.create_index("ix_tenant_subscriptions_stripe_customer_id", "tenant_subscriptions", ["stripe_customer_id"])
    op.create_index("ix_tenant_subscriptions_stripe_subscription_id", "tenant_subscriptions", ["stripe_subscription_id"])
    op.create_index("ix_tenant_subscriptions_provider_reference", "tenant_subscriptions", ["provider_reference"])

    op.create_table(
        "tenant_quota_usage",
        sa.Column("id", uuid_type, primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("tenant_id", uuid_type, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("students_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("users_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("campuses_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("storage_used_mb", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ai_requests_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("exports_count_today", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_calculated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_quota_usage_tenant"),
    )
    op.create_index("ix_tenant_quota_usage_tenant_id", "tenant_quota_usage", ["tenant_id"])

    op.create_table(
        "billing_events",
        sa.Column("id", uuid_type, primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("tenant_id", uuid_type, sa.ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=False, server_default="stripe"),
        sa.Column("event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=150), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="received"),
        sa.Column("payload", json_type, nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.UniqueConstraint("event_id", name="uq_billing_events_event_id"),
    )
    op.create_index("ix_billing_events_tenant_id", "billing_events", ["tenant_id"])
    op.create_index("ix_billing_events_provider", "billing_events", ["provider"])
    op.create_index("ix_billing_events_event_id", "billing_events", ["event_id"])
    op.create_index("ix_billing_events_event_type", "billing_events", ["event_type"])

    op.create_table(
        "tenant_domains",
        sa.Column("id", uuid_type, primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("tenant_id", uuid_type, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("domain_type", sa.String(length=30), nullable=False, server_default="subdomain"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("verification_token", sa.String(length=255), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("domain", name="uq_tenant_domains_domain"),
    )
    op.create_index("ix_tenant_domains_tenant_id", "tenant_domains", ["tenant_id"])
    op.create_index("ix_tenant_domains_domain", "tenant_domains", ["domain"])


def downgrade() -> None:
    op.drop_index("ix_tenant_domains_domain", table_name="tenant_domains")
    op.drop_index("ix_tenant_domains_tenant_id", table_name="tenant_domains")
    op.drop_table("tenant_domains")

    op.drop_index("ix_billing_events_event_type", table_name="billing_events")
    op.drop_index("ix_billing_events_event_id", table_name="billing_events")
    op.drop_index("ix_billing_events_provider", table_name="billing_events")
    op.drop_index("ix_billing_events_tenant_id", table_name="billing_events")
    op.drop_table("billing_events")

    op.drop_index("ix_tenant_quota_usage_tenant_id", table_name="tenant_quota_usage")
    op.drop_table("tenant_quota_usage")

    op.drop_index("ix_tenant_subscriptions_provider_reference", table_name="tenant_subscriptions")
    op.drop_index("ix_tenant_subscriptions_stripe_subscription_id", table_name="tenant_subscriptions")
    op.drop_index("ix_tenant_subscriptions_stripe_customer_id", table_name="tenant_subscriptions")
    op.drop_index("ix_tenant_subscriptions_status", table_name="tenant_subscriptions")
    op.drop_index("ix_tenant_subscriptions_plan_id", table_name="tenant_subscriptions")
    op.drop_index("ix_tenant_subscriptions_tenant_id", table_name="tenant_subscriptions")
    op.drop_table("tenant_subscriptions")

    op.drop_index("ix_subscription_plans_slug", table_name="subscription_plans")
    op.drop_table("subscription_plans")
