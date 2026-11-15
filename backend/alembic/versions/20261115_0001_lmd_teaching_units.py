"""Add tenant-isolated LMD teaching units and optional ECUE attachment.

Revision ID: 20261115_0001
Revises: 20261114_0003
"""
import sqlalchemy as sa
from alembic import op

revision = "20261115_0001"
down_revision = "20261114_0003"
branch_labels = None
depends_on = None
backward_compatible = True


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    inspector = sa.inspect(bind)
    if not inspector.has_table("teaching_units"):
        op.create_table(
            "teaching_units",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("semester_id", sa.Uuid(), sa.ForeignKey("semesters.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("code", sa.String(50), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("ects", sa.Float(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("tenant_id", "code", name="uq_teaching_units_tenant_code"),
            sa.UniqueConstraint("tenant_id", "id", name="uq_teaching_units_tenant_id_id"),
            sa.CheckConstraint("ects >= 0", name="ck_teaching_units_ects_nonnegative"),
            sa.CheckConstraint("revision >= 1", name="ck_teaching_units_revision"),
        )
        op.create_index("ix_teaching_units_tenant_id", "teaching_units", ["tenant_id"])
        op.create_index("ix_teaching_units_semester_id", "teaching_units", ["semester_id"])
    subject_columns = {column["name"] for column in sa.inspect(bind).get_columns("subjects")}
    foreign_keys = {fk.get("name") for fk in sa.inspect(bind).get_foreign_keys("subjects")}
    if bind.dialect.name == "sqlite":
        # SQLite cannot ALTER constraints in place; batch mode rebuilds only
        # this table and preserves every existing subject row.
        with op.batch_alter_table("subjects") as batch:
            if "teaching_unit_id" not in subject_columns:
                batch.add_column(sa.Column("teaching_unit_id", sa.Uuid(), nullable=True))
                batch.create_index("ix_subjects_teaching_unit_id", ["teaching_unit_id"])
            if "fk_subjects_tenant_teaching_unit" not in foreign_keys:
                batch.create_foreign_key(
                    "fk_subjects_tenant_teaching_unit", "teaching_units",
                    ["tenant_id", "teaching_unit_id"], ["tenant_id", "id"],
                )
    else:
        if "teaching_unit_id" not in subject_columns:
            op.add_column("subjects", sa.Column("teaching_unit_id", sa.Uuid(), nullable=True))
            op.create_index("ix_subjects_teaching_unit_id", "subjects", ["teaching_unit_id"])
        if "fk_subjects_tenant_teaching_unit" not in foreign_keys:
            op.create_foreign_key(
                "fk_subjects_tenant_teaching_unit", "subjects", "teaching_units",
                ["tenant_id", "teaching_unit_id"], ["tenant_id", "id"],
            )
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE teaching_units ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE teaching_units FORCE ROW LEVEL SECURITY")
        op.execute("DROP POLICY IF EXISTS teaching_units_tenant_isolation ON teaching_units")
        predicate = "tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"
        op.execute(f"CREATE POLICY teaching_units_tenant_isolation ON teaching_units USING ({predicate}) WITH CHECK ({predicate})")


def downgrade():
    # UE definitions and ECUE links are historical curriculum data.
    pass
