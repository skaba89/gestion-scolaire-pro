"""Presets pour le système éducatif guinéen.

Valeurs par défaut proposées à la création d'un établissement — modifiables
ensuite depuis les réglages (jamais imposées).
"""

# ─── Niveaux par type d'établissement ────────────────────────────────────────
# Système guinéen : Primaire (CP1→CM2), Collège (7ème→10ème),
# Lycée (11ème, 12ème, Terminale), Université (LMD).
GUINEA_LEVELS_BY_TYPE: dict[str, list[str]] = {
    "primary": ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"],
    "middle": ["7ème", "8ème", "9ème", "10ème"],
    "high": ["11ème", "12ème", "Terminale"],
    "university": ["Licence 1", "Licence 2", "Licence 3", "Master 1", "Master 2"],
    # Centre/institut de formation : cycles génériques
    "training": ["Année 1", "Année 2", "Année 3"],
}

# École "complète" (par défaut si type inconnu) : primaire + collège + lycée
GUINEA_LEVELS_FULL: list[str] = (
    GUINEA_LEVELS_BY_TYPE["primary"]
    + GUINEA_LEVELS_BY_TYPE["middle"]
    + GUINEA_LEVELS_BY_TYPE["high"]
)


def guinea_levels_for_type(school_type: str | None) -> list[str]:
    """Retourne les niveaux guinéens par défaut pour un type d'établissement."""
    if not school_type:
        return GUINEA_LEVELS_FULL
    return GUINEA_LEVELS_BY_TYPE.get(school_type.lower(), GUINEA_LEVELS_FULL)


# ─── Types de frais scolaires ────────────────────────────────────────────────
GUINEA_FEE_TYPES: list[dict] = [
    {"code": "inscription", "label": "Frais d'inscription"},
    {"code": "reinscription", "label": "Frais de réinscription"},
    {"code": "mensualite", "label": "Mensualité"},
    {"code": "transport", "label": "Transport"},
    {"code": "cantine", "label": "Cantine"},
    {"code": "tenue", "label": "Tenue scolaire"},
    {"code": "fournitures", "label": "Fournitures"},
    {"code": "examen", "label": "Frais d'examen"},
]

# ─── Année scolaire guinéenne : 1er septembre → 31 juillet ───────────────────
ACADEMIC_YEAR_START_MONTH = 9   # septembre
ACADEMIC_YEAR_START_DAY = 1
ACADEMIC_YEAR_END_MONTH = 7     # juillet
ACADEMIC_YEAR_END_DAY = 31

# ─── Défauts pays ────────────────────────────────────────────────────────────
DEFAULT_COUNTRY = "GN"
DEFAULT_CURRENCY = "GNF"
DEFAULT_TIMEZONE = "Africa/Conakry"
