"""Read-only duplicate enrollment audit: business grouping and tenant isolation."""
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.services.enrollment_integrity import find_duplicate_active_enrollments


def test_duplicate_active_enrollments_groups_by_tenant_student_and_year():
    engine = create_engine("sqlite:///:memory:")
    tenant, other_tenant = str(uuid4()), str(uuid4())
    student, year = str(uuid4()), str(uuid4())
    with Session(engine) as db:
        db.execute(text("""
            CREATE TABLE enrollments (
                tenant_id TEXT, student_id TEXT,
                academic_year_id TEXT, class_id TEXT, status TEXT
            )
        """))
        rows = [
            (tenant, student, year, str(uuid4()), "ACTIVE"),
            (tenant, student, year, str(uuid4()), "active"),
            (tenant, student, year, str(uuid4()), "WITHDRAWN"),
            (other_tenant, student, year, str(uuid4()), "ACTIVE"),
            (tenant, student, str(uuid4()), str(uuid4()), "ACTIVE"),
        ]
        for row in rows:
            db.execute(text("""
                INSERT INTO enrollments
                (tenant_id, student_id, academic_year_id, class_id, status)
                VALUES (:tid, :sid, :year, :cid, :status)
            """), dict(zip(("tid", "sid", "year", "cid", "status"), row)))
        result = find_duplicate_active_enrollments(db, tenant)
        assert result == [{
            "student_id": student,
            "academic_year_id": year,
            "active_enrollments": 2,
            "distinct_classes": 2,
        }]
        assert db.execute(text("SELECT COUNT(*) FROM enrollments")).scalar_one() == 5


def test_duplicate_active_enrollment_audit_requires_tenant():
    with pytest.raises(ValueError, match="établissement"):
        find_duplicate_active_enrollments(None, "")
