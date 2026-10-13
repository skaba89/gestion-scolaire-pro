"""Périmètre d'un parent sur les données financières : « ses enfants seulement ».

Le rôle PARENT détient `payments:read` pour consulter les factures et
paiements de SES enfants. Seules GET /payments/invoices/ et le reçu
appliquaient cette règle : GET /invoices/ (alias), GET /payments/payments/
et GET /payments/export/ renvoyaient les données de toutes les familles de
l'établissement (2026-10-13).
"""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

# Rôles qui voient toutes les données financières de l'établissement.
FINANCE_PRIVILEGED_ROLES = frozenset({
    "SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "ACCOUNTANT", "SECRETARY", "STAFF",
})


def restricted_parent_child_ids(db: Session, *, tenant_id: str, user: dict) -> Optional[list[str]]:
    """Enfants d'un parent non privilégié ; None si l'utilisateur n'est pas restreint."""
    roles = set(user.get("roles") or [])
    if "PARENT" not in roles or roles & FINANCE_PRIVILEGED_ROLES:
        return None
    rows = db.execute(text(
        "SELECT student_id FROM parent_students WHERE tenant_id = CAST(:tid AS uuid) AND parent_id = CAST(:uid AS uuid)"
    ), {"tid": str(tenant_id), "uid": str(user.get("id"))}).fetchall()
    return [str(r[0]) for r in rows]


def parent_student_filter(db: Session, *, tenant_id: str, user: dict, column: str,
                          requested_student_id: Optional[str]) -> tuple[str, dict]:
    """Fragment SQL limitant `column` aux enfants d'un parent restreint.

    `column` est un nom de colonne fixé par l'appelant, jamais une entrée
    utilisateur. Renvoie ("", {}) pour un rôle non restreint. Un parent qui
    demande l'élève d'une autre famille reçoit 403 ; sans enfant lié, le
    filtre ne retient aucune ligne.
    """
    child_ids = restricted_parent_child_ids(db, tenant_id=tenant_id, user=user)
    if child_ids is None:
        return "", {}
    if requested_student_id and requested_student_id not in child_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Accès limité aux élèves dont vous êtes le parent")
    return f" AND {column} = ANY(CAST(:parent_children AS uuid[]))", {"parent_children": child_ids}
