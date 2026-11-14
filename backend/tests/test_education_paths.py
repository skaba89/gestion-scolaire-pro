"""Compatibility endpoints are owned by the same functional policy."""
import pytest
from app.core.education_paths import module_for_path


@pytest.mark.parametrize("path, expected", [
    ("/api/v1/analytics/elearning/courses/", "elearning"),
    ("/api/v1/me/elearning/lessons/uuid/complete/", "elearning"),
    ("/api/v1/courses/", "elearning"),
    ("/api/v1/quiz-questions/", "elearning"),
    ("/api/v1/school-life/check-ins/sessions/start/", "attendance"),
    ("/api/v1/school-life/student-cards/issue/", "attendance"),
    ("/api/v1/school-life/bookings/", "schedule"),
    ("/api/v1/teachers/uuid/schedule/", "schedule"),
    ("/api/v1/school-life/grades/", "assessments"),
    ("/api/v1/import/grades/preview/", "assessments"),
    ("/api/v1/department-portal/exams/", "assessments"),
    ("/api/v1/parents/grades/", "assessments"),
    ("/api/v1/subjects/uuid/prerequisites/", "lmd"),
    ("/api/v1/semesters/", "lmd"),
    ("/api/v1/hr/alumni-mentors/", "student_life"),
    ("/api/v1/incidents/", "student_life"),
    ("/api/v1/hr/employees/", "hr"),
    ("/api/v1/parents/risk-scores/", "ai"),
    ("/api/v1/analytics/students-at-risk/", "ai"),
    ("/api/v1/parents/payments/create/", None),
    ("/api/v1/parents/appointment-slots/", None),
    ("/api/v1/parents/report-cards/generate/", None),
    ("/api/v1/department-portal/reports/grades/", None),
    ("/api/v1/analytics/dashboard-kpis/", None),
    ("/api/v1/library-unknown/", None),
])
def test_policy_ownership(path, expected):
    assert module_for_path(path) == expected
