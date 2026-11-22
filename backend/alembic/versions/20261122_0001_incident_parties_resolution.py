"""Support multi-student incidents and durable resolution timestamps.

Revision ID: 20261122_0001
Revises: 20261121_0001
Create Date: 2026-11-22

The existing incidents table is intentionally preserved.  The association
table is additive and ``resolved_at`` is nullable, so the previous API image
continues to run while migrations are applied before the new release.
"""
import sqlalchemy as sa
from alembic import op


revision = "20261122_0001"
down_revision = "20261121_0001"
branch_labels = None
depends_on = None
backward_compatible = True

TABLE = "incident_parties"


def upgrade() -> None:
    bind = op.get_bind()
    # ``incidents`` is one of the historical PostgreSQL-only operational
    # tables. SQLite tests obtain their schema from ORM metadata and do not
    # expose these raw-SQL routes.
    if bind.dialect.name != "postgresql":
        return

    op.execute("SET LOCAL lock_timeout = '5s'")
    incident_columns = {column["name"] for column in sa.inspect(bind).get_columns("incidents")}
    if "resolved_at" not in incident_columns:
        op.add_column(
            "incidents",
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not sa.inspect(bind).has_table(TABLE):
        op.create_table(
            TABLE,
            sa.Column(
                "id",
                sa.Uuid(),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "tenant_id",
                sa.Uuid(),
                sa.ForeignKey("tenants.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "incident_id",
                sa.Uuid(),
                sa.ForeignKey("incidents.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "student_id",
                sa.Uuid(),
                sa.ForeignKey("students.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column(
                "party_type",
                sa.String(32),
                nullable=False,
                server_default="INVOLVED",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint(
                "tenant_id",
                "incident_id",
                "student_id",
                name="uq_incident_parties_incident_student",
            ),
        )
    existing_indexes = {
        index["name"] for index in sa.inspect(bind).get_indexes(TABLE)
    }
    if "ix_incident_parties_tenant_incident" not in existing_indexes:
        op.create_index(
            "ix_incident_parties_tenant_incident",
            TABLE,
            ["tenant_id", "incident_id"],
        )
    if "ix_incident_parties_tenant_student" not in existing_indexes:
        op.create_index(
            "ix_incident_parties_tenant_student",
            TABLE,
            ["tenant_id", "student_id"],
        )

    predicate = (
        "tenant_id = NULLIF("
        "current_setting('app.current_tenant_id', true), '')::uuid"
    )
    op.execute(f"ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {TABLE} FORCE ROW LEVEL SECURITY")
    op.execute(f"DROP POLICY IF EXISTS {TABLE}_tenant_isolation ON {TABLE}")
    op.execute(
        f"CREATE POLICY {TABLE}_tenant_isolation ON {TABLE} "
        f"USING ({predicate}) WITH CHECK ({predicate})"
    )


def downgrade() -> None:
    # Incident participants and resolution timestamps are school-life
    # history. Older application images ignore this additive schema, while
    # dropping it would irreversibly lose data and silently widen visibility
    # back to the single legacy student_id. A destructive removal therefore
    # requires a separately approved data migration.
    pass
