"""Add weight (coefficient) and description to assessments.

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-17

The assessments endpoints read and write `weight` (the coefficient shown in
the "Nouvelle Évaluation" form) and `description`, but neither column ever
existed on the table. Creating an assessment therefore always failed with
`column "weight" of relation "assessments" does not exist` (surfaced to the
user as a generic 400), and updates hit the same wall on their RETURNING
clause. Adding the columns makes the coefficient actually persist so weighted
averages can be computed.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "f7a8b9c0d1e2"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assessments",
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
    )
    op.add_column(
        "assessments",
        sa.Column("description", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("assessments", "description")
    op.drop_column("assessments", "weight")
