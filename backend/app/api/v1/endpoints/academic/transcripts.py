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

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.services.academic_rules import effective_rules
from app.services.grading import compute_ects_weighted_average

router = APIRouter()

PASS_THRESHOLD = 10.0  # /20 — valeur par défaut ; l'établissement peut la régler
# (Paramètres → Règles académiques, services/academic_rules.py).


def _can_view_transcript(db: Session, *, current_user: dict, student_id: str, tenant_id: str) -> bool:
    """SECURITY FIX (institutional-readiness audit, 2026-09): this endpoint
    had no ownership check at all — grades:read is held tenant-wide by
    STUDENT and PARENT (app/core/security.py), so any student or parent
    could read any other student's full transcript by guessing/enumerating
    a UUID. Same restriction as grades.py's list_grades: STUDENT sees only
    their own, PARENT only their own children's; everyone else with
    grades:read (staff/teachers/admin) is unrestricted."""
    roles = set(current_user.get("roles", []))
    privileged = roles & {"SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "TEACHER",
                          "DEPARTMENT_HEAD", "SECRETARY", "STAFF"}
    if privileged:
        return True
    user_id = current_user.get("id")
    if roles & {"STUDENT", "ALUMNI"}:
        row = db.execute(text(
            "SELECT id FROM students WHERE id = :sid AND tenant_id = :tid "
            "AND (user_id = :uid OR email = (SELECT email FROM users WHERE id = :uid))"
        ), {"sid": student_id, "tid": tenant_id, "uid": user_id}).first()
        if row:
            return True
    if "PARENT" in roles:
        row = db.execute(text(
            "SELECT 1 FROM parent_students WHERE tenant_id = :tid AND parent_id = :uid AND student_id = :sid"
        ), {"tid": tenant_id, "uid": user_id, "sid": student_id}).first()
        if row:
            return True
    return False


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
            a.subject_id AS subject_id,
            COALESCE(subj.name, 'Matière inconnue') AS subject_name,
            COALESCE(subj.coefficient, g.coefficient, 1.0) AS coefficient,
            COALESCE(subj.ects, 0) AS ects,
            g.score,
            g.max_score
        FROM grades g
        JOIN assessments a ON g.assessment_id = a.id AND a.tenant_id = g.tenant_id
        LEFT JOIN subjects subj ON a.subject_id = subj.id AND subj.tenant_id = g.tenant_id
        WHERE g.student_id = :sid
          AND g.tenant_id = :tid
          AND a.term_id = :term_id
    """), {"sid": student_id, "term_id": term_id, "tid": tenant_id}).mappings().all()


def _summarize_subject_grades(grades: list, pass_threshold: float = PASS_THRESHOLD) -> list:
    """Group raw grade rows by subject: {name, coefficient, ects, average, passed}."""
    by_subject: dict = {}
    for g in grades:
        name = g["subject_name"]
        # Different subjects / UEs may have the same display name.
        # Group by stable subject UUID, not by title, to avoid merging ECTS.
        key = str(g.get("subject_id")) if g.get("subject_id") else name
        if key not in by_subject:
            by_subject[key] = {
                "subject_id": str(g["subject_id"]) if g.get("subject_id") else None,
                "subject_name": name,
                "coefficient": float(g["coefficient"] or 1),
                "ects": float(g["ects"] or 0),
                "_scores": [],
            }
        if g["score"] is not None:
            max_s = float(g["max_score"] or 20)
            by_subject[key]["_scores"].append(float(g["score"]) / max_s * 20)

    summary = []
    for data in by_subject.values():
        scores = data.pop("_scores")
        raw_average = sum(scores) / len(scores) if scores else None
        # Display rounded marks, but credit validation must use the original
        # precision: 9.996/20 is below 10/20 even if rendered as 10.00.
        data["average"] = round(raw_average, 2) if raw_average is not None else None
        data["passed"] = raw_average is not None and raw_average >= pass_threshold
        summary.append(data)
    return summary



def _compute_term_average_from_grades(grades: list) -> Optional[float]:
    """Return coefficient-weighted term average from unrounded subject means.

    Group by stable subject ID, not display name. Round only the final
    result: rounding each subject first can shift a semester's official mark.
    """
    subjects: dict[str, dict] = {}
    for grade in grades:
        key = (str(grade["subject_id"]) if grade.get("subject_id")
               else grade.get("subject_name") or "Matière inconnue")
        if key not in subjects:
            subjects[key] = {
                "coefficient": float(grade.get("coefficient") or 1),
                "scores": [],
            }
        if grade.get("score") is not None:
            max_score = float(grade.get("max_score") or 20)
            subjects[key]["scores"].append(float(grade["score"]) / max_score * 20)
    weighted_sum = 0.0
    total_weight = 0.0
    for subject in subjects.values():
        if subject["scores"] and subject["coefficient"] > 0:
            weighted_sum += (
                sum(subject["scores"]) / len(subject["scores"])
                * subject["coefficient"]
            )
            total_weight += subject["coefficient"]
    return round(weighted_sum / total_weight, 2) if total_weight > 0 else None


def _capitalized_ects(periods: list[dict]) -> tuple[float, float]:
    """Capitalise each identified UE once across terms and retakes.

    A previously failed UE can become earned in a later term, without its
    credits being counted twice. Missing subject IDs are kept term-local:
    titles alone are not reliable UE identifiers.
    """
    credits_by_ue: dict[tuple, dict] = {}
    for period in periods:
        for index, subject in enumerate(period["subjects"]):
            sid = subject.get("subject_id")
            key = ("subject", str(sid)) if sid else ("unidentified", period["term_id"], index)
            credits = max(0.0, float(subject.get("ects") or 0))
            if key not in credits_by_ue:
                credits_by_ue[key] = {"ects": credits, "passed": False}
            else:
                # Prefer the largest declared credit count if historical
                # term snapshots disagree; never double-count the same UE.
                credits_by_ue[key]["ects"] = max(credits_by_ue[key]["ects"], credits)
            credits_by_ue[key]["passed"] |= bool(subject.get("passed"))
    possible = sum(item["ects"] for item in credits_by_ue.values())
    earned = sum(item["ects"] for item in credits_by_ue.values() if item["passed"])
    return earned, possible


@router.get("/{student_id}/")
def get_student_transcript(
    request: Request,
    student_id: UUID,
    academic_year_id: UUID = Query(..., description="Année académique à couvrir"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("grades:read")),
):
    """Relevé de notes complet pour une année académique : détail par
    période (trimestre/semestre) et par matière/UE, avec ECTS acquis.
    """
    tenant_id = str(resolve_current_tenant_id(request, current_user, db))
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Contexte établissement requis")

    student = db.execute(text("""
        SELECT first_name, last_name, registration_number
        FROM students WHERE id = :sid AND tenant_id = :tid
    """), {"sid": str(student_id), "tid": tenant_id}).mappings().first()
    if not student:
        raise HTTPException(status_code=404, detail="Élève/étudiant introuvable")
    if not _can_view_transcript(db, current_user=current_user, student_id=str(student_id), tenant_id=tenant_id):
        raise HTTPException(status_code=403, detail="Accès non autorisé à ce relevé de notes")

    terms = _fetch_terms_for_year(db, str(academic_year_id), tenant_id)
    # Moyenne de passage de l'établissement (règles académiques), 10/20 par défaut.
    pass_threshold = effective_rules(db, tenant_id)["passing_grade"]
    if not terms:
        raise HTTPException(status_code=404, detail="Aucune période trouvée pour cette année académique")

    periods = []
    term_averages = []
    annual_ects_numerator = 0.0
    annual_ects_denominator = 0.0

    for term in terms:
        grades = _fetch_grades_for_term_with_ects(db, str(student_id), str(term["id"]), tenant_id)
        subjects = _summarize_subject_grades(grades, pass_threshold)

        # Aggregate unrounded subject means, using stable subject IDs.
        # The rounded values in subjects[] are strictly for presentation.
        term_average = _compute_term_average_from_grades(grades)
        if term_average is not None:
            term_averages.append(term_average)

        # Module université (2026-09) : moyenne pondérée par crédits ECTS,
        # distincte de term_average (pondérée par coefficient) — voir
        # app/services/grading.py::compute_ects_weighted_average. Calculée
        # sur les mêmes lignes de notes brutes (grades), pas sur le résumé
        # `subjects` qui a déjà perdu le détail par note individuelle.
        term_average_ects_raw = compute_ects_weighted_average(grades)
        term_average_ects = round(term_average_ects_raw, 2) if term_average_ects_raw is not None else None
        if term_average_ects_raw is not None:
            # Annual university average must weight each term by its graded
            # ECTS, not treat a 5-credit and a 30-credit term equally.
            # Use unrounded term averages to avoid cascading rounding error.
            graded_ects = sum(
                subj["ects"] for subj in subjects
                if subj["average"] is not None and subj["ects"] > 0
            )
            annual_ects_numerator += term_average_ects_raw * graded_ects
            annual_ects_denominator += graded_ects

        periods.append({
            "term_id": str(term["id"]),
            "term_name": term["name"],
            "subjects": subjects,
            "term_average": term_average,
            "term_average_ects_weighted": term_average_ects,
        })

    # Subjects repeated for resits or cross-term teaching must only earn
    # their credits once over the academic year.
    total_ects_earned, total_ects_possible = _capitalized_ects(periods)

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
        "annual_average_ects_weighted": (
            round(annual_ects_numerator / annual_ects_denominator, 2)
            if annual_ects_denominator > 0 else None
        ),
        "ects_earned": total_ects_earned,
        "ects_possible": total_ects_possible,
    }
