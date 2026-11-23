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
vient avec les lots B2b à B2e, livrés, puis le portail de département ; le lot
B3 adapte les écrans (``cycle_pages``) et active ``CYCLE_POLICY_AVAILABLE``.
"""
from __future__ import annotations

import logging
import uuid
from functools import lru_cache
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, bindparam, column, exists, false, func, not_, or_, select, table
from sqlalchemy.orm import Session, aliased

logger = logging.getLogger(__name__)

# Rôles qui ne sont jamais limités à des cycles.
UNRESTRICTED_ROLES = frozenset({"SUPER_ADMIN", "TENANT_ADMIN"})
# Rôles auxquels un administrateur peut attribuer des cycles.
# Lot B3 (2026-11-23) : filtrage serveur (B2a–B2e, portail de département) et écrans adaptés
# (``cycle_pages``, ``GET /education/my-scope/``) livrés — l'indicateur exposé à l'interface
# passe à vrai. Point unique : toutes les réponses le lisent ici.
CYCLE_POLICY_AVAILABLE = True

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

    parsed = _uuid_set([student_id])
    if parsed is None:  # identifiant illisible : jamais dans le périmètre (404, pas 500)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Élève introuvable")
    student_id = next(iter(parsed))
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

    parsed = _uuid_set([class_id])
    if parsed is None:  # identifiant illisible : jamais dans le périmètre (404, pas 500)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classe introuvable")
    class_id = next(iter(parsed))
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


# ---------------------------------------------------------------------------
# Lot B2c-1 : scolarité (évaluations, notes, présences, devoirs, rendus).
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _raw_tables():
    """Tables sans modèle ORM (créées par ``operational_tables``), décrites par
    les seules colonnes utiles au périmètre. Import différé : ``GUID`` ne doit pas
    être chargé à l'import de ce module."""
    from app.models.base import GUID

    homework = table(
        "homework", column("id", GUID()), column("tenant_id", GUID()), column("classroom_id", GUID()),
    )
    submissions = table(
        "homework_submissions", column("id", GUID()), column("tenant_id", GUID()),
        column("homework_id", GUID()), column("student_id", GUID()),
    )
    return homework, submissions


def _uuid_set(values) -> Optional[set]:
    """Ensemble d'UUID, ou ``None`` si une valeur est absente ou invalide (un identifiant
    illisible n'est jamais dans le périmètre : l'appelant répond 404)."""
    found = set()
    for value in values:
        if value is None:
            return None
        try:
            found.add(value if isinstance(value, uuid.UUID) else uuid.UUID(str(value)))
        except (ValueError, TypeError, AttributeError):
            return None
    return found


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def require_students_in_scope(
    db: Session, tenant_id, user: dict, student_ids: Iterable, *, detail: str = "Élève introuvable",
) -> None:
    """Version « lot » de ``require_student_in_scope`` : 404 si UN SEUL élève est hors
    périmètre (tout ou rien, avant toute écriture). Sans effet pour un compte non restreint.
    ``detail`` : message du 404, pour rester identique à celui de la route quand l'objet
    n'existe pas (aucun oracle d'existence)."""
    cycles = _cycles_of(user)
    if cycles is None:
        return
    values = list(student_ids)
    if not values:
        return
    ids = _uuid_set(values)
    if ids is None:
        raise _not_found(detail)
    from app.models.student import Student

    class_ids = allowed_class_ids(db, tenant_id, cycles)
    found = db.execute(
        select(Student.id).where(
            Student.id.in_(ids),
            Student.tenant_id == tenant_id,
            student_scope_clause(Student.id, class_ids, tenant_id=tenant_id),
        )
    ).all()
    if len(found) != len(ids):
        raise _not_found(detail)


