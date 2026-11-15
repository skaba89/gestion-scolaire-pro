"""Semester progression gate backed by the central LMD validation engine.

A semester may declare `credits_required_to_advance` (ECTS a student must
have earned from ITS subjects before enrolling in the next semester's
subjects, same academic year, number + 1). Inert by default: a semester
with no threshold configured, or one with no "next" semester at all, never
blocks anything — existing tenants and any semester created before this
field existed are unaffected until an admin opts in.

"Earned" uses the same configurable UE/ECUE result exposed by the validation
preview. Default rules preserve historical per-ECUE capitalization; explicit
compensation settings can broaden validation without rewriting grades.
"""
from typing import Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.lmd_validation import build_semester_validation


def compute_earned_ects_for_semester(
    db: Session, *, tenant_id: str, student_id: str, semester_id: str,
) -> tuple[float, float]:
    """Returns the central UE/ECUE validation result used by progression.

    With default rules this is identical to the historical per-ECUE credit
    calculation. Explicit compensation settings can only broaden validation.
    """
    result = build_semester_validation(
        db, tenant_id=tenant_id, student_id=student_id, semester_id=semester_id,
    )
    if result is None:
        return 0.0, 0.0
    return float(result["ects_earned"]), float(result["ects_possible"])


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
