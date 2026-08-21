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