def require_classes_in_scope(
    db: Session, tenant_id, user: dict, class_ids_to_check: Iterable, *, detail: str = "Classe introuvable",
) -> None:
    """404 si UNE SEULE classe est hors périmètre ; une classe absente (``None``) l'est aussi
    pour un compte restreint (une donnée sans classe n'appartient à aucun cycle). ``detail`` :
    message du 404 (identique à celui de la route pour un objet inexistant)."""
    cycles = _cycles_of(user)
    if cycles is None:
        return
    values = list(class_ids_to_check)
    if not values:
        return
    ids = _uuid_set(values)
    if ids is None:
        raise _not_found(detail)
    from app.models.classroom import Classroom

    class_ids = allowed_class_ids(db, tenant_id, cycles)
    found = db.execute(
        select(Classroom.id).where(
            Classroom.id.in_(ids),
            Classroom.tenant_id == tenant_id,
            class_scope_clause(Classroom.id, class_ids),
        )
    ).all()
    if len(found) != len(ids):
        raise _not_found(detail)


def require_assessments_in_scope(db: Session, tenant_id, user: dict, assessment_ids: Iterable) -> None:
    """404 si UNE SEULE évaluation est hors périmètre : sa classe doit être dans le périmètre
    (une évaluation sans classe n'y est jamais). Sans effet pour un compte non restreint."""
    cycles = _cycles_of(user)
    if cycles is None:
        return
    values = list(assessment_ids)
    if not values:
        return
    ids = _uuid_set(values)
    if ids is None:
        raise _not_found("Évaluation introuvable")
    from app.models.assessment import Assessment

    class_ids = allowed_class_ids(db, tenant_id, cycles)
    found = db.execute(
        select(Assessment.id).where(
            Assessment.id.in_(ids),
            Assessment.tenant_id == tenant_id,
            class_scope_clause(Assessment.class_id, class_ids),
        )
    ).all()
    if len(found) != len(ids):
        raise _not_found("Évaluation introuvable")


def require_assessment_in_scope(db: Session, tenant_id, user: dict, assessment_id) -> None:
    """404 si l'évaluation est hors périmètre (par sa classe) ; sans effet pour un compte non restreint."""
    require_assessments_in_scope(db, tenant_id, user, [assessment_id])


def require_homework_in_scope(db: Session, tenant_id, user: dict, homework_id) -> None:
    """404 si le devoir est hors périmètre (par sa classe) ; sans effet pour un compte non restreint."""
    cycles = _cycles_of(user)
    if cycles is None:
        return
    ids = _uuid_set([homework_id])
    if ids is None:
        raise _not_found("Devoir introuvable")
    homework, _ = _raw_tables()
    class_ids = allowed_class_ids(db, tenant_id, cycles)
    found = db.execute(
        select(homework.c.id).where(
            homework.c.id.in_(ids),
            homework.c.tenant_id == tenant_id,
            class_scope_clause(homework.c.classroom_id, class_ids),
        )
    ).first()
    if found is None:
        raise _not_found("Devoir introuvable")


def require_submission_in_scope(db: Session, tenant_id, user: dict, submission_id) -> None:
    """404 si le rendu est hors périmètre : son élève ET son devoir (via la classe) doivent y
    être. Sans effet pour un compte non restreint ; aucune écriture avant ce contrôle."""
    cycles = _cycles_of(user)
    if cycles is None:
        return
    ids = _uuid_set([submission_id])
    if ids is None:
        raise _not_found("Remise introuvable")
    _, submissions = _raw_tables()
    row = db.execute(
        select(submissions.c.student_id, submissions.c.homework_id).where(
            submissions.c.id.in_(ids), submissions.c.tenant_id == tenant_id,
        )
    ).first()
    if row is None:
        raise _not_found("Remise introuvable")
    try:
        require_student_in_scope(db, tenant_id, user, row.student_id)
        require_homework_in_scope(db, tenant_id, user, row.homework_id)
    except HTTPException:
        raise _not_found("Remise introuvable") from None


