"""Lot B3 : écrans de l'administration accessibles à un compte limité à des cycles.

Le serveur reste la seule source de vérité : chaque écran est rattaché aux routes ``GET``
dont il a besoin pour s'afficher, et son accès se **déduit** du classement de ces routes
(``cycle_routes.policy_for``) — jamais d'une seconde liste tenue côté frontend. Un écran
est accessible à un compte restreint si aucune de ses routes n'est ``DENY`` ; un écran sans
route (aide, profil, paramètres personnels) l'est toujours.

Clé = chemin de l'écran sous ``/admin/`` (« » pour le tableau de bord), tel que déclaré dans
``src/routes/AdminRoutes.tsx``. ``test_cycle_pages`` vérifie que chaque entrée du menu
d'administration est présente ici et que chaque route citée existe dans l'API : un nouvel
écran non rattaché fait échouer la CI au lieu d'apparaître par défaut.
"""
from __future__ import annotations

from app.core.cycle_routes import Policy, policy_for

_V1 = "/api/v1"

ADMIN_PAGE_ROUTES: dict[str, tuple[str, ...]] = {
    # Tableau de bord et indicateurs (B2e)
    "": ("/analytics/academic-kpis/", "/analytics/financial-kpis/"),
    "analytics": ("/analytics/dashboard-kpis/",),
    "decision-support": ("/analytics/academic-kpis/", "/analytics/students-at-risk/"),
    "ai-insights": ("/analytics/students-at-risk/", "/analytics/academic-kpis/"),
    # Élèves, inscriptions (B2b)
    "students": ("/students/",),
    "class-lists": ("/infrastructure/enrollments/",),
    "enrollments": ("/enrollments/",),
    "enrollment-stats": ("/admissions/stats/",),
    "admissions": ("/admissions/",),
    # Scolarité, vie scolaire (B2c)
    "grades": ("/assessments/", "/grades/"),
    "report-cards": ("/school-life/report-cards/class-summary/",),
    "certificates": ("/students/",),
    "badges": ("/school-life/check-ins/", "/school-life/badges/"),
    "live-attendance": ("/enrollments/", "/school-life/check-ins/"),
    "scan": ("/school-life/check-ins/badges/",),
    "incidents": ("/incidents/",),
    "early-warnings": ("/school-life/early-warnings/",),
    "calendar": ("/school-life/events/",),
    "events": ("/school-life/events/",),
    "bookings": ("/school-life/bookings/",),
    "gamification": ("/school-life/gamification/stats/",),
    "schedule": ("/schedule/",),
    "kiosk-devices": ("/kiosk/devices/",),
    # Finances (B2d)
    "finances": ("/payments/invoices/", "/payments/overview/"),
    "accounting-exports": ("/payments/export/",),
    "billing": ("/billing/subscription/",),
    # Structure (lecture seule pour un compte restreint)
    "academic-years": ("/academic-years/",),
    "terms": ("/terms/",),
    "levels": ("/levels/",),
    "classrooms": ("/infrastructure/classrooms/",),
    "subjects": ("/subjects/",),
    "campuses": ("/campuses/",),
    "departments": ("/departments/",),
    "faculties": ("/faculties/",),
    "programs": ("/infrastructure/programs/",),
    "semesters": ("/semesters/",),
    "teaching-units": ("/teaching-units/",),
    "academic-rules": ("/tenants/settings/academic-rules/",),
    # Modules encore refusés à un compte restreint (décision Q-B3-2 : ouverts lot par lot)
    "users": ("/users/",),
    "teachers": ("/teachers/",),
    "teacher-hours": ("/hr/teacher-work-hours/",),
    "hr": ("/hr/employees/",),
    "messages": ("/communication/conversations/", "/communication/messaging/recipients/"),
    "announcements": ("/communication/announcements/",),
    "forums": ("/communication/forums/",),
    "library": ("/library/resources/",),
    "inventory": ("/inventory/items/",),
    "inventory/analytics": ("/inventory/items/",),
    "orders": ("/inventory/orders/",),
    "orders/history": ("/inventory/orders/",),
    "elearning": ("/analytics/elearning/courses/",),
    "clubs": ("/clubs/",),
    "surveys": ("/surveys/",),
    "careers": ("/alumni/careers/jobs/",),
    "alumni-mentors": ("/alumni/admin/mentors/",),
    "alumni-requests": ("/alumni/admin/document-requests/",),
    "exports": ("/students/", "/users/"),
    "audit-logs": ("/audit/",),
    "security": ("/audit/",),
    "data-quality": ("/audit/data-quality/",),
    "rgpd": ("/rgpd/requests/",),
    "settings/rgpd": ("/rgpd/export-history/me/",),
    "data-import": ("/import/students/template/",),
    "public-pages": ("/public-pages/",),
    "public-pages/messages": ("/public-pages/submissions/",),
    "landing": ("/public-pages/",),
    "ministry-reporting": ("/ministry/overview/",),
    # Administration de la plateforme / mise en route de l'établissement
    "tenants": ("/tenants/",),
    "create-tenant": ("/tenants/",),
    "onboarding": ("/tenants/",),
    # Écrans personnels ou d'aide : toujours accessibles
    "settings": (),
    "profile": (),
    "documentation": (),
    "testing-guide": (),
    "university-guide": (),
}


def page_policies() -> dict[str, bool]:
    """Accès de chaque écran pour un compte **restreint** (déduit du classement des routes)."""
    return {
        page: all(policy_for("GET", f"{_V1}{route}") is not Policy.DENY for route in routes)
        for page, routes in ADMIN_PAGE_ROUTES.items()
    }
