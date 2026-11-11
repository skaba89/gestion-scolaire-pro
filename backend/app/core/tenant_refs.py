"""Contrôle d'appartenance des identifiants reçus du client (anti-IDOR).

Une contrainte de clé étrangère PostgreSQL est vérifiée sans RLS : un
identifiant d'un AUTRE établissement passe la contrainte. Toute FK reçue du
client doit donc être vérifiée explicitement contre le tenant courant
(règle d'or n°2, CLAUDE.md).

Origine (2026-11-11) : le parcours des routes d'écriture (CRAWL-W) a montré
qu'une salle pouvait être rattachée au campus d'un autre établissement
(POST /rooms/ → 201), et la même lacune sur une quinzaine d'autres FK.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.models.base import GUID

# Table → libellé du message d'erreur. Liste fermée : le nom de table est
# interpolé dans la requête, il ne doit jamais venir d'une entrée client.
_REF_TABLES = {
    "academic_years": "Année académique",
    "assessments": "Évaluation",
    "campuses": "Campus",
    "check_in_sessions": "Séance de pointage",
    "classes": "Classe",
    "employees": "Employé",
    "faculties": "Faculté",
    "inventory_categories": "Catégorie d'inventaire",
    "levels": "Niveau",
    "library_categories": "Catégorie",
    "rooms": "Salle",
    "semesters": "Semestre",
    "students": "Élève",
    "subjects": "Matière",
    "terms": "Période",
    "users": "Utilisateur",
}


def ensure_in_tenant(db: Session, tenant_id: Any, table: str, value: Optional[Any]) -> None:
    """404 si `value` (non vide) n'est pas une ligne de `table` du tenant courant."""
    if value is None or value == "":
        return
    label = _REF_TABLES.get(table)
    if label is None:
        raise RuntimeError(f"Table non autorisée pour ensure_in_tenant : {table}")
    try:
        value = uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=422, detail=f"{label} : identifiant invalide")
    stmt = text(f"SELECT 1 FROM {table} WHERE id = :id AND tenant_id = :tid").bindparams(
        bindparam("id", type_=GUID()), bindparam("tid", type_=GUID()),
    )
    row = db.execute(stmt, {"id": str(value), "tid": str(tenant_id)}).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"{label} introuvable dans cet établissement")


def ensure_refs_in_tenant(db: Session, tenant_id: Any, *refs: tuple[str, Optional[Any]]) -> None:
    """Applique ensure_in_tenant à chaque couple (table, identifiant)."""
    for table, value in refs:
        ensure_in_tenant(db, tenant_id, table, value)
