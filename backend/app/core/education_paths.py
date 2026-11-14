"""Ownership of HTTP operations, including compatibility aliases.

Longest-prefix matching prevents /analytics from masking e-learning routes.
Core reporting can still read retained history after a teaching module is off.
"""
from __future__ import annotations

_OWNERS = {
    "elearning": ("/analytics/elearning", "/me/elearning", "/courses", "/course-discussions", "/quiz-questions",
                  "/shared-notes", "/shared-note-likes", "/shared-note-comments"),
    "library": ("/library",),
    "inventory": ("/inventory",),
    "hr": ("/hr",),
    "ai": ("/ai", "/analytics/risk-scores", "/analytics/students-at-risk"),
    "admissions": ("/admissions",),
    "assessments": ("/grades", "/assessments", "/grade-history", "/school-life/grades", "/school-life/assessments", "/import/grades"),
    "attendance": ("/attendance", "/kiosk", "/student-check-ins", "/student-badges", "/school-life/attendance",
                   "/school-life/check-ins", "/school-life/badges", "/school-life/students-without-badges", "/school-life/student-cards"),
    "schedule": ("/schedule", "/schedule-slots", "/class-sessions", "/subject-preferred-rooms", "/school-life/bookings", "/school-life/bookable-resources"),
    "homework": ("/homework", "/homework-submissions"),
    "lmd": ("/semesters", "/faculties"),
    "student_life": ("/clubs", "/alumni", "/gamification", "/achievement-definitions", "/student-achievements",
                     "/point-transactions", "/school-events", "/school-life/events", "/school-life/event-registrations",
                     "/school-life/gamification", "/school-life/early-warnings", "/incidents",
                     "/hr/alumni-document-requests", "/hr/alumni-mentors", "/hr/alumni-request-history", "/hr/career-events"),
    "academics": ("/students", "/levels", "/subjects", "/departments", "/teachers", "/enrollments",
                  "/classrooms", "/infrastructure", "/student-subjects", "/student-parents", "/import"),
}
PREFIX_OWNERS = tuple(sorted(((prefix, owner) for owner, prefixes in _OWNERS.items() for prefix in prefixes),
                            key=lambda pair: len(pair[0]), reverse=True))


def module_for_path(path: str, api_prefix: str = "/api/v1") -> str | None:
    if path == api_prefix or path.startswith(api_prefix + "/"):
        path = path[len(api_prefix):]
    if path.startswith("/teachers/") and path.rstrip("/").endswith("/schedule"):
        return "schedule"
    if path.startswith("/subjects/") and path.rstrip("/").endswith("/prerequisites"):
        return "lmd"
    # These portals combine core communication/finance with teaching modules.
    if path.startswith("/parents/") or path.startswith("/department-portal/"):
        segments = set(path.strip("/").split("/"))
        if segments & {"payments", "invoices", "payment-schedules", "payment-intent", "messages", "appointments", "appointment-slots", "documents", "report-cards", "transcript", "reports"}:
            return None
        if "risk-scores" in segments:
            return "ai"
        if segments & {"grades", "assessments", "exams"}:
            return "assessments"
        if "attendance" in segments:
            return "attendance"
        if segments & {"schedule", "timetable"}:
            return "schedule"
        return "academics"
    for prefix, owner in PREFIX_OWNERS:
        if path == prefix or path.startswith(prefix + "/"):
            return owner
    return None
