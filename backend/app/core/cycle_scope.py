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

Ce module calcule le périmètre et fournit les briques de filtrage. Le refus
par défaut des routes non classées est appliqué par ``get_current_user``
(lot B2a, registre ``cycle_routes``) ; le filtrage des routes de données
vient avec les lots B2b à B2e (B2b livré : élèves, classes, inscriptions).
Tant que ces lots ne sont pas livrés,
``cycle_policy_available`` reste ``False``.
"""
from __future__ import annotations

import logging
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, exists, false, func, not_, or_, select
from sqlalchemy.orm import Session, aliased

logger = logging.getLogger(__name__)

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


# Rôles pour lesquels la garde n'interroge jamais la base : aucun compte
# d'élève, de parent ou d'ancien élève ne reçoit d'affectation de cycle.
NEVER_RESTRICTED_ROLES = frozenset({"STUDENT", "PARENT", "ALUMNI"})


def needs_cycle_lookup(roles) -> bool:
    """Faut-il lire les affectations de ce compte ? (garde de ``get_current_user``)

    Sortie rapide, sans requête, pour les administrateurs d'établissement et
    pour les comptes uniquement élève/parent/ancien. Tout autre compte est
    consulté, y compris un TEACHER seul : une affectation résiduelle sur un
    compte devenu non restreignable le garde restreint (comportement
    d'``allowed_cycle_ids``, décision Q5). Un TEACHER sans affectation, cas
    normal, reste sans restriction."""
    roles = set(roles or [])
    if roles & UNRESTRICTED_ROLES:
        return False
    if roles <= NEVER_RESTRICTED_ROLES:
        return False
    return True


def allowed_class_ids(db: Session, tenant_id, cycles) -> list:
    """Classes de l'établissement dont le niveau appartient à un des cycles.
    Une classe sans niveau, ou dont le niveau n'a pas de cycle, n'en fait
    jamais partie."""
    from app.models.classroom import Classroom
    from app.models.level import Level

    cycles = list(cycles or [])
    if not cycles:
        return []
    rows = db.execute(
        select(Classroom.id)
        .join(Level, and_(Level.id == Classroom.level_id, Level.tenant_id == Classroom.tenant_id))
        .where(
            Classroom.tenant_id == tenant_id,
            Level.cycle_id.in_(cycles),
        )
    ).all()
    return [class_id for (class_id,) in rows]


def student_scope_clause(column, class_ids: Iterable, *, tenant_id):
    """Condition SQL « cet élève est inscrit dans une des classes du périmètre ».

    ``column`` est la colonne d'identifiant d'élève de la requête appelante
    (fixée par le code, jamais par l'utilisateur). Inscription retenue
    (décision Q1) : statut ``ACTIVE`` de l'année courante ; s'il n'existe pas
    d'année courante, toute inscription ``ACTIVE``. Périmètre vide : rien."""
    from app.models.academic_year import AcademicYear
    from app.models.enrollment import Enrollment

    class_ids = list(class_ids or [])
    if not class_ids:
        return false()
    current_years = select(AcademicYear.id).where(
        AcademicYear.tenant_id == tenant_id, AcademicYear.is_current.is_(True)
    )
    has_current_year = exists(current_years)
    # Alias : si ``column`` appartient déjà à ``Enrollment`` (listes d'inscriptions), la
    # sous-requête ne doit pas être corrélée à la ligne externe (même table).
    enrolled = aliased(Enrollment)
    return exists().where(
        enrolled.tenant_id == tenant_id,
        enrolled.student_id == column,
        enrolled.class_id.in_(class_ids),
        func.upper(enrolled.status) == "ACTIVE",
        or_(enrolled.academic_year_id.in_(current_years), not_(has_current_year)),
    )


def class_scope_clause(column, class_ids: Iterable):
    """Condition SQL « cette classe est dans le périmètre » (``column`` fixée par le code)."""
    class_ids = list(class_ids or [])
    if not class_ids:
        return false()
    return column.in_(class_ids)


def _cycles_of(user: dict):
    """``_cycle_ids`` du dictionnaire utilisateur : ``None`` explicite = non
    restreint. Clé absente (dict construit hors ``get_current_user``) =
    erreur : jamais interprétée comme « non restreint » (fail-closed)."""
    if "_cycle_ids" not in user:
        logger.error("Périmètre par cycle indisponible : clé _cycle_ids absente du contexte utilisateur")
        raise RuntimeError("_cycle_ids absent du contexte utilisateur : périmètre par cycle non résolu")
    return user["_cycle_ids"]


def is_cycle_restricted(user: dict) -> bool:
    """Le compte est-il limité à des cycles ? (échec fermé si la clé est absente)"""
    return _cycles_of(user) is not None


def scoped_class_ids(db: Session, tenant_id, user: dict) -> Optional[list]:
    """``None`` = compte non restreint (aucun filtre) ; sinon la liste, éventuellement
    vide, des classes du périmètre, à passer aux paramètres ``scope_class_ids`` du
    CRUD ou aux briques ``*_scope_clause``."""
    cycles = _cycles_of(user)
    if cycles is None:
        return None
    return allowed_class_ids(db, tenant_id, cycles)


def require_student_in_scope(db: Session, tenant_id, user: dict, student_id) -> None:
    """404 si l'élève est hors périmètre ; sans effet pour un compte non restreint.
    404 (et non 403) pour ne pas révéler l'existence d'un élève d'un autre cycle."""
    cycles = _cycles_of(user)
    if cycles is None:
        return
    from app.models.student import Student

    class_ids = allowed_class_ids(db, tenant_id, cycles)
    found = db.execute(
        select(Student.id).where(
            Student.id == student_id,
            Student.tenant_id == tenant_id,
            student_scope_clause(Student.id, class_ids, tenant_id=tenant_id),
        )
    ).first()
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Élève introuvable")


def require_class_in_scope(db: Session, tenant_id, user: dict, class_id) -> None:
    """404 si la classe est hors périmètre ; sans effet pour un compte non restreint."""
    cycles = _cycles_of(user)
    if cycles is None:
        return
    from app.models.classroom import Classroom

    class_ids = allowed_class_ids(db, tenant_id, cycles)
    found = db.execute(
        select(Classroom.id).where(
            Classroom.id == class_id,
            Classroom.tenant_id == tenant_id,
            class_scope_clause(Classroom.id, class_ids),
        )
    ).first()
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classe introuvable")


def require_enrollment_in_scope(db: Session, tenant_id, user: dict, enrollment_id) -> None:
    """404 si l'inscription est hors périmètre ; sans effet pour un compte non
    restreint. Il faut les DEUX conditions : sa classe est dans le périmètre ET
    son élève y est (inscription ACTIVE de l'année courante dans un cycle du compte) :
    une inscription résiduelle d'un élève ailleurs n'est pas modifiable."""
    cycles = _cycles_of(user)
    if cycles is None:
        return
    from app.models.enrollment import Enrollment

    class_ids = allowed_class_ids(db, tenant_id, cycles)
    found = db.execute(
        select(Enrollment.id).where(
            Enrollment.id == enrollment_id,
            Enrollment.tenant_id == tenant_id,
            class_scope_clause(Enrollment.class_id, class_ids),
            student_scope_clause(Enrollment.student_id, class_ids, tenant_id=tenant_id),
        )
    ).first()
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inscription introuvable")
