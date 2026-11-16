"""Périmètre « cycles pédagogiques » d'un compte du personnel.

Modèle validé le 2026-11-16 (opt-in) :
- aucune affectation enregistrée → aucun filtrage par cycle (comportement
  historique, aucun compte existant ne perd d'accès) ;
- au moins une affectation → le compte est limité à ces cycles ;
- SUPER_ADMIN et TENANT_ADMIN ne sont jamais restreints ;
- TEACHER garde sa règle « ses classes » (``teacher_scope``) et ne reçoit pas
  d'affectation de cycle ;
- un élève dont la classe n'a pas de niveau, ou dont le niveau n'a pas de
  cycle, n'est visible que des comptes non restreints.

Ce module ne fait que *calculer* le périmètre. Son application aux routes
est un lot distinct (B2) : tant que ce lot n'est pas livré,
``cycle_policy_available`` reste ``False``.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

# Rôles qui ne sont jamais limités à des cycles.
UNRESTRICTED_ROLES = frozenset({"SUPER_ADMIN", "TENANT_ADMIN"})
# Rôles auxquels un administrateur peut attribuer des cycles.
RESTRICTABLE_ROLES = frozenset({"DIRECTOR", "DEPARTMENT_HEAD", "SECRETARY", "STAFF", "ACCOUNTANT"})


def can_be_cycle_restricted(roles) -> bool:
    """Un compte est restreignable s'il porte un rôle du personnel
    restreignable et aucun rôle d'administration de l'établissement."""
    roles = set(roles or [])
    return bool(roles & RESTRICTABLE_ROLES) and not (roles & UNRESTRICTED_ROLES)


def assigned_cycle_ids(db: Session, *, tenant_id, user_id) -> frozenset[str]:
    """Cycles explicitement attribués au compte dans cet établissement."""
    from app.models.staff_cycle_assignment import StaffCycleAssignment

    rows = (
        db.query(StaffCycleAssignment.cycle_id)
        .filter(
            StaffCycleAssignment.tenant_id == tenant_id,
            StaffCycleAssignment.user_id == user_id,
        )
        .all()
    )
    return frozenset(str(cycle_id) for (cycle_id,) in rows)


def allowed_cycle_ids(db: Session, *, tenant_id, user: dict) -> Optional[frozenset[str]]:
    """``None`` = aucune restriction ; sinon l'ensemble (non vide) des cycles
    autorisés. Le périmètre est relu en base à chaque appel : il ne dépend
    jamais d'une revendication du jeton ni d'un en-tête du client."""
    if set(user.get("roles") or []) & UNRESTRICTED_ROLES:
        return None
    cycles = assigned_cycle_ids(db, tenant_id=tenant_id, user_id=user["id"])
    return cycles or None
