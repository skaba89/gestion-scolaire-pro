"""Normalize parent and student portal identities.

Revision ID: a1b2c3d4e5f7
Revises: 7fbd91278eef
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f7"
down_revision = "7fbd91278eef"
branch_labels = None
depends_on = None


def _column_names(inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_columns = _column_names(inspector, "users")
    if "address" not in user_columns:
        op.add_column("users", sa.Column("address", sa.String(500), nullable=True))
    if "occupation" not in user_columns:
        op.add_column("users", sa.Column("occupation", sa.String(100), nullable=True))

    if "user_id" in _column_names(inspector, "students"):
        return

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("students") as batch_op:
            batch_op.add_column(sa.Column("user_id", sa.String(32), nullable=True))
            batch_op.create_index("ix_students_user_id", ["user_id"], unique=True)
        return

    op.add_column("students", sa.Column("user_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_students_user_id_users",
        "students",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_students_user_id", "students", ["user_id"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "user_id" in _column_names(inspector, "students"):
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("students") as batch_op:
                batch_op.drop_index("ix_students_user_id")
                batch_op.drop_column("user_id")
        else:
            op.drop_index("ix_students_user_id", table_name="students")
            op.drop_constraint("fk_students_user_id_users", "students", type_="foreignkey")
            op.drop_column("students", "user_id")

    user_columns = _column_names(sa.inspect(bind), "users")
    removable = [name for name in ("occupation", "address") if name in user_columns]
    if bind.dialect.name == "sqlite" and removable:
        with op.batch_alter_table("users") as batch_op:
            for name in removable:
                batch_op.drop_column(name)
    else:
        for name in removable:
            op.drop_column("users", name)
