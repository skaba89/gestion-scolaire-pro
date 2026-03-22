from sqlalchemy import Column, ForeignKey, Boolean, Float, Table, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base

# Association between Subjects and Levels
subject_levels = Table(
    "subject_levels",
    Base.metadata,
    Column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("subject_id", UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column("level_id", UUID(as_uuid=True), ForeignKey("levels.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint('subject_id', 'level_id', name='uix_subject_level')
)

# Association between Subjects and Departments
subject_departments = Table(
    "subject_departments",
    Base.metadata,
    Column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("subject_id", UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column("department_id", UUID(as_uuid=True), ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint('subject_id', 'department_id', name='uix_subject_department')
)

# Association between Classes and Departments
classroom_departments = Table(
    "classroom_departments",
    Base.metadata,
    Column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("class_id", UUID(as_uuid=True), ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True),
    Column("department_id", UUID(as_uuid=True), ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint('class_id', 'department_id', name='uix_classroom_department')
)

# Association between Classes and Subjects (with extra data like coefficient)
class_subjects = Table(
    "class_subjects",
    Base.metadata,
    Column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("class_id", UUID(as_uuid=True), ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True),
    Column("subject_id", UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column("academic_year_id", UUID(as_uuid=True), ForeignKey("academic_years.id", ondelete="SET NULL"), nullable=True),
    Column("is_optional", Boolean, default=False),
    Column("coefficient", Float),
    UniqueConstraint('class_id', 'subject_id', name='uix_class_subject')
)
