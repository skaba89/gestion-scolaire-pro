"""E-learning lessons and per-student lesson progress; tenant isolation for modules.

Revision ID: 20261112_0001
Revises: 20261110_0001

- elearning_modules gains tenant_id (backfilled from its course) and RLS: the
  table had neither, so module rows were only protected by the application
  joining on elearning_courses.
- elearning_lessons: lesson content (plain text + optional https link),
  ordered inside a module, published or draft.
- elearning_lesson_progress: one row per (lesson, student) once completed.

Production checked 2026-11-12 (read-only): 0 courses, 0 modules.
"""
import sqlalchemy as sa
from alembic import op

revision = "20261112_0001"
down_revision = "20261110_0001"
branch_labels = None
depends_on = None
# Additive: new tables; a NOT NULL column on elearning_modules, backfilled from
# the parent course. The previous release never inserts modules (no write
# route existed), so old code keeps working against the new schema.
backward_compatible = True

_POLICY = (
    "tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"
)


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _table_exists(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _column_exists(table: str, column: str) -> bool:
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def _enable_rls(table: str, policy: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(f"DROP POLICY IF EXISTS {policy} ON {table}")
    op.execute(f"CREATE POLICY {policy} ON {table} USING ({_POLICY}) WITH CHECK ({_POLICY})")


def upgrade():
    # elearning_* are operational tables (created on PostgreSQL by a historical
    # migration); nothing to do where they do not exist.
    if not _table_exists("elearning_courses"):
        return

    if _table_exists("elearning_modules") and not _column_exists("elearning_modules", "tenant_id"):
        op.add_column("elearning_modules", sa.Column("tenant_id", sa.Uuid(as_uuid=False), nullable=True))
        op.execute("""
            UPDATE elearning_modules m SET tenant_id = c.tenant_id
              FROM elearning_courses c WHERE c.id = m.course_id
        """)
        op.alter_column("elearning_modules", "tenant_id", nullable=False)
        op.create_foreign_key("fk_elearning_modules_tenant", "elearning_modules", "tenants",
                              ["tenant_id"], ["id"], ondelete="CASCADE")
        op.create_index("ix_elearning_modules_tenant_course", "elearning_modules", ["tenant_id", "course_id"])
        if _is_pg():
            _enable_rls("elearning_modules", "elearning_modules_tenant_isolation")

    if not _table_exists("elearning_lessons"):
        op.create_table(
            "elearning_lessons",
            sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True,
                      server_default=sa.text("gen_random_uuid()")),
            sa.Column("tenant_id", sa.Uuid(as_uuid=False), nullable=False),
            sa.Column("course_id", sa.Uuid(as_uuid=False), nullable=False),
            sa.Column("module_id", sa.Uuid(as_uuid=False), nullable=False),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("resource_url", sa.String(1000), nullable=True),
            sa.Column("lesson_type", sa.String(20), nullable=False, server_default="text"),
            sa.Column("duration_minutes", sa.Integer(), nullable=True),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_by", sa.Uuid(as_uuid=False), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["course_id"], ["elearning_courses.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["module_id"], ["elearning_modules.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
            sa.CheckConstraint("lesson_type IN ('text', 'video', 'document')", name="ck_elearning_lessons_type"),
            sa.CheckConstraint("resource_url IS NULL OR resource_url LIKE 'https://%'",
                               name="ck_elearning_lessons_https"),
            sa.CheckConstraint("duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440",
                               name="ck_elearning_lessons_duration"),
        )
        op.create_index("ix_elearning_lessons_tenant_course", "elearning_lessons", ["tenant_id", "course_id"])
        op.create_index("ix_elearning_lessons_module_order", "elearning_lessons", ["module_id", "order_index"])
        if _is_pg():
            _enable_rls("elearning_lessons", "elearning_lessons_tenant_isolation")

    if not _table_exists("elearning_lesson_progress"):
        op.create_table(
            "elearning_lesson_progress",
            sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True,
                      server_default=sa.text("gen_random_uuid()")),
            sa.Column("tenant_id", sa.Uuid(as_uuid=False), nullable=False),
            sa.Column("lesson_id", sa.Uuid(as_uuid=False), nullable=False),
            sa.Column("student_id", sa.Uuid(as_uuid=False), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["lesson_id"], ["elearning_lessons.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("lesson_id", "student_id", name="uq_elearning_lesson_progress"),
        )
        op.create_index("ix_elearning_lesson_progress_tenant_student", "elearning_lesson_progress",
                        ["tenant_id", "student_id"])
        if _is_pg():
            _enable_rls("elearning_lesson_progress", "elearning_lesson_progress_tenant_isolation")


def downgrade():
    if _table_exists("elearning_lesson_progress"):
        op.drop_table("elearning_lesson_progress")
    if _table_exists("elearning_lessons"):
        op.drop_table("elearning_lessons")
    if _table_exists("elearning_modules") and _column_exists("elearning_modules", "tenant_id"):
        if _is_pg():
            op.execute("DROP POLICY IF EXISTS elearning_modules_tenant_isolation ON elearning_modules")
            op.execute("ALTER TABLE elearning_modules NO FORCE ROW LEVEL SECURITY")
            op.execute("ALTER TABLE elearning_modules DISABLE ROW LEVEL SECURITY")
        op.drop_index("ix_elearning_modules_tenant_course", table_name="elearning_modules")
        op.drop_constraint("fk_elearning_modules_tenant", "elearning_modules", type_="foreignkey")
        op.drop_column("elearning_modules", "tenant_id")
