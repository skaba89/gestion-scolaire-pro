from sqlalchemy import Column, String, Integer, Float, Date, ForeignKey, Boolean

from app.models.base import Base, GUID, UUIDMixin, TimestampMixin, TenantMixin


class Semester(Base, UUIDMixin, TimestampMixin, TenantMixin):
    """A university academic period (S1, S2, ...) — the LMD counterpart of
    the school system's Term, kept as its own table rather than reusing
    Term: a semester carries its own progression rules (validation gates
    per credit threshold) that don't apply to a school trimestre, and the
    two must be able to evolve independently without one's migration
    breaking the other's callers.
    """
    __tablename__ = "semesters"

    academic_year_id = Column(GUID(), ForeignKey("academic_years.id"), nullable=False)
    name = Column(String(255), nullable=False)
    number = Column(Integer, nullable=False, default=1)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_active = Column(Boolean, default=False)
    # Semester-progression rule (LMD build-out, follow-up to faculties/
    # semesters/prerequisites): ECTS credits a student must have earned
    # from THIS semester's subjects before enrolling in the NEXT semester's
    # subjects (same academic year, number + 1). NULL by default — a
    # semester with no threshold configured never blocks progression, so
    # existing tenants (and any semester created before this field existed)
    # are unaffected until an admin opts in.
    credits_required_to_advance = Column(Float, nullable=True)
