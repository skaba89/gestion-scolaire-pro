"""Shared weighted-average grading logic.

Audit stratégique (2026-08-16), incohérence #1 : deux calculs de moyenne
coexistaient dans ce dépôt — un calcul plat (`func.avg(Grade.score)` dans
crud/grade.py, exposé par `GET /grades/student/{id}/average/`) et un
calcul pondéré par coefficient de matière (`school_life.py::_compute_average`,
utilisé par les bulletins ; `transcripts.py::_summarize_subject_grades`,
utilisé par les relevés de notes). Un parent comparant les deux écrans
pouvait légitimement penser que l'un des deux affichait un chiffre faux.

Ce module extrait l'algorithme correct (déjà prouvé en production via les
bulletins) en une fonction pure unique, partagée par les trois surfaces —
pour qu'elles ne puissent plus redivenir divergentes sans qu'un test
s'en aperçoive (voir test_crud_grade.py::TestGetStudentAverageWeighting
et test_school_life.py pour la comparaison croisée).
"""
from typing import Optional
import math


def _validated_score_scale(row: dict) -> tuple[Optional[float], float]:
    """Reject corrupted grade scales before an official result is computed.

    Missing scales retain the historical /20 default; an explicitly zero,
    negative or non-finite scale is not missing and must never be silently
    interpreted as /20. A non-finite/out-of-range score is also invalid.
    """
    raw_max = row.get("max_score")
    maximum = 20.0 if raw_max is None else float(raw_max)
    if not math.isfinite(maximum) or maximum <= 0:
        raise ValueError("Le barème de la note doit être positif et fini")
    raw_score = row.get("score")
    if raw_score is None:
        return None, maximum
    score = float(raw_score)
    if not math.isfinite(score) or not 0 <= score <= maximum:
        raise ValueError("La note doit être comprise entre zéro et le barème")
    return score, maximum



def _validated_coefficient(row: dict) -> float:
    """Validate a subject coefficient; missing values keep legacy weight 1."""
    raw = row.get("coefficient")
    coefficient = 1.0 if raw is None else float(raw)
    if not math.isfinite(coefficient) or coefficient <= 0:
        raise ValueError("Le coefficient de la matière doit être positif et fini")
    return coefficient


def _validated_ects(row: dict) -> float:
    """Zero or absent ECTS is valid (non-credit subject); negatives are not."""
    raw = row.get("ects")
    ects = 0.0 if raw is None else float(raw)
    if not math.isfinite(ects) or ects < 0:
        raise ValueError("Les crédits ECTS doivent être positifs ou nuls et finis")
    return ects


def compute_weighted_average(grade_rows: list[dict]) -> Optional[float]:
    """Moyenne pondérée /20, groupée par matière puis pondérée par
    coefficient de matière.

    `grade_rows` : liste de dicts avec `subject_id` (identité stable), `subject_name`,
    `coefficient`, `score`, `max_score` (voir les requêtes SQL dans
    crud/grade.py, school_life.py:_fetch_grades_for_term et
    transcripts.py:_fetch_grades_for_term_with_ects — toutes les trois
    utilisent la même forme `COALESCE(subj.coefficient, g.coefficient, 1.0)`
    pour résoudre le coefficient : celui de la matière prime sur celui,
    ponctuel, de la note elle-même).

    Étape 1 — pour chaque matière, moyenne simple de ses propres notes
    (ramenées sur /20). Étape 2 — moyenne de ces moyennes de matière,
    pondérée par le coefficient de chaque matière.

    Retourne None si aucune ligne n'a de note exploitable (à distinguer
    d'une moyenne de 0/20, qui est une vraie moyenne) — chaque appelant
    décide de la valeur de repli adaptée à son contrat d'API.
    """
    by_subject: dict[tuple[str, str], dict] = {}
    for g in grade_rows:
        name = g.get("subject_name") or "Matière inconnue"
        # Deux matières peuvent porter le même nom. Le repli par nom ne
        # concerne que les anciennes lignes sans identifiant de matière.
        key = (("id", str(g["subject_id"])) if g.get("subject_id")
               else ("name", name))
        score, max_s = _validated_score_scale(g)
        coeff = _validated_coefficient(g)
        if key not in by_subject:
            by_subject[key] = {"scores": [], "coefficient": coeff}
        if score is not None:
            by_subject[key]["scores"].append((score, max_s))

    total_weighted = 0.0
    total_coeff = 0.0
    for data in by_subject.values():
        scores = data["scores"]
        coeff = data["coefficient"]
        if scores:
            subject_average = sum(s / m * 20 for s, m in scores) / len(scores)
            total_weighted += subject_average * coeff
            total_coeff += coeff

    if total_coeff == 0:
        return None
    return total_weighted / total_coeff


def compute_ects_weighted_average(grade_rows: list[dict]) -> Optional[float]:
    """Moyenne pondérée /20, groupée par matière puis pondérée par crédits
    ECTS (convention LMD internationale) plutôt que par coefficient.

    Module université (2026-09) : l'audit institutionnel avait relevé que
    le seul calcul lié à l'ECTS existant (transcripts.py) comptait des
    crédits acquis/non-acquis (binaire, seuil 10/20) mais ne produisait
    aucune moyenne pondérée par crédits — contrairement à
    `compute_weighted_average` ci-dessus, qui reste pondéré par
    coefficient de matière et sert de référence pour les bulletins
    scolaires classiques. Les deux coexistent délibérément : un
    établissement université utilise celui-ci pour son relevé de notes
    (transcripts.py), un établissement scolaire classique continue
    d'utiliser `compute_weighted_average` pour ses bulletins.

    `grade_rows` : même forme que `compute_weighted_average`, plus une clé
    `ects` par ligne (voir transcripts.py:_fetch_grades_for_term_with_ects).
    Une matière avec ects=0 (ou absent) n'entre pas dans le calcul — elle
    ne doit pas fausser la moyenne d'un cursus LMD où chaque UE porte un
    poids en crédits, pas en coefficient.
    """
    by_subject: dict[str, dict] = {}
    for g in grade_rows:
        name = g.get("subject_name") or "Matière inconnue"
        key = str(g["subject_id"]) if g.get("subject_id") else name
        score, max_s = _validated_score_scale(g)
        ects = _validated_ects(g)
        if key not in by_subject:
            by_subject[key] = {"scores": [], "ects": ects}
        if score is not None:
            by_subject[key]["scores"].append((score, max_s))

    total_weighted = 0.0
    total_ects = 0.0
    for data in by_subject.values():
        scores = data["scores"]
        ects = data["ects"]
        if scores and ects > 0:
            subject_average = sum(s / m * 20 for s, m in scores) / len(scores)
            total_weighted += subject_average * ects
            total_ects += ects

    if total_ects == 0:
        return None
    return total_weighted / total_ects
