"""Audit read-only des inscriptions ACTIVE en double, établissement par établissement.

Exécution :
  cd backend
  python -m app.scripts.audit_duplicate_enrollments --tenant-id <UUID>

Code retour 0 : aucun groupe en double ; 2 : doublons ; 1 : erreur.
Ne modifie aucune inscription ni le schéma.
"""
from __future__ import annotations

import argparse

from app.core.database import worker_db_session
from app.services.enrollment_integrity import find_duplicate_active_enrollments


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit en lecture seule des inscriptions actives")
    parser.add_argument("--tenant-id", required=True, help="UUID de l'établissement à auditer")
    args = parser.parse_args()

    with worker_db_session(args.tenant_id) as db:
        duplicate_groups = find_duplicate_active_enrollments(db, args.tenant_id)

    if not duplicate_groups:
        print("OK : aucun doublon d'inscription active détecté pour cet établissement.")
        return 0

    print(f"ALERTE : {len(duplicate_groups)} groupe(s) d'inscriptions actives en double.")
    for row in duplicate_groups:
        print(
            f"student_id={row['student_id']} academic_year_id={row['academic_year_id']} "
            f"inscriptions={row['active_enrollments']} classes={row['distinct_classes']}"
        )
    print("Aucune donnée modifiée. Réconcilier les dossiers avant toute contrainte unique.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
