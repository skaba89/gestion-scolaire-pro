"""Index composites (tenant_id, horodatage) sur les tables operational/.

Revision ID: 20260724_0001
Revises: b5e71cce8a7a
Create Date: 2026-07-24

Pourquoi :
- La Phase 3 de l'audit national (scalabilite) a ajoute page/page_size +
  LIMIT/OFFSET a ~18 endpoints de operational/ (incidents, inventory,
  library, communication, school_life, alumni, clubs, surveys) qui
  n'avaient auparavant aucune limite.
- Ces tables n'ont qu'un index tenant_id seul (cf. app/core/
  operational_tables.py) : le pattern desormais universel
  "WHERE tenant_id = :tid ORDER BY <horodatage> DESC LIMIT :limit"
  filtre par tenant_id puis trie separement, sans pouvoir utiliser
  l'index pour le tri.
- Un index composite (tenant_id, horodatage DESC) permet a Postgres de
  satisfaire le filtre ET le tri directement depuis l'index — le meme
  principe deja applique aux tables "core" (students, grades, attendance,
  payments, enrollments) par la migration 20260424_0001.

Suit le meme pattern idempotent (IF NOT EXISTS via inspection catalogue)
que 20260424_0001 : sans danger a rejouer, aucune donnee touchee.
"""
from alembic import op
from sqlalchemy import text

revision = "20260724_0001"
down_revision = "b5e71cce8a7a"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    return conn.execute(text(
        "SELECT EXISTS ("
        "  SELECT 1 FROM information_schema.tables"
        "  WHERE table_schema = 'public' AND table_name = :t"
        ")"
    ), {"t": table_name}).scalar()


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    return conn.execute(text(
        "SELECT EXISTS ("
        "  SELECT 1 FROM information_schema.columns"
        "  WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
        ")"
    ), {"t": table_name, "c": column_name}).scalar()


def _index_exists(conn, index_name: str) -> bool:
    return conn.execute(text(
        "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :i)"
    ), {"i": index_name}).scalar()


# (table, timestamp_column, index_name)
COMPOSITE_INDEXES = [
    ("incidents", "occurred_at", "ix_incidents_tenant_occurred"),
    ("inventory_items", "created_at", "ix_inventory_items_tenant_created"),
    ("inventory_transactions", "created_at", "ix_inventory_transactions_tenant_created"),
    ("orders", "created_at", "ix_orders_tenant_created"),
    ("library_resources", "created_at", "ix_library_resources_tenant_created"),
    # library_borrow_records intentionally excluded: it already has
    # ix_library_borrow_tenant (tenant_id, status), which matches
    # list_borrowers()'s WHERE tenant_id = :tid AND status = 'BORROWED'
    # equality filter — adding (tenant_id, due_date) on top wouldn't help
    # that query and would just cost extra writes.
    ("announcements", "created_at", "ix_announcements_tenant_created"),
    ("student_forums", "created_at", "ix_student_forums_tenant_created"),
    ("student_badges", "issued_at", "ix_student_badges_tenant_issued"),
    ("career_event_registrations", "registered_at", "ix_career_event_registrations_tenant_registered"),
    ("alumni_document_requests", "created_at", "ix_alumni_document_requests_alumni_created"),
    ("surveys", "created_at", "ix_surveys_tenant_created"),
    ("appointments", "appointment_date", "ix_appointments_tenant_date"),
]

# alumni_document_requests is scoped by alumni_id (per-user), not tenant_id —
# see list_document_requests() — so its composite key differs from the rest.
ALUMNI_ID_SCOPED = {"alumni_document_requests"}


def upgrade():
    conn = op.get_bind()
    for table, ts_col, index_name in COMPOSITE_INDEXES:
        if not _table_exists(conn, table):
            continue
        if not _column_exists(conn, table, ts_col):
            continue
        if _index_exists(conn, index_name):
            continue
        scope_col = "alumni_id" if table in ALUMNI_ID_SCOPED else "tenant_id"
        if not _column_exists(conn, table, scope_col):
            continue
        op.create_index(index_name, table, [scope_col, ts_col])


def downgrade():
    conn = op.get_bind()
    for table, _ts_col, index_name in COMPOSITE_INDEXES:
        if _index_exists(conn, index_name):
            op.drop_index(index_name, table)
