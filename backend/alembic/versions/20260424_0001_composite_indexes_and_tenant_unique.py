"""Index composites multi-tenant et correction UNIQUE registration_number.

Revision ID: 20260424_0001
Revises: 20260411_add_user_must_change_password
Create Date: 2026-04-24

Pourquoi :
- Les requêtes LIST sur tables larges scannent toute la table par tenant_id seul.
- Les index composites (tenant_id, champ_filtré) réduisent les scans de 10x à 100x.
- registration_number doit être unique PAR tenant, pas globalement.

Cette migration est volontairement défensive : certaines bases locales/legacy
n'ont pas encore toutes les colonnes optionnelles. Les index sont donc créés
uniquement lorsque les colonnes existent réellement dans PostgreSQL.
"""
from alembic import op
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError, OperationalError

revision = "20260424_0001"
down_revision = "20260411_add_user_must_change_password"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(
        text("SELECT to_regclass(:qualified_name) IS NOT NULL"),
        {"qualified_name": f"public.{table_name}"},
    )
    return bool(result.scalar())


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM pg_attribute a
                JOIN pg_class c ON c.oid = a.attrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'
                  AND c.relname = :table_name
                  AND a.attname = :column_name
                  AND a.attnum > 0
                  AND NOT a.attisdropped
            )
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    )
    return bool(result.scalar())


def _columns_exist(conn, table_name: str, columns: list[str]) -> bool:
    return all(_column_exists(conn, table_name, column) for column in columns)


def _index_exists(conn, index_name: str) -> bool:
    result = conn.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :i"
            ")"
        ),
        {"i": index_name},
    )
    return bool(result.scalar())


def _constraint_exists(conn, constraint_name: str, table_name: str) -> bool:
    result = conn.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.table_constraints"
            "  WHERE table_schema = 'public' AND constraint_name = :c AND table_name = :t"
            ")"
        ),
        {"c": constraint_name, "t": table_name},
    )
    return bool(result.scalar())


def _create_index_if_columns_exist(conn, index_name: str, table_name: str, columns: list[str]) -> None:
    if not _table_exists(conn, table_name):
        return
    if not _columns_exist(conn, table_name, columns):
        return
    if _index_exists(conn, index_name):
        return

    try:
        op.create_index(index_name, table_name, columns)
    except (ProgrammingError, OperationalError):
        # Defensive migration: optional optimization indexes must never prevent
        # a fresh environment from booting when a legacy/parallel migration has
        # not yet introduced a column.
        conn.rollback()


def upgrade():
    conn = op.get_bind()

    # ── 1. Index composites sur students ──────────────────────────────────────
    if _table_exists(conn, "students"):
        _create_index_if_columns_exist(conn, "ix_students_tenant_status", "students", ["tenant_id", "status"])
        _create_index_if_columns_exist(conn, "ix_students_tenant_classroom", "students", ["tenant_id", "classroom_id"])
        _create_index_if_columns_exist(conn, "ix_students_tenant_created", "students", ["tenant_id", "created_at"])

        # Correction : registration_number unique par tenant (pas global)
        if _columns_exist(conn, "students", ["tenant_id", "registration_number"]):
            if _constraint_exists(conn, "uq_students_registration_number", "students"):
                op.drop_constraint("uq_students_registration_number", "students", type_="unique")

            if not _constraint_exists(conn, "uq_students_tenant_registration", "students"):
                op.create_unique_constraint(
                    "uq_students_tenant_registration",
                    "students",
                    ["tenant_id", "registration_number"],
                )

    # ── 2. Index composites sur grades ───────────────────────────────────────
    if _table_exists(conn, "grades"):
        _create_index_if_columns_exist(conn, "ix_grades_tenant_student_subject", "grades", ["tenant_id", "student_id", "subject_id"])
        _create_index_if_columns_exist(conn, "ix_grades_tenant_term", "grades", ["tenant_id", "academic_term_id"])

    # ── 3. Index composites sur attendance ───────────────────────────────────
    if _table_exists(conn, "attendance"):
        _create_index_if_columns_exist(conn, "ix_attendance_tenant_date", "attendance", ["tenant_id", "date"])
        _create_index_if_columns_exist(conn, "ix_attendance_tenant_classroom", "attendance", ["tenant_id", "classroom_id"])

    # ── 4. Index composites sur payments ─────────────────────────────────────
    if _table_exists(conn, "payments"):
        _create_index_if_columns_exist(conn, "ix_payments_tenant_status", "payments", ["tenant_id", "status"])
        _create_index_if_columns_exist(conn, "ix_payments_tenant_student", "payments", ["tenant_id", "student_id"])

    # ── 5. Index composites sur users ────────────────────────────────────────
    if _table_exists(conn, "users"):
        _create_index_if_columns_exist(conn, "ix_users_tenant_role", "users", ["tenant_id", "role"])
        _create_index_if_columns_exist(conn, "ix_users_email_active", "users", ["email", "is_active"])

    # ── 6. Index composites sur enrollments ──────────────────────────────────
    if _table_exists(conn, "enrollments"):
        _create_index_if_columns_exist(conn, "ix_enrollments_tenant_student", "enrollments", ["tenant_id", "student_id"])
        _create_index_if_columns_exist(conn, "ix_enrollments_tenant_status", "enrollments", ["tenant_id", "status"])


def downgrade():
    conn = op.get_bind()

    indexes_to_drop = [
        ("ix_students_tenant_status", "students"),
        ("ix_students_tenant_classroom", "students"),
        ("ix_students_tenant_created", "students"),
        ("ix_grades_tenant_student_subject", "grades"),
        ("ix_grades_tenant_term", "grades"),
        ("ix_attendance_tenant_date", "attendance"),
        ("ix_attendance_tenant_classroom", "attendance"),
        ("ix_payments_tenant_status", "payments"),
        ("ix_payments_tenant_student", "payments"),
        ("ix_users_tenant_role", "users"),
        ("ix_users_email_active", "users"),
        ("ix_enrollments_tenant_student", "enrollments"),
        ("ix_enrollments_tenant_status", "enrollments"),
    ]

    for index_name, table_name in indexes_to_drop:
        if _index_exists(conn, index_name):
            op.drop_index(index_name, table_name=table_name)

    # Restaurer l'ancienne contrainte globale uniquement si la colonne existe.
    if _table_exists(conn, "students") and _column_exists(conn, "students", "registration_number"):
        if _constraint_exists(conn, "uq_students_tenant_registration", "students"):
            op.drop_constraint("uq_students_tenant_registration", "students", type_="unique")
        if not _constraint_exists(conn, "uq_students_registration_number", "students"):
            op.create_unique_constraint(
                "uq_students_registration_number",
                "students",
                ["registration_number"],
            )
