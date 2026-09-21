"""Semester progression gate (LMD build-out, follow-up to faculties/
semesters/subject_prerequisites — see grading.py for the ECTS-weighted
average this reuses the same PASS_THRESHOLD convention with).

A semester may declare `credits_required_to_advance` (ECTS a student must
have earned from ITS subjects before enrolling in the next semester's
subjects, same academic year, number + 1). Inert by default: a semester
with no threshold configured, or one with no "next" semester at all, never
blocks anything — existing tenants and any semester created before this
field existed are unaffected until an admin opts in.

"Earned" mirrors transcripts.py's own rule exactly (PASS_THRESHOLD = 10/20,
average of a student's own grades in a subject): a credit counted as
acquired on the transcript is the same credit that counts toward semester
progression — no second, silently-diverging definition of "passed".
"""
from typing import Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

PASS_THRESHOLD = 10.0  # /20 — kept in sync with transcripts.py's own constant


def _fetch_grades_for_semester(db: Session, *, tenant_id: str, student_id: str, semester_id: str) -> list:
    return db.execute(text("""
        SELECT
            COALESCE(subj.name, 'Matière inconnue') AS subject_name,
            COALESCE(subj.ects, 0) AS ects,
            g.score,
            g.max_score
        FROM grades g
        JOIN assessments a ON g.assessment_id = a.id
        JOIN subjects subj ON a.subject_id = subj.id
        WHERE g.student_id = :sid
          AND g.tenant_id = :tid
          AND subj.semester_id = :semester_id
    """), {"sid": student_id, "tid": tenant_id, "semester_id": semester_id}).mappings().all()


def compute_earned_ects_for_semester(
    db: Session, *, tenant_id: str, student_id: str, semester_id: str,
) -> tuple[float, float]:
    """Returns (ects_earned, ects_possible) across every subject tied to
    this semester, using the same by-subject-average/PASS_THRESHOLD rule
    as transcripts.py::_summarize_subject_grades."""
    grades = _fetch_grades_for_semester(db, tenant_id=tenant_id, student_id=student_id, semester_id=semester_id)
    by_subject: dict[str, dict] = {}
    for g in grades:
        name = g["subject_name"]
        if name not in by_subject:
            by_subject[name] = {"ects": float(g["ects"] or 0), "scores": []}
        if g["score"] is not None:
            max_s = float(g["max_score"] or 20)
            by_subject[name]["scores"].append(float(g["score"]) / max_s * 20)

    ects_earned = 0.0
    ects_possible = 0.0
    for data in by_subject.values():
        ects_possible += data["ects"]
        scores = data["scores"]
        if scores and (sum(scores) / len(scores)) >= PASS_THRESHOLD:
            ects_earned += data["ects"]
    return ects_earned, ects_possible


def _find_previous_semester(db: Session, *, tenant_id: str, target_semester: dict) -> Optional[dict]:
    row = db.execute(text("""
        SELECT id, name, number, credits_required_to_advance
        FROM semesters
        WHERE tenant_id = :tid AND academic_year_id = :ay AND number = :prev_number
    """), {
        "tid": tenant_id,
        "ay": target_semester["academic_year_id"],
        "prev_number": target_semester["number"] - 1,
    }).mappings().first()
    return dict(row) if row else None


def check_semester_progression_eligibility(
    db: Session, *, tenant_id: str, student_id: str, target_semester_id: UUID | str,
) -> dict:
    """Can `student_id` enroll in `target_semester_id`'s subjects?

    Returns {"eligible": bool, "reason": str, ...detail}. Always eligible
    when: the target semester doesn't exist (nothing to gate — the caller
    that resolved subject->semester already validated the subject exists),
    there is no previous semester (e.g. S1), or the previous semester has
    no credits_required_to_advance configured.
    """
    target = db.execute(text("""
        SELECT id, name, number, academic_year_id
        FROM semesters WHERE id = :sid AND tenant_id = :tid
    """), {"sid": str(target_semester_id), "tid": tenant_id}).mappings().first()
    if not target:
        return {"eligible": True, "reason": "target_semester_not_found"}

    previous = _find_previous_semester(db, tenant_id=tenant_id, target_semester=dict(target))
    if not previous:
        return {"eligible": True, "reason": "no_previous_semester"}

    required = previous.get("credits_required_to_advance")
    if required is None:
        return {"eligible": True, "reason": "no_threshold_configured", "previous_semester_id": str(previous["id"])}

    earned, possible = compute_earned_ects_for_semester(
        db, tenant_id=tenant_id, student_id=str(student_id), semester_id=str(previous["id"]),
    )
    eligible = earned >= float(required)
    return {
        "eligible": eligible,
        "reason": "credits_sufficient" if eligible else "insufficient_credits",
        "previous_semester_id": str(previous["id"]),
        "previous_semester_name": previous["name"],
        "credits_required": float(required),
        "credits_earned": earned,
        "credits_possible": possible,
    }
