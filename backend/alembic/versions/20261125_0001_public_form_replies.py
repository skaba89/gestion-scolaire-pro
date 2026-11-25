"""Réponses aux messages des formulaires de contact publics.

Revision ID: 20261125_0001
Revises: 20261122_0001
Create Date: 2026-11-25

Table additive ``public_form_replies`` (historique des réponses d'un établissement à un message
reçu), isolée par établissement (RLS ENABLE + FORCE, même prédicat que les autres tables). L'ancienne
image de l'API l'ignore : migration compatible avec un retour arrière du code.
"""
import sqlalchemy as sa
from alembic import op

revision = "20261125_0001"
down_revision = "20261122_0001"
branch_labels = None
depends_on = None
backward_compatible = True

TABLE = "public_form_replies"


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(TABLE):
        op.create_table(
            TABLE,
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("submission_id", sa.Uuid(),
                      sa.ForeignKey("public_form_submissions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("author_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
    existing = {index["name"] for index in sa.inspect(bind).get_indexes(TABLE)}
    for name, columns in (("ix_public_form_replies_tenant_id", ["tenant_id"]),
                          ("ix_public_form_replies_submission_id", ["submission_id"])):
        if name not in existing:
            op.create_index(name, TABLE, columns)

    if bind.dialect.name != "postgresql":
        return
    predicate = "tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"
    op.execute(f"ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {TABLE} FORCE ROW LEVEL SECURITY")
    op.execute(f"DROP POLICY IF EXISTS {TABLE}_tenant_isolation ON {TABLE}")
    op.execute(
        f"CREATE POLICY {TABLE}_tenant_isolation ON {TABLE} "
        f"USING ({predicate}) WITH CHECK ({predicate})"
    )


def downgrade() -> None:
    # Supprime l'historique des réponses (les messages reçus, eux, sont conservés). Le code
    # précédent n'utilise pas cette table.
    bind = op.get_bind()
    if sa.inspect(bind).has_table(TABLE):
        op.drop_table(TABLE)
