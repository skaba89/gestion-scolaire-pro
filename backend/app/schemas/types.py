"""Types de champs partagés par les schémas d'entrée."""
from typing import Annotated
from uuid import UUID

from pydantic import AfterValidator


def _canonical_uuid(value: str) -> str:
    """Refuse (422) un identifiant qui n'est pas un UUID ; le renvoie normalisé.

    2026-11-11 (CRAWL-W) : des champs `*_id` déclarés `str` laissaient une
    valeur quelconque atteindre PostgreSQL, et la route répondait 500. Le
    type reste `str` pour ne rien changer au code qui consomme ces champs.
    """
    try:
        return str(UUID(str(value)))
    except ValueError:
        raise ValueError("identifiant invalide (UUID attendu)")


UUIDStr = Annotated[str, AfterValidator(_canonical_uuid)]