def student_scope_sql(column_sql: str, class_ids: Iterable, *, tenant_id, tag: str = "sc"):
    """Équivalent de ``student_scope_clause`` pour les requêtes ``text()`` : ``(fragment, bindparams)``.

    Même règle (inscription ACTIVE, statut sans casse, année courante sinon toute ACTIVE),
    paramètres liés uniquement. ``column_sql`` et ``tag`` sont des littéraux du code
    appelant (jamais une valeur utilisateur). À utiliser avec ``text(sql).bindparams(*binds)``.
    Un test de parité compare ce fragment à ``student_scope_clause``."""
    class_ids = list(class_ids or [])
    if not class_ids:
        return "1 = 0", []
    from app.models.base import GUID

    e, y, y2 = f"{tag}_e", f"{tag}_y", f"{tag}_y2"
    sql = (
        f"EXISTS (SELECT 1 FROM enrollments {e} WHERE {e}.tenant_id = :{tag}_tid "
        f"AND {e}.student_id = {column_sql} AND {e}.class_id IN :{tag}_cls "
        f"AND UPPER({e}.status) = 'ACTIVE' "
        f"AND ({e}.academic_year_id IN (SELECT {y}.id FROM academic_years {y} "
        f"WHERE {y}.tenant_id = :{tag}_tid AND {y}.is_current IS TRUE) "
        f"OR NOT EXISTS (SELECT 1 FROM academic_years {y2} "
        f"WHERE {y2}.tenant_id = :{tag}_tid AND {y2}.is_current IS TRUE)))"
    )
    binds = [
        bindparam(f"{tag}_tid", tenant_id, type_=GUID()),
        bindparam(f"{tag}_cls", class_ids, type_=GUID(), expanding=True),
    ]
    return sql, binds


def class_scope_sql(column_sql: str, class_ids: Iterable, *, tag: str = "scc"):
    """Équivalent de ``class_scope_clause`` pour les requêtes ``text()`` : ``(fragment, bindparams)``."""
    class_ids = list(class_ids or [])
    if not class_ids:
        return "1 = 0", []
    from app.models.base import GUID

    return f"{column_sql} IN :{tag}_cls", [bindparam(f"{tag}_cls", class_ids, type_=GUID(), expanding=True)]


# ---------------------------------------------------------------------------
# Lot B2d : finances (factures, paiements, échéanciers, indicateurs).
# Une donnée financière suit son élève : visible ssi l'élève est dans le périmètre.
# ---------------------------------------------------------------------------

def student_scope_and(db: Session, tenant_id, user: dict, column_sql: str, *, tag: str = "fin"):
    """``(" AND <fragment>", binds)`` pour un compte restreint, ``("", [])`` sinon, à greffer sur
    une requête ``text()`` (``.bindparams(*binds)``). ``column_sql`` et ``tag`` sont des littéraux
    du code appelant. Paramètres liés uniquement ; un compte restreint sans classe ne voit rien."""
    if not is_cycle_restricted(user):
        return "", []
    sql, binds = student_scope_sql(column_sql, scoped_class_ids(db, tenant_id, user), tenant_id=tenant_id, tag=tag)
    return f" AND {sql}", binds


def class_scope_and(db: Session, tenant_id, user: dict, column_sql: str, *, tag: str = "cls"):
    """``(" AND <colonne> IN (classes du périmètre)", binds)`` pour un compte restreint, ``("", [])``
    sinon (lot B2e : statistiques ventilées par classe, nombre de classes ou d'enseignants).
    ``column_sql`` et ``tag`` sont des littéraux du code appelant ; périmètre vide : rien."""
    if not is_cycle_restricted(user):
        return "", []
    sql, binds = class_scope_sql(column_sql, scoped_class_ids(db, tenant_id, user), tag=tag)
    return f" AND {sql}", binds


def level_scope_and(user: dict, column_sql: str, *, tenant_id, tag: str = "lvl"):
    """``(" AND <colonne> IN (niveaux des cycles du compte)", binds)`` pour un compte restreint,
    ``("", [])`` sinon (lot B2e-3 : données rattachées à un niveau sans élève ni classe, comme
    une candidature). Une ligne sans niveau, ou dont le niveau n'a pas de cycle, est exclue.
    ``column_sql`` et ``tag`` sont des littéraux du code appelant ; paramètres liés uniquement."""
    cycles = _cycles_of(user)
    if cycles is None:
        return "", []
    cycles = list(cycles)
    if not cycles:
        return " AND 1 = 0", []
    from app.models.base import GUID

    sql = (f" AND {column_sql} IN (SELECT {tag}_l.id FROM levels {tag}_l "
           f"WHERE {tag}_l.tenant_id = :{tag}_tid AND {tag}_l.cycle_id IN :{tag}_cyc)")
    return sql, [
        bindparam(f"{tag}_tid", tenant_id, type_=GUID()),
        bindparam(f"{tag}_cyc", cycles, type_=GUID(), expanding=True),
    ]


