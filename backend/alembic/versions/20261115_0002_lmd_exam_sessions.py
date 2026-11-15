"""Add tenant-isolated LMD exam and retake sessions.

Revision ID: 20261115_0002
Revises: 20261115_0001
"""
import sqlalchemy as sa
from alembic import op

revision = "20261115_0002"
down_revision = "20261115_0001"
branch_labels = None
depends_on = None
backward_compatible = True


def _constraint_names(inspector, table):
    return {item.get("name") for item in inspector.get_unique_constraints(table)}


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    inspector = sa.inspect(bind)

    if "uq_semesters_tenant_id_id" not in _constraint_names(inspector, "semesters"):
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("semesters") as batch:
                batch.create_unique_constraint("uq_semesters_tenant_id_id", ["tenant_id", "id"])
        else:
            op.create_unique_constraint("uq_semesters_tenant_id_id", "semesters", ["tenant_id", "id"])

    if not inspector.has_table("exam_sessions"):
        op.create_table(
            "exam_sessions",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("semester_id", sa.Uuid(), nullable=False),
            sa.Column("code", sa.String(50), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("session_type", sa.String(20), nullable=False, server_default="REGULAR"),
            sa.Column("sequence", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("starts_on", sa.Date(), nullable=False),
            sa.Column("ends_on", sa.Date(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
            sa.Column("selection_policy", sa.String(20), nullable=False, server_default="BEST"),
            sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("tenant_id", "code", name="uq_exam_sessions_tenant_code"),
            sa.UniqueConstraint("tenant_id", "id", name="uq_exam_sessions_tenant_id_id"),
            sa.ForeignKeyConstraint(
                ["tenant_id", "semester_id"], ["semesters.tenant_id", "semesters.id"],
                name="fk_exam_sessions_tenant_semester", ondelete="RESTRICT",
            ),
            sa.CheckConstraint("session_type IN ('REGULAR', 'RETAKE')", name="ck_exam_sessions_type"),
            sa.CheckConstraint("status IN ('DRAFT', 'OPEN', 'CLOSED')", name="ck_exam_sessions_status"),
            sa.CheckConstraint("selection_policy IN ('BEST', 'LATEST')", name="ck_exam_sessions_policy"),
            sa.CheckConstraint("sequence >= 1", name="ck_exam_sessions_sequence"),
            sa.CheckConstraint("revision >= 1", name="ck_exam_sessions_revision"),
            sa.CheckConstraint("ends_on >= starts_on", name="ck_exam_sessions_dates"),
        )
        op.create_index("ix_exam_sessions_tenant_id", "exam_sessions", ["tenant_id"])
        op.create_index("ix_exam_sessions_semester_id", "exam_sessions", ["semester_id"])
    else:
        exam_indexes = {item.get("name") for item in inspector.get_indexes("exam_sessions")}
        if "ix_exam_sessions_tenant_id" not in exam_indexes:
            op.create_index("ix_exam_sessions_tenant_id", "exam_sessions", ["tenant_id"])
        if "ix_exam_sessions_semester_id" not in exam_indexes:
            op.create_index("ix_exam_sessions_semester_id", "exam_sessions", ["semester_id"])

    inspector = sa.inspect(bind)
    assessment_columns = {column["name"] for column in inspector.get_columns("assessments")}
    unique_names = _constraint_names(inspector, "assessments")
    foreign_names = {item.get("name") for item in inspector.get_foreign_keys("assessments")}
    assessment_indexes = {item.get("name") for item in inspector.get_indexes("assessments")}
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("assessments") as batch:
            if "uq_assessments_tenant_id_id" not in unique_names:
                batch.create_unique_constraint("uq_assessments_tenant_id_id", ["tenant_id", "id"])
            if "exam_session_id" not in assessment_columns:
                batch.add_column(sa.Column("exam_session_id", sa.Uuid(), nullable=True))
            if "ix_assessments_exam_session_id" not in assessment_indexes:
                batch.create_index("ix_assessments_exam_session_id", ["exam_session_id"])
            if "fk_assessments_tenant_exam_session" not in foreign_names:
                batch.create_foreign_key(
                    "fk_assessments_tenant_exam_session", "exam_sessions",
                    ["tenant_id", "exam_session_id"], ["tenant_id", "id"], ondelete="RESTRICT",
                )
    else:
        if "uq_assessments_tenant_id_id" not in unique_names:
            op.create_unique_constraint("uq_assessments_tenant_id_id", "assessments", ["tenant_id", "id"])
        if "exam_session_id" not in assessment_columns:
            op.add_column("assessments", sa.Column("exam_session_id", sa.Uuid(), nullable=True))
        if "ix_assessments_exam_session_id" not in assessment_indexes:
            op.create_index("ix_assessments_exam_session_id", "assessments", ["exam_session_id"])
        if "fk_assessments_tenant_exam_session" not in foreign_names:
            op.create_foreign_key(
                "fk_assessments_tenant_exam_session", "assessments", "exam_sessions",
                ["tenant_id", "exam_session_id"], ["tenant_id", "id"], ondelete="RESTRICT",
            )

    if bind.dialect.name == "postgresql":
        predicate = "tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"
        op.execute("ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE exam_sessions FORCE ROW LEVEL SECURITY")
        op.execute("DROP POLICY IF EXISTS exam_sessions_tenant_isolation ON exam_sessions")
        op.execute(f"CREATE POLICY exam_sessions_tenant_isolation ON exam_sessions USING ({predicate}) WITH CHECK ({predicate})")


def downgrade():
    # Sessions and their assessment links are academic history.
    pass
