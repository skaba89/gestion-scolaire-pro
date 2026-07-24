"""Relevé de notes (transcript) — national audit Phase 8 (mode université).

Distinct from the existing per-term bulletin (school_life.py:generate-
report-card/v2/, which prints ONE term). A transcript aggregates ALL terms
of an academic year for a student, adding an ECTS-earned total per subject
— the piece explicitly missing per the audit (Subject.ects and generic Term
already existed; only the aggregation/validation view was absent).

Deliberately scoped to structured JSON, not HTML/PDF — matches the audit's
own "ajouter progressivement" rule. HTML/PDF rendering can reuse this data
later following the exact pattern already proven in generate-report-card/v2/
(see school_life.py:_build_bulletin_v2) rather than being built twice now.

Validation rule (ECTS earned): a subject's credits count as earned once its
term average is >= 10/20 — the standard pass threshold already used
elsewhere in this codebase's grading logic (school_life.py:_compute_average
computes averages on the same /20 scale). Not configurable per-tenant yet;
flagged in the docstring below for a future settings-driven threshold.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission

router = APIRouter()

PASS_THRESHOLD = 10.0  # /20 — see module docstring


def _fetch_terms_for_year(db: Session, academic_year_id: str, tenant_id: str) -> list:
    return db.execute(text("""
        SELECT id, name, sequence_number
        FROM terms
        WHERE academic_year_id = :ay AND tenant_id = :tid
        ORDER BY sequence_number
    """), {"ay": academic_year_id, "tid": tenant_id}).mappings().all()


def _fetch_grades_for_term_with_ects(db: Session, student_id: str, term_id: str, tenant_id: str) -> list:
    """Same join shape as school_life.py:_fetch_grades_for_term, plus
    subj.ects — kept as a separate query rather than modifying the existing
    one, so the proven bulletin-generation path is never touched."""
    return db.execute(text("""
        SELECT
            COALESCE(subj.name, 'Matière inconnue') AS subject_name,
            COALESCE(subj.coefficient, g.coefficient, 1.0) AS coefficient,
            COALESCE(subj.ects, 0) AS ects,
            g.score,
            g.max_score
        FROM grades g
        JOIN assessments a ON g.assessment_id = a.id
        LEFT JOIN subjects subj ON a.subject_id = subj.id
        WHERE g.student_id = :sid
          AND g.tenant_id = :tid
          AND a.term_id = :term_id
    """), {"sid": student_id, "term_id": term_id, "tid": tenant_id}).mappings().all()


def _summarize_subject_grades(grades: list) -> list:
    """Group raw grade rows by subject: {name, coefficient, ects, average, passed}."""
    by_subject: dict = {}
    for g in grades:
        name = g["subject_name"]
        if name not in by_subject:
            by_subject[name] = {
                "subject_name": name,
                "coefficient": float(g["coefficient"] or 1),
                "ects": float(g["ects"] or 0),
                "_scores": [],
            }
        if g["score"] is not None:
            max_s = float(g["max_score"] or 20)
            by_subject[name]["_scores"].append(float(g["score"]) / max_s * 20)

    summary = []
    for data in by_subject.values():
        scores = data.pop("_scores")
        average = round(sum(scores) / len(scores), 2) if scores else None
        data["average"] = average
        data["passed"] = average is not None and average >= PASS_THRESHOLD
        summary.append(data)
    return summary


@router.get("/{student_id}/")
def get_student_transcript(
    student_id: UUID,
    academic_year_id: UUID = Query(..., description="Année académique à couvrir"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
):
    """Relevé de notes complet pour une année académique : détail par
    période (trimestre/semestre) et par matière/UE, avec ECTS acquis.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Contexte établissement requis")

    student = db.execute(text("""
        SELECT first_name, last_name, registration_number
        FROM students WHERE id = :sid AND tenant_id = :tid
    """), {"sid": str(student_id), "tid": tenant_id}).mappings().first()
    if not student:
        raise HTTPException(status_code=404, detail="Élève/étudiant introuvable")

    terms = _fetch_terms_for_year(db, str(academic_year_id), tenant_id)
    if not terms:
        raise HTTPException(status_code=404, detail="Aucune période trouvée pour cette année académique")

    periods = []
    total_ects_earned = 0.0
    total_ects_possible = 0.0
    term_averages = []

    for term in terms:
        grades = _fetch_grades_for_term_with_ects(db, str(student_id), str(term["id"]), tenant_id)
        subjects = _summarize_subject_grades(grades)

        for subj in subjects:
            total_ects_possible += subj["ects"]
            if subj["passed"]:
                total_ects_earned += subj["ects"]

        averages_with_coeff = [(s["average"], s["coefficient"]) for s in subjects if s["average"] is not None]
        term_average = (
            round(sum(avg * coeff for avg, coeff in averages_with_coeff) / sum(c for _, c in averages_with_coeff), 2)
            if averages_with_coeff else None
        )
        if term_average is not None:
            term_averages.append(term_average)

        periods.append({
            "term_id": str(term["id"]),
            "term_name": term["name"],
            "subjects": subjects,
            "term_average": term_average,
        })

    return {
        "student": {
            "id": str(student_id),
            "first_name": student["first_name"],
            "last_name": student["last_name"],
            "registration_number": student["registration_number"],
        },
        "academic_year_id": str(academic_year_id),
        "periods": periods,
        "annual_average": round(sum(term_averages) / len(term_averages), 2) if term_averages else None,
        "ects_earned": total_ects_earned,
        "ects_possible": total_ects_possible,
    }