def require_invoices_in_scope(
    db: Session, tenant_id, user: dict, invoice_ids: Iterable, *, detail: str = "Facture introuvable",
) -> None:
    """404 si UNE SEULE facture est inexistante, d'un autre établissement ou hors périmètre
    (l'élève facturé doit y être) ; tout ou rien, avant toute écriture. Sans effet pour un
    compte non restreint. ``detail`` : message du 404 de la route (aucun oracle d'existence)."""
    cycles = _cycles_of(user)
    if cycles is None:
        return
    values = list(invoice_ids)
    if not values:
        return
    ids = _uuid_set(values)
    if ids is None:
        raise _not_found(detail)
    from app.models.payment import Invoice

    class_ids = allowed_class_ids(db, tenant_id, cycles)
    found = db.execute(
        select(Invoice.id).where(
            Invoice.id.in_(ids),
            Invoice.tenant_id == tenant_id,
            student_scope_clause(Invoice.student_id, class_ids, tenant_id=tenant_id),
        )
    ).all()
    if len(found) != len(ids):
        raise _not_found(detail)


def require_invoice_in_scope(db: Session, tenant_id, user: dict, invoice_id, *, detail: str = "Facture introuvable") -> None:
    """404 si la facture est hors périmètre (par son élève) ; sans effet pour un compte non restreint."""
    require_invoices_in_scope(db, tenant_id, user, [invoice_id], detail=detail)


def require_payment_in_scope(
    db: Session, tenant_id, user: dict, payment_id, *, detail: str = "Paiement introuvable",
    with_invoice: bool = False,
) -> None:
    """404 si le paiement est inexistant, d'un autre établissement ou hors périmètre (son élève
    doit y être ; avec ``with_invoice`` la facture soldée aussi, pour une écriture qui la modifie).
    Sans effet pour un compte non restreint."""
    cycles = _cycles_of(user)
    if cycles is None:
        return
    ids = _uuid_set([payment_id])
    if ids is None:
        raise _not_found(detail)
    from app.models.payment import Payment

    row = db.execute(
        select(Payment.student_id, Payment.invoice_id).where(
            Payment.id.in_(ids), Payment.tenant_id == tenant_id,
        )
    ).first()
    if row is None:
        raise _not_found(detail)
    try:
        require_student_in_scope(db, tenant_id, user, row.student_id)
        if with_invoice and row.invoice_id is not None:
            require_invoice_in_scope(db, tenant_id, user, row.invoice_id)
    except HTTPException:
        raise _not_found(detail) from None


@lru_cache(maxsize=1)
def _schedule_table():
    """``payment_schedules`` n'a pas de modèle ORM (créée par ``operational_tables``)."""
    from app.models.base import GUID

    return table(
        "payment_schedules", column("id", GUID()), column("tenant_id", GUID()), column("invoice_id", GUID()),
    )


def require_schedule_in_scope(
    db: Session, tenant_id, user: dict, schedule_id, *, detail: str = "Échéancier introuvable",
) -> None:
    """404 si l'échéancier est hors périmètre : il n'est rattaché qu'à une facture (pas à une
    classe), il suit donc l'élève de sa facture. Sans effet pour un compte non restreint."""
    cycles = _cycles_of(user)
    if cycles is None:
        return
    ids = _uuid_set([schedule_id])
    if ids is None:
        raise _not_found(detail)
    schedules = _schedule_table()
    row = db.execute(
        select(schedules.c.invoice_id).where(schedules.c.id.in_(ids), schedules.c.tenant_id == tenant_id)
    ).first()
    if row is None or row.invoice_id is None:
        raise _not_found(detail)
    require_invoice_in_scope(db, tenant_id, user, row.invoice_id, detail=detail)
