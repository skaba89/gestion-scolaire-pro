"""Read-only integrity checks for duplicate active enrollments.

The student-year grouping matches the create_enrollment business rule:
a pupil can have only one ACTIVE enrollment in an academic year per tenant.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


DUPLICATE_ACTIVE_ENROLLMENTS_SQL = text("""
    SELECT tenant_id, student_id, academic_year_id,
           COUNT(*) AS active_enrollments,
           COUNT(DISTINCT class_id) AS distinct_classes
    FROM enrollments
    WHERE tenant_id = :tenant_id
      AND UPPER(status) = 'ACTIVE'
    GROUP BY tenant_id, student_id, academic_year_id
    HAVING COUNT(*) > 1
    ORDER BY active_enrollments DESC, student_id, academic_year_id
""")


def find_duplicate_active_enrollments(db: Session, tenant_id: str) -> list[dict]:
    """Return duplicate *groups*, without changing any database records.

    A tenant ID is required so callers cannot accidentally collect students'
    records across schools; PostgreSQL RLS provides an additional boundary.
    """
    if not tenant_id:
        raise ValueError("Un identifiant d'établissement est obligatoire")
    rows = db.execute(DUPLICATE_ACTIVE_ENROLLMENTS_SQL, {"tenant_id": tenant_id}).mappings().all()
    return [
        {
            "student_id": str(row["student_id"]),
            "academic_year_id": str(row["academic_year_id"]),
            "active_enrollments": int(row["active_enrollments"]),
            "distinct_classes": int(row["distinct_classes"]),
        }
        for row in rows
    ]
