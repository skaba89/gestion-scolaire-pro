"""Périmètre d'un enseignant : « enseigne-t-il cette classe ? »

Règle unique (2026-10-12) pour les présences, les inscriptions et les
évaluations. Avant, les présences s'appuyaient sur l'emploi du temps
(`schedule`) et les notes sur les affectations (`teacher_assignments`) : un
enseignant affecté mais absent de l'emploi du temps pouvait saisir une
présence puis ne plus la corriger (403), et la création de présence ne
vérifiait aucune classe.

Un enseignant enseigne une classe s'il y est affecté OU s'il y a un créneau
d'emploi du temps — deux tables alimentées par l'administration. Quand la
matière compte (évaluations), la ligne doit porter sur cette matière ou
n'en préciser aucune.
"""
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# Rôles qui ne sont jamais restreints à « leurs » classes.
PRIVILEGED_SCOPE_ROLES = frozenset({
    "SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "DEPARTMENT_HEAD", "SECRETARY", "STAFF",
})


def is_scoped_teacher(user: dict) -> bool:
    """Enseignant non privilégié : son accès se limite à ses classes."""
    roles = set(user.get("roles") or [])
    return "TEACHER" in roles and not (roles & PRIVILEGED_SCOPE_ROLES)


def teacher_teaches_class(db: Session, *, tenant_id: str, user_id: str,
                          class_id: Optional[str], subject_id: Optional[str] = None) -> bool:
    if not class_id or not user_id:
        return False
    row = db.execute(text("""
        SELECT 1 FROM teacher_assignments
        WHERE tenant_id = CAST(:tid AS uuid) AND user_id = CAST(:uid AS uuid)
          AND classroom_id = CAST(:cid AS uuid)
          AND (CAST(:sid AS uuid) IS NULL OR subject_id IS NULL OR subject_id = CAST(:sid AS uuid))
        UNION ALL
        SELECT 1 FROM schedule
        WHERE tenant_id = CAST(:tid AS uuid) AND teacher_id = CAST(:uid AS uuid)
          AND class_id = CAST(:cid AS uuid)
          AND (CAST(:sid AS uuid) IS NULL OR subject_id IS NULL OR subject_id = CAST(:sid AS uuid))
        LIMIT 1
    """), {"tid": str(tenant_id), "uid": str(user_id), "cid": str(class_id),
           "sid": str(subject_id) if subject_id else None}).first()
    return row is not None
