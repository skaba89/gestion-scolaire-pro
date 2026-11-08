"""Current enrollment for official certificates must work with SQLite GUID storage."""
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.v1.endpoints.operational import school_life as api


def test_current_enrollment_finds_active_student_with_sqlite_hex_guids():
    engine = create_engine("sqlite:///:memory:")
    student, tenant, classroom, level, year = [uuid4() for _ in range(5)]
    with Session(engine) as db:
        db.execute(text("""
            CREATE TABLE enrollments (
                student_id CHAR(32), tenant_id CHAR(32), class_id CHAR(32),
                academic_year_id CHAR(32), enrollment_date TEXT,
                created_at TEXT, status TEXT
            )
        """))
        db.execute(text("""
            CREATE TABLE classes (
                id CHAR(32), tenant_id CHAR(32),
                academic_year_id CHAR(32), level_id CHAR(32), name TEXT
            )
        """))
        db.execute(text("""
            CREATE TABLE levels (id CHAR(32), tenant_id CHAR(32), name TEXT)
        """))
        db.execute(text("""
            CREATE TABLE academic_years (
                id CHAR(32), tenant_id CHAR(32), name TEXT, is_current BOOLEAN
            )
        """))
        db.execute(text("""
            INSERT INTO academic_years VALUES (:year, :tenant, '2026-2027', 1)
        """), {"year": year.hex, "tenant": tenant.hex})
        db.execute(text("""
            INSERT INTO levels VALUES (:level, :tenant, 'Lycée')
        """), {"level": level.hex, "tenant": tenant.hex})
        db.execute(text("""
            INSERT INTO classes VALUES (:classroom, :tenant, :year, :level, 'Première')
        """), {"classroom": classroom.hex, "tenant": tenant.hex,
               "year": year.hex, "level": level.hex})
        db.execute(text("""
            INSERT INTO enrollments VALUES
                (:student, :tenant, :classroom, :year, '2026-09-01',
                 '2026-09-01', 'ACTIVE')
        """), {"student": student.hex, "tenant": tenant.hex,
               "classroom": classroom.hex, "year": year.hex})

        result = api._fetch_current_enrollment(db, str(student), str(tenant))
        assert result == {
            "class_name": "Première", "level_name": "Lycée",
            "year_name": "2026-2027",
        }
        # An unrelated student, or an unrelated tenant, can never match.
        assert api._fetch_current_enrollment(db, str(uuid4()), str(tenant)) is None
        assert api._fetch_current_enrollment(db, str(student), str(uuid4())) is None
