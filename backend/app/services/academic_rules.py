"""Règles académiques d'un établissement : moyenne de passage et seuils de
mention, appliquées par les bulletins et les relevés (2026-11-04).

Avant : la page « Règles académiques » n'enregistrait rien (aucune route) et
les seuils étaient écrits en dur, en double, dans school_life.py
(_grade_mention / _grade_mention_v2) et transcripts.py (PASS_THRESHOLD).

Stockage : `tenants.settings["academic_rules"]` —
    {"default": {"passing_grade": 10, "mentions": [{"label": "Assez Bien", "min": 12}, …]},
     "levels":  {"<level_id>": {…mêmes clés…}}}
Les valeurs par défaut reproduisent exactement l'ancien comportement : un
établissement qui ne configure rien obtient les mêmes bulletins qu'avant.

Les règles sont REVALIDÉES à la lecture : une valeur corrompue (écrite par
une ancienne version, ou à la main en base) est ignorée et journalisée, et
l'on revient aux valeurs par défaut — jamais un bulletin faux ni une erreur.
"""
from __future__ import annotations

import copy
import logging
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

SCALE_MAX = 20.0
SETTINGS_KEY = "academic_rules"

# Libellés fixes (vocabulaire des bulletins) ; seuls les seuils se règlent.
MENTION_LABELS = ("Assez Bien", "Bien", "Très Bien", "Excellent")
PASSING_LABEL = "Passable"
FAILING_LABEL = "Insuffisant"

DEFAULT_RULES: dict = {
    "passing_grade": 10.0,
    "mentions": [
        {"label": "Assez Bien", "min": 12.0},
        {"label": "Bien", "min": 14.0},
        {"label": "Très Bien", "min": 16.0},
        {"label": "Excellent", "min": 18.0},
    ],
}


class InvalidRules(ValueError):
    """Règles refusées (message en français, renvoyé tel quel au client)."""


def validate_rules(raw: dict) -> dict:
    """Règles normalisées, ou InvalidRules. Contraintes :
    0 < passage ≤ 20 ; une valeur par mention connue ; seuils strictement
    croissants, tous > passage et ≤ 20."""
    if not isinstance(raw, dict):
        raise InvalidRules("Règles invalides")
    try:
        passing = float(raw.get("passing_grade"))
    except (TypeError, ValueError):
        raise InvalidRules("La moyenne de passage doit être un nombre")
    if not 0 < passing <= SCALE_MAX:
        raise InvalidRules(f"La moyenne de passage doit être comprise entre 0 et {SCALE_MAX:g}")

    given = {m.get("label"): m.get("min") for m in (raw.get("mentions") or []) if isinstance(m, dict)}
    if set(given) != set(MENTION_LABELS):
        raise InvalidRules("Les mentions attendues sont : " + ", ".join(MENTION_LABELS))
    mentions, previous = [], passing
    for label in MENTION_LABELS:
        try:
            value = float(given[label])
        except (TypeError, ValueError):
            raise InvalidRules(f"Seuil de la mention « {label} » invalide")
        if not previous < value <= SCALE_MAX:
            raise InvalidRules(
                f"Le seuil de « {label} » ({value:g}) doit être supérieur au précédent ({previous:g}) "
                f"et au plus {SCALE_MAX:g}"
            )
        mentions.append({"label": label, "min": value})
        previous = value
    return {"passing_grade": passing, "mentions": mentions}


def _stored(db: Session, tenant_id: str) -> dict:
    # ORM (type GUID) : fonctionne sur PostgreSQL ET SQLite (tests des bulletins).
    from app.models.tenant import Tenant
    row = db.query(Tenant.settings).filter(Tenant.id == str(tenant_id)).first()
    settings = (row[0] if row else None) or {}
    value = settings.get(SETTINGS_KEY) if isinstance(settings, dict) else None
    return value if isinstance(value, dict) else {}


def _safe(raw, *, tenant_id: str, where: str) -> Optional[dict]:
    if not raw:
        return None
    try:
        return validate_rules(raw)
    except InvalidRules as exc:
        logger.warning("Règles académiques ignorées (tenant=%s, %s) : %s", tenant_id, where, exc)
        return None


def effective_rules(db: Session, tenant_id: str, level_id: Optional[str] = None) -> dict:
    """Règles à appliquer : celles du niveau, sinon celles de l'établissement,
    sinon les valeurs par défaut."""
    stored = _stored(db, tenant_id)
    if level_id:
        per_level = _safe((stored.get("levels") or {}).get(str(level_id)), tenant_id=tenant_id, where=f"niveau {level_id}")
        if per_level:
            return per_level
    return _safe(stored.get("default"), tenant_id=tenant_id, where="défaut") or copy.deepcopy(DEFAULT_RULES)


def mention_for(average: float, rules: Optional[dict] = None) -> str:
    rules = rules or DEFAULT_RULES
    for m in reversed(rules["mentions"]):
        if average >= m["min"]:
            return m["label"]
    return PASSING_LABEL if average >= rules["passing_grade"] else FAILING_LABEL


def is_passing(average: Optional[float], rules: Optional[dict] = None) -> bool:
    rules = rules or DEFAULT_RULES
    return average is not None and average >= rules["passing_grade"]


def _bien(rules: dict) -> float:
    return next(m["min"] for m in rules["mentions"] if m["label"] == "Bien")


def grade_color(average: float, rules: Optional[dict] = None) -> str:
    """Couleur du texte : vert dès « Bien », bleu au-dessus du passage, ambre
    juste en dessous (2 points), rouge sinon — mêmes couleurs qu'avant."""
    rules = rules or DEFAULT_RULES
    if average >= _bien(rules):
        return "#166534"
    if average >= rules["passing_grade"]:
        return "#1d4ed8"
    if average >= rules["passing_grade"] - 2:
        return "#92400e"
    return "#991b1b"


def mention_background(average: float, rules: Optional[dict] = None) -> str:
    rules = rules or DEFAULT_RULES
    if average >= _bien(rules):
        return "#dcfce7"
    if average >= rules["passing_grade"]:
        return "#dbeafe"
    if average >= rules["passing_grade"] - 2:
        return "#fef3c7"
    return "#fee2e2"
