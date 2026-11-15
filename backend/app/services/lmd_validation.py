"""Configurable, read-only LMD validation for one student and semester.

The historical behaviour is the safe default: each ECUE earns only its own
credits when it reaches the institution's academic passing grade. UE and
semester compensation are opt-in and never rewrite grades or prior records.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models import Assessment, Grade, Semester, Student, Subject, TeachingUnit, Tenant
from app.services.academic_rules import effective_rules

SETTINGS_KEY = "lmd_validation_rules"
DEFAULT_RULES = {
    "intra_ue_compensation_enabled": False,
    "semester_compensation_enabled": False,
    "semester_pass_grade": 10.0,
    "minimum_compensable_ue_grade": 5.0,
    "require_all_ecues_graded": True,
}


class InvalidLmdValidationRules(ValueError):
    pass


def validate_lmd_rules(raw: dict) -> dict:
    if not isinstance(raw, dict):
        raise InvalidLmdValidationRules("Règles LMD invalides")
    expected = set(DEFAULT_RULES)
    if set(raw) != expected:
        raise InvalidLmdValidationRules("Les règles LMD doivent être fournies intégralement")
    for key in ("intra_ue_compensation_enabled", "semester_compensation_enabled", "require_all_ecues_graded"):
        if type(raw[key]) is not bool:
            raise InvalidLmdValidationRules(f"{key} doit être un booléen")
    try:
        semester_pass = float(raw["semester_pass_grade"])
        floor = float(raw["minimum_compensable_ue_grade"])
    except (TypeError, ValueError):
        raise InvalidLmdValidationRules("Les seuils LMD doivent être numériques")
    if not 0 < semester_pass <= 20:
        raise InvalidLmdValidationRules("La moyenne de compensation semestrielle doit être comprise entre 0 et 20")
    if not 0 <= floor <= semester_pass:
        raise InvalidLmdValidationRules("La note éliminatoire doit être comprise entre 0 et la moyenne semestrielle")
    return {
        "intra_ue_compensation_enabled": raw["intra_ue_compensation_enabled"],
        "semester_compensation_enabled": raw["semester_compensation_enabled"],
        "semester_pass_grade": semester_pass,
        "minimum_compensable_ue_grade": floor,
        "require_all_ecues_graded": raw["require_all_ecues_graded"],
    }


def lmd_rules_payload(db: Session, tenant_id: str) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    stored = ((tenant.settings or {}).get(SETTINGS_KEY) if tenant else None) or {}
    revision = stored.get("revision", 0) if isinstance(stored, dict) else 0
    raw = stored.get("rules") if isinstance(stored, dict) else None
    try:
        rules = validate_lmd_rules(raw) if raw else dict(DEFAULT_RULES)
    except InvalidLmdValidationRules:
        rules = dict(DEFAULT_RULES)
    return {
        "revision": revision if type(revision) is int and revision >= 0 else 0,
        "rules": rules,
        "effective_ecue_pass_grade": float(effective_rules(db, tenant_id)["passing_grade"]),
    }


def _weighted_average(items: Iterable[tuple[float | None, float]]) -> float | None:
    numerator = denominator = 0.0
    for average, weight in items:
        if average is not None and weight > 0:
            numerator += average * weight
            denominator += weight
    return numerator / denominator if denominator > 0 else None


def _round(value: float | None) -> float | None:
    return round(value, 2) if value is not None else None


def build_semester_validation(
    db: Session, *, tenant_id: str, student_id: str, semester_id: str,
) -> dict | None:
    semester = db.query(Semester).filter(Semester.id == semester_id, Semester.tenant_id == tenant_id).first()
    student = db.query(Student).filter(Student.id == student_id, Student.tenant_id == tenant_id).first()
    if semester is None or student is None:
        return None

    config = lmd_rules_payload(db, tenant_id)
    rules = config["rules"]
    pass_grade = config["effective_ecue_pass_grade"]
    subjects = db.query(Subject).filter(
        Subject.tenant_id == tenant_id, Subject.semester_id == semester_id,
    ).order_by(Subject.name).all()
    units = db.query(TeachingUnit).filter(
        TeachingUnit.tenant_id == tenant_id, TeachingUnit.semester_id == semester_id,
    ).order_by(TeachingUnit.code).all()

    scores: dict[str, list[float]] = defaultdict(list)
    subject_ids = [subject.id for subject in subjects]
    if subject_ids:
        rows = db.query(Assessment.subject_id, Grade.score, Grade.max_score).join(
            Grade,
            and_(Grade.assessment_id == Assessment.id, Grade.tenant_id == Assessment.tenant_id),
        ).filter(
            Grade.tenant_id == tenant_id,
            Grade.student_id == student_id,
            Assessment.subject_id.in_(subject_ids),
        ).all()
        for subject_id, score, max_score in rows:
            if score is not None and max_score and float(max_score) > 0:
                scores[str(subject_id)].append(float(score) / float(max_score) * 20)

    ecues = []
    for subject in subjects:
        raw_scores = scores.get(str(subject.id), [])
        average = sum(raw_scores) / len(raw_scores) if raw_scores else None
        ecues.append({
            "id": str(subject.id), "teaching_unit_id": str(subject.teaching_unit_id) if subject.teaching_unit_id else None,
            "code": subject.code, "name": subject.name, "average": _round(average), "_average_raw": average,
            "ects": max(0.0, float(subject.ects or 0)), "coefficient": max(0.0, float(subject.coefficient or 0)),
            "graded": average is not None, "passed": average is not None and average >= pass_grade,
        })

    unit_by_id = {str(unit.id): unit for unit in units}
    grouped: dict[str, list[dict]] = defaultdict(list)
    for ecue in ecues:
        grouped[ecue["teaching_unit_id"] or f"subject:{ecue['id']}"].append(ecue)
    for unit_id in unit_by_id:
        grouped.setdefault(unit_id, [])

    results = []
    for group_id, components in grouped.items():
        unit = unit_by_id.get(group_id)
        component_weight = lambda item: item["ects"] if item["ects"] > 0 else (item["coefficient"] or 1.0)
        average = _weighted_average((item["_average_raw"], component_weight(item)) for item in components)
        complete = bool(components) and all(item["graded"] for item in components)
        all_passed = complete and all(item["passed"] for item in components)
        intra_passed = bool(rules["intra_ue_compensation_enabled"] and complete and average is not None and average >= pass_grade)
        direct_validated = all_passed or intra_passed
        possible = max(0.0, float(unit.ects or 0)) if unit else sum(item["ects"] for item in components)
        if unit and possible <= 0:
            possible = sum(item["ects"] for item in components)
        capitalized = possible if direct_validated else min(possible, sum(item["ects"] for item in components if item["passed"]))
        status = ("INCOMPLETE" if not complete else "VALIDATED_DIRECT" if direct_validated
                  else "PARTIALLY_CAPITALIZED" if capitalized > 0 else "FAILED")
        results.append({
            "id": str(unit.id) if unit else None,
            "code": unit.code if unit else components[0]["code"],
            "name": unit.name if unit else components[0]["name"],
            "is_standalone": unit is None,
            "is_active": unit.is_active if unit else True,
            "average": _round(average), "_average_raw": average, "complete": complete,
            "status": status, "ects_possible": possible, "ects_earned": capitalized,
            "ecues": components,
        })

    semester_average = _weighted_average(
        (item["_average_raw"], item["ects_possible"] if item["ects_possible"] > 0 else 1.0)
        for item in results
    )
    all_complete = bool(results) and all(item["complete"] for item in results)
    compensation_eligible = bool(
        rules["semester_compensation_enabled"]
        and semester_average is not None
        and semester_average >= rules["semester_pass_grade"]
        and (all_complete or not rules["require_all_ecues_graded"])
        and all(item["_average_raw"] is not None and item["_average_raw"] >= rules["minimum_compensable_ue_grade"] for item in results)
    )
    compensation_applied = compensation_eligible and any(
        item["ects_earned"] < item["ects_possible"] for item in results
    )
    if compensation_applied:
        for item in results:
            if item["ects_earned"] < item["ects_possible"]:
                item["status"] = "VALIDATED_COMPENSATION"
                item["ects_earned"] = item["ects_possible"]

    possible = sum(item["ects_possible"] for item in results)
    earned = sum(item["ects_earned"] for item in results)
    fully_validated = bool(results) and abs(earned - possible) < 0.000001
    semester_status = ("INCOMPLETE" if not all_complete and rules["require_all_ecues_graded"]
                       else "VALIDATED_COMPENSATION" if compensation_applied
                       else "VALIDATED_DIRECT" if fully_validated
                       else "PARTIALLY_CAPITALIZED" if earned > 0 else "FAILED")

    for item in results:
        item.pop("_average_raw", None)
        for ecue in item["ecues"]:
            ecue.pop("_average_raw", None)
    return {
        "tenant_id": str(tenant_id), "student_id": str(student_id), "semester_id": str(semester_id),
        "semester_name": semester.name, "rules_revision": config["revision"],
        "rules": {**rules, "ecue_pass_grade": pass_grade},
        "average": _round(semester_average), "status": semester_status,
        "compensation_applied": compensation_applied,
        "ects_earned": round(earned, 2), "ects_possible": round(possible, 2),
        "teaching_units": results,
    }
