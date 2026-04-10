from fastapi import APIRouter
from app.api.v1.endpoints.core import users, storage, realtime, auth, rgpd, analytics, mfa, tenants, notifications, audit, health, ai
from app.api.v1.endpoints.academic import students, grades, academic_years, campuses, levels, subjects, departments, terms, assessments, teachers, attendance, homework
from app.api.v1.endpoints.finance import payments, payment_schedules
from app.api.v1.endpoints.operational import infrastructure, hr, school_life, parents, admissions, schedule, communication, surveys
from app.api.v1.endpoints.operational import departments as dept_portal
from app.api.v1.endpoints.operational import alumni as alumni_portal
from app.api.v1.endpoints.operational import inventory, library, clubs, incidents
from app.api.v1.endpoints.aliases import (
    enrollments_alias_router,
    invoices_alias_router,
    class_sessions_router,
    school_events_router,
    student_parents_router,
    student_subjects_router,
    push_subscriptions_router,
    presence_router,
    parents_list_alias_router,
    rooms_alias_router,
    classrooms_alias_router,
    schedule_slots_alias_router,
)

api_router = APIRouter()

# Core routes
api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["Tenants"])
api_router.include_router(rgpd.router, prefix="/rgpd", tags=["RGPD"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
api_router.include_router(audit.router, prefix="/audit", tags=["Audit Logs"])
api_router.include_router(audit.router, prefix="/audit-logs", tags=["Audit Logs"])
api_router.include_router(mfa.router, prefix="/mfa", tags=["MFA"])
api_router.include_router(storage.router, prefix="/storage", tags=["Storage"])
api_router.include_router(realtime.router, prefix="/realtime", tags=["Realtime"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(ai.router, prefix="/ai", tags=["AI"])

# Academic routes
api_router.include_router(students.router, prefix="/students", tags=["Students"])
api_router.include_router(grades.router, prefix="/grades", tags=["Grades"])
api_router.include_router(academic_years.router, prefix="/academic-years", tags=["Academic Years"])
api_router.include_router(campuses.router, prefix="/campuses", tags=["Campuses"])
api_router.include_router(levels.router, prefix="/levels", tags=["Levels"])
api_router.include_router(subjects.router, prefix="/subjects", tags=["Subjects"])
api_router.include_router(departments.router, prefix="/departments", tags=["Departments"])
api_router.include_router(terms.router, prefix="/terms", tags=["Terms"])
api_router.include_router(assessments.router, prefix="/assessments", tags=["Assessments"])
api_router.include_router(teachers.router, prefix="/teachers", tags=["Teachers"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["Attendance"])
api_router.include_router(homework.router, prefix="/homework", tags=["Homework"])


# Finance routes
api_router.include_router(payments.router, prefix="/payments", tags=["Payments"])
api_router.include_router(payment_schedules.router, prefix="/payment-schedules", tags=["Payment Schedules"])

# Operational routes
api_router.include_router(infrastructure.router, prefix="/infrastructure", tags=["Infrastructure"])
api_router.include_router(hr.router, prefix="/hr", tags=["Human Resources"])
api_router.include_router(school_life.router, prefix="/school-life", tags=["School Life"])
api_router.include_router(parents.router, prefix="/parents", tags=["Parents"])
api_router.include_router(admissions.router, prefix="/admissions", tags=["Admissions"])
api_router.include_router(schedule.router, prefix="/schedule", tags=["Schedule"])
api_router.include_router(communication.router, prefix="/communication", tags=["Communication"])
api_router.include_router(dept_portal.router, prefix="/department-portal", tags=["Department Portal"])
api_router.include_router(alumni_portal.router, prefix="/alumni", tags=["Alumni Portal"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["Inventory & POS"])
api_router.include_router(library.router, prefix="/library", tags=["Library"])
api_router.include_router(clubs.router, prefix="/clubs", tags=["Clubs"])
api_router.include_router(incidents.router, prefix="/incidents", tags=["Incidents"])
api_router.include_router(surveys.router, prefix="/surveys", tags=["Surveys"])

# ─── Alias routes (frontend compatibility) ───────────────────────────────────
# These provide the URL paths the frontend expects, delegating to existing logic.

# 1. GET /audit-logs/ → same as GET /audit/ (registered above with same router)

# 2. POST /audit/ and POST /audit/log → added directly in audit.py endpoints

# 3. Enrollments at root — mirrors /infrastructure/enrollments/
api_router.include_router(enrollments_alias_router, prefix="/enrollments", tags=["Enrollments"])

# 4. Invoices at root — mirrors /payments/invoices/
api_router.include_router(invoices_alias_router, prefix="/invoices", tags=["Invoices"])

# 5. Class sessions
api_router.include_router(class_sessions_router, prefix="/class-sessions", tags=["Class Sessions"])

# 6. School events standalone
api_router.include_router(school_events_router, prefix="/school-events", tags=["School Events"])

# 7. Student-Parents link
api_router.include_router(student_parents_router, prefix="/student-parents", tags=["Student-Parents"])

# 8. Student subjects assignment
api_router.include_router(student_subjects_router, prefix="/student-subjects", tags=["Student Subjects"])

# 9. Push subscriptions alias
api_router.include_router(push_subscriptions_router, prefix="/push-subscriptions", tags=["Push Subscriptions"])

# 10. User presence
api_router.include_router(presence_router, prefix="/presence", tags=["Presence"])

# 11. Grades bulk — added directly in grades.py as POST /grades/bulk

# 12. Parents list — added directly in parents.py as GET /parents/

# 13. Users profiles — added directly in users.py as PATCH /users/profiles/{id}/

# 14. Rooms at root — mirrors /infrastructure/rooms/
api_router.include_router(rooms_alias_router, prefix="/rooms", tags=["Rooms"])

# 15. Classrooms at root — mirrors /infrastructure/classrooms/
api_router.include_router(classrooms_alias_router, prefix="/classrooms", tags=["Classrooms"])

# 16. Schedule Slots at root — mirrors /schedule/
api_router.include_router(schedule_slots_alias_router, prefix="/schedule-slots", tags=["Schedule Slots"])
