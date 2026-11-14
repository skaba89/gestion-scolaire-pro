"""Functional modules and institution profiles; existing business services stay authoritative.

Course modules (e-learning lessons) are deliberately a different concept. Plan
entitlements and RBAC are checked separately: enabling a module grants no role.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from types import MappingProxyType
from typing import Mapping


@dataclass(frozen=True)
class EducationModule:
    id: str
    label: str
    core: bool = False
    dependencies: tuple[str, ...] = ()
    available: bool = True


_MODULES = (
    EducationModule("authentication", "Authentification", core=True),
    EducationModule("users", "Utilisateurs", core=True),
    EducationModule("institutions", "Établissements", core=True),
    EducationModule("security", "Sécurité", core=True),
    EducationModule("finance", "Finances", core=True),
    EducationModule("notifications", "Notifications et communication", core=True),
    EducationModule("audit", "Audit", core=True),
    EducationModule("reporting", "Reporting", core=True),
    EducationModule("academics", "Scolarité"),
    EducationModule("admissions", "Admissions", dependencies=("academics",)),
    EducationModule("assessments", "Notes et évaluations", dependencies=("academics",)),
    EducationModule("attendance", "Présences", dependencies=("academics",)),
    EducationModule("schedule", "Emploi du temps", dependencies=("academics",)),
    EducationModule("homework", "Devoirs", dependencies=("academics",)),
    EducationModule("lmd", "Semestres et crédits LMD", dependencies=("assessments",)),
    EducationModule("elearning", "Cours en ligne", dependencies=("academics",)),
    EducationModule("library", "Bibliothèque"),
    EducationModule("student_life", "Vie scolaire", dependencies=("academics",)),
    EducationModule("hr", "Ressources humaines"),
    EducationModule("inventory", "Stocks et commandes", dependencies=("finance",)),
    EducationModule("ai", "Assistance IA", dependencies=("reporting",)),
    # A catalogue entry is not an implementation. Never let an administrator
    # activate a capability whose actual business service does not exist.
    EducationModule("competencies", "Référentiels et évaluations par compétences", available=False),
)
MODULES: Mapping[str, EducationModule] = MappingProxyType({m.id: m for m in _MODULES})
CORE_MODULES = frozenset(m.id for m in _MODULES if m.core)
AVAILABLE_MODULES = frozenset(m.id for m in _MODULES if m.available)
_SCHOOL = AVAILABLE_MODULES - {"lmd"}
_PRESCHOOL = CORE_MODULES | {"academics", "admissions", "attendance", "schedule", "library", "student_life", "hr", "inventory"}


@dataclass(frozen=True)
class InstitutionProfile:
    id: str
    label: str
    default_modules: frozenset[str]
    period_type: str
    learner_term: str


_PROFILES = (
    InstitutionProfile("preschool", "Maternelle", _PRESCHOOL, "TRIMESTER", "élève"),
    InstitutionProfile("primary", "Primaire", _SCHOOL, "TRIMESTER", "élève"),
    InstitutionProfile("middle", "Collège", _SCHOOL, "TRIMESTER", "élève"),
    InstitutionProfile("high", "Lycée", _SCHOOL, "TRIMESTER", "élève"),
    InstitutionProfile("university", "Université", AVAILABLE_MODULES, "SEMESTER", "étudiant"),
    InstitutionProfile("higher_education", "École supérieure", AVAILABLE_MODULES, "SEMESTER", "étudiant"),
    InstitutionProfile("training", "Centre de formation", _SCHOOL, "CUSTOM", "apprenant"),
    InstitutionProfile("vocational", "Formation professionnelle", _SCHOOL, "CUSTOM", "apprenant"),
    InstitutionProfile("mixed", "Établissement mixte multi-cycles", AVAILABLE_MODULES, "PER_CYCLE", "apprenant"),
)
PROFILES: Mapping[str, InstitutionProfile] = MappingProxyType({p.id: p for p in _PROFILES})
VALID_INSTITUTION_TYPES = frozenset(PROFILES)


class InvalidModuleConfiguration(ValueError):
    pass


def validate_institution_type(value: str) -> str:
    """Canonical creation values; existing database rows are never rewritten."""
    if not isinstance(value, str) or value not in PROFILES:
        raise ValueError("Type d'établissement invalide. Valeurs acceptées : " + ", ".join(sorted(PROFILES)))
    return value


def proposed_profile(legacy_type: str | None) -> str:
    """A preview suggestion, never an implicit migration of existing tenants."""
    value = (legacy_type or "").lower()
    aliases = {"higher_education": "higher_education", "institute": "higher_education",
               "bts": "higher_education", "iut": "higher_education",
               "training_center": "training", "elementary": "primary", "lycee": "high"}
    return value if value in PROFILES else aliases.get(value, "mixed")


def resolve_modules(profile_id: str, overrides: Mapping[str, bool] | None = None) -> frozenset[str]:
    """Validate a complete choice. Missing dependencies are never silently enabled."""
    if profile_id not in PROFILES:
        raise InvalidModuleConfiguration("Profil d'établissement inconnu")
    enabled = set(PROFILES[profile_id].default_modules)
    for module_id, active in (overrides or {}).items():
        module = MODULES.get(module_id)
        if module is None or type(active) is not bool:
            raise InvalidModuleConfiguration("Module ou valeur d'activation invalide : " + module_id)
        if module.core and not active:
            raise InvalidModuleConfiguration("Le socle commun ne peut pas être désactivé : " + module_id)
        if active and not module.available:
            raise InvalidModuleConfiguration("Fonctionnalité non disponible : " + module_id)
        if active:
            enabled.add(module_id)
        else:
            enabled.discard(module_id)
    for module_id in sorted(enabled):
        missing = set(MODULES[module_id].dependencies) - enabled
        if missing:
            raise InvalidModuleConfiguration(f"{module_id} nécessite : {', '.join(sorted(missing))}")
    return frozenset(enabled)


def catalog_payload() -> dict:
    from app.core.guinea_presets import guinea_levels_for_type
    return {
        "catalog_version": 1,
        "modules": [asdict(m) for m in _MODULES],
        "profiles": [{**asdict(p), "default_modules": sorted(p.default_modules),
                      "default_levels": guinea_levels_for_type(p.id)} for p in _PROFILES],
    }
