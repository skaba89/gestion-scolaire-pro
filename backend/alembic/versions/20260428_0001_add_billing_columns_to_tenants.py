"""Add Stripe billing columns to tenants table.

Revision ID: 20260428_0001
Revises: 20260424_0003
Create Date: 2026-04-28

Colonnes ajoutées :
  - stripe_customer_id      VARCHAR(255) — ID client Stripe (cus_xxx)
  - stripe_subscription_id  VARCHAR(255) — ID abonnement Stripe (sub_xxx)
  - subscription_plan       VARCHAR(50)  — "starter" | "pro" | "enterprise"
  - subscription_status     VARCHAR(50)  — mirrors Stripe status
  - trial_ends_at           TIMESTAMP    — fin de la période d'essai
  - billing_email           VARCHAR(255) — email de facturation
"""
from alembic import op
import sqlalchemy as sa

revision = "20260428_0001"
down_revision = "20260424_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    if is_sqlite:
        # SQLite: ADD COLUMN IF NOT EXISTS not supported — use try/except per column
        for col_def in [
            "ALTER TABLE tenants ADD COLUMN stripe_customer_id VARCHAR(255)",
            "ALTER TABLE tenants ADD COLUMN stripe_subscription_id VARCHAR(255)",
            "ALTER TABLE tenants ADD COLUMN subscription_plan VARCHAR(50) DEFAULT 'starter'",
            "ALTER TABLE tenants ADD COLUMN subscription_status VARCHAR(50) DEFAULT 'trialing'",
            "ALTER TABLE tenants ADD COLUMN trial_ends_at TIMESTAMP",
            "ALTER TABLE tenants ADD COLUMN billing_email VARCHAR(255)",
        ]:
            try:
                bind.execute(sa.text(col_def))
            except Exception:
                pass  # column already exists
    else:
        # PostgreSQL: idempotent via DO block
        bind.execute(sa.text("""
            DO $$
            BEGIN
                BEGIN
                    ALTER TABLE tenants ADD COLUMN stripe_customer_id VARCHAR(255);
                EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN
                    ALTER TABLE tenants ADD COLUMN stripe_subscription_id VARCHAR(255);
                EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN
                    ALTER TABLE tenants ADD COLUMN subscription_plan VARCHAR(50) DEFAULT 'starter';
                EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN
                    ALTER TABLE tenants ADD COLUMN subscription_status VARCHAR(50) DEFAULT 'trialing';
                EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN
                    ALTER TABLE tenants ADD COLUMN trial_ends_at TIMESTAMP;
                EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN
                    ALTER TABLE tenants ADD COLUMN billing_email VARCHAR(255);
                EXCEPTION WHEN duplicate_column THEN NULL; END;
            END $$;
        """))

        # Indexes for webhook lookups (Stripe ID → tenant)
        bind.execute(sa.text("""
            CREATE INDEX IF NOT EXISTS ix_tenants_stripe_customer_id
                ON tenants (stripe_customer_id)
                WHERE stripe_customer_id IS NOT NULL;
        """))
        bind.execute(sa.text("""
            CREATE INDEX IF NOT EXISTS ix_tenants_stripe_subscription_id
                ON tenants (stripe_subscription_id)
                WHERE stripe_subscription_id IS NOT NULL;
        """))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        pass  # SQLite does not support DROP COLUMN easily
    else:
        op.drop_column("tenants", "billing_email")
        op.drop_column("tenants", "trial_ends_at")
        op.drop_column("tenants", "subscription_status")
        op.drop_column("tenants", "subscription_plan")
        op.drop_column("tenants", "stripe_subscription_id")
        op.drop_column("tenants", "stripe_customer_id")
