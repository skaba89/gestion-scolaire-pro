from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Boolean, Float, Table, UniqueConstraint
from app.core.database import Base

from app.models.base import GUID

# Association between Subjects and Levels
subject_levels = Table(
    "subject_levels",
    Base.metadata,
    Column("tenant_id", GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("subject_id", GUID(), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column("level_id", GUID(), ForeignKey("levels.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint('subject_id', 'level_id', name='uix_subject_level')
)

# Association between Subjects and Departments
subject_departments = Table(
    "subject_departments",
    Base.metadata,
    Column("tenant_id", GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("subject_id", GUID(), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column("department_id", GUID(), ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint('subject_id', 'department_id', name='uix_subject_department')
)

# Association between Classes and Departments
classroom_departments = Table(
    "classroom_departments",
    Base.metadata,
    Column("tenant_id", GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("class_id", GUID(), ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True),
    Column("department_id", GUID(), ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint('class_id', 'department_id', name='uix_classroom_department')
)

# Association between Classes and Subjects (with extra data like coefficient)
class_subjects = Table(
    "class_subjects",
    Base.metadata,
    Column("tenant_id", GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("class_id", GUID(), ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True),
    Column("subject_id", GUID(), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column("academic_year_id", GUID(), ForeignKey("academic_years.id", ondelete="SET NULL"), nullable=True),
    Column("is_optional", Boolean, default=False),
    Column("coefficient", Float),
    UniqueConstraint('class_id', 'subject_id', name='uix_class_subject')
)

# Association between Students and Subjects — individual course
# registration (institutional-readiness audit, 2026-09): the endpoint that
# writes to this table (POST /student-subjects/, app/api/v1/endpoints/
# aliases.py) has existed for a while, but this table itself was never
# defined anywhere — no ORM model, no Table object, no Alembic migration.
# Every call to that endpoint against a real Postgres database would raise
# "relation student_subjects does not exist". Defined here so tests (which
# create schema via Base.metadata.create_all) and the paired Alembic
# migration both pick it up, matching the sibling tables above.
student_subjects = Table(
    "student_subjects",
    Base.metadata,
    Column("tenant_id", GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("student_id", GUID(), ForeignKey("students.id", ondelete="CASCADE"), primary_key=True),
    Column("subject_id", GUID(), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime, default=lambda: datetime.now(timezone.utc), nullable=False),
)
