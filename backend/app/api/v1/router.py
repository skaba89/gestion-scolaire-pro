from fastapi import APIRouter
from app.api.v1.endpoints.core import users, storage, realtime, auth, rgpd, analytics, mfa, tenants, notifications, webhooks, audit, health, ai
from app.api.v1.endpoints.academic import students, grades, academic_years, campuses, levels, subjects, departments, terms, assessments, teachers, attendance
from app.api.v1.endpoints.finance import payments
from app.api.v1.endpoints.operational import infrastructure, hr, school_life, parents, admissions, schedule, communication, surveys
from app.api.v1.endpoints.operational import departments as dept_portal
from app.api.v1.endpoints.operational import alumni as alumni_portal
from app.api.v1.endpoints.operational import inventory, library, clubs, incidents

api_router = APIRouter()

# Core routes
api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["Tenants"])
api_router.include_router(rgpd.router, prefix="/rgpd", tags=["RGPD"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
api_router.include_router(audit.router, prefix="/audit", tags=["Audit Logs"])
api_router.include_router(mfa.router, prefix="/mfa", tags=["MFA"])
api_router.include_router(storage.router, prefix="/storage", tags=["Storage"])
api_router.include_router(realtime.router, prefix="/realtime", tags=["Realtime"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["Webhooks"])
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

# Finance routes
api_router.include_router(payments.router, prefix="/payments", tags=["Payments"])

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
