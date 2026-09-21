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


def compute_weighted_average(grade_rows: list[dict]) -> Optional[float]:
    """Moyenne pondérée /20, groupée par matière puis pondérée par
    coefficient de matière.

    `grade_rows` : liste de dicts avec au minimum `subject_name`,
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
    by_subject: dict[str, dict] = {}
    for g in grade_rows:
        name = g.get("subject_name") or "Matière inconnue"
        score = g.get("score")
        max_s = float(g.get("max_score") or 20)
        coeff = float(g.get("coefficient") or 1)
        if name not in by_subject:
            by_subject[name] = {"scores": [], "coefficient": coeff}
        if score is not None:
            by_subject[name]["scores"].append((float(score), max_s))

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
        score = g.get("score")
        max_s = float(g.get("max_score") or 20)
        ects = float(g.get("ects") or 0)
        if name not in by_subject:
            by_subject[name] = {"scores": [], "ects": ects}
        if score is not None:
            by_subject[name]["scores"].append((float(score), max_s))

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
