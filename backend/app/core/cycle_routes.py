"""Registre de classification des routes pour le périmètre par cycle (lot B2a).

Un compte restreint à des cycles (voir ``cycle_scope``) ne peut appeler
qu'une route **explicitement classée** :

- ``INDEPENDENT`` : la réponse ne dépend d'aucun élève ni d'aucune classe
  (coquille de l'application : authentification, profil propre, structure
  de l'établissement en lecture…). Passage autorisé.
- ``FILTERED``   : la route filtre elle-même ses données selon
  ``user["_cycle_ids"]`` (élèves, classes, inscriptions : lot B2b ; scolarité : B2c-1 ; vie
  scolaire : B2c-2 ; finances : B2d ; indicateurs académiques : B2e-1 ; les lots B2e suivants feront migrer les autres routes une à une, avec leurs tests).
  La garde laisse passer, **le handler doit filtrer** (404 pour un objet
  hors périmètre) ; ``test_cycle_route_classification`` vérifie qu'il appelle
  une brique de ``cycle_scope``.
- ``DENY``       : refus ``403 CYCLE_SCOPE_DENIED``. C'est le défaut : toute
  route absente du registre est refusée.

Les entrées ``INDEPENDENT`` / ``FILTERED`` sont **exactes** (méthode + gabarit
de route complet) : une nouvelle route d'un même préfixe n'est jamais
autorisée par héritage. Seules les entrées ``DENY`` peuvent être des
préfixes (le refus est le sens sûr).

Le test ``tests/test_cycle_route_classification.py`` échoue si une route
authentifiée n'est ni dans ce registre ni sous un préfixe ``DENY``.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from fastapi import Request

from app.core.config import settings


class Policy(str, Enum):
    INDEPENDENT = "INDEPENDENT"
    FILTERED = "FILTERED"
    DENY = "DENY"


_V1 = settings.API_V1_STR


def _routes(policy: Policy, methods: str, *paths: str) -> dict[tuple[str, str], Policy]:
    return {
        (method, f"{_V1}{path}"): policy
        for path in paths
        for method in methods.split()
    }


ROUTE_POLICIES: dict[tuple[str, str], Policy] = {
    # --- Authentification et compte propre -------------------------------
    **_routes(Policy.INDEPENDENT, "GET", "/auth/me/", "/auth/sessions/", "/users/me/"),
    **_routes(
        Policy.INDEPENDENT, "POST",
        "/auth/logout/", "/auth/logout-all/", "/auth/change-password/", "/auth/reset-forced-password/",
    ),
    **_routes(Policy.INDEPENDENT, "DELETE", "/auth/sessions/{session_id}/"),
    # Diagnostic technique : jamais utile à un compte restreint.
    **_routes(Policy.DENY, "GET", "/auth/diag/"),
    # --- MFA (compte propre) ---------------------------------------------
    **_routes(
        Policy.INDEPENDENT, "GET",
        "/mfa/backup-codes/", "/mfa/backup-codes/count/", "/mfa/otp/remaining/",
        "/mfa/status/", "/mfa/totp/status/",
    ),
    **_routes(
        Policy.INDEPENDENT, "POST",
        "/mfa/backup-codes/generate/", "/mfa/backup-codes/verify/", "/mfa/otp/request/",
        "/mfa/otp/verify/", "/mfa/toggle/", "/mfa/totp/disable/", "/mfa/totp/enroll/",
        "/mfa/totp/verify/",
    ),
    # --- Appareils, push, notifications (strictement propres à l'utilisateur)
    **_routes(Policy.INDEPENDENT, "GET POST", "/trusted-devices/"),
    **_routes(Policy.INDEPENDENT, "DELETE", "/push-subscriptions/"),
    **_routes(Policy.INDEPENDENT, "POST", "/push-subscriptions/upsert/", "/push-subscriptions/onesignal-link/"),
    **_routes(Policy.INDEPENDENT, "GET", "/notifications/", "/notifications/preferences/", "/notifications/subscriptions/"),
    **_routes(Policy.INDEPENDENT, "PUT", "/notifications/preferences/"),
    **_routes(Policy.INDEPENDENT, "POST", "/notifications/subscriptions/", "/notifications/mark-all-read/"),
    **_routes(Policy.INDEPENDENT, "DELETE", "/notifications/subscriptions/", "/notifications/clear-read/", "/notifications/{notification_id}/"),
    **_routes(Policy.INDEPENDENT, "PATCH", "/notifications/{notification_id}/"),
    # Consentements de l'utilisateur connecté (filtrés sur son id).
    **_routes(Policy.INDEPENDENT, "GET", "/consent/"),
    **_routes(Policy.INDEPENDENT, "POST", "/consent/record/"),
    # --- Établissement : lectures sans donnée d'élève ----------------------
    **_routes(Policy.INDEPENDENT, "GET", "/tenants/settings/", "/tenants/settings/academic-rules/"),
    **_routes(Policy.INDEPENDENT, "GET", "/billing/subscription/"),
    **_routes(
        Policy.INDEPENDENT, "GET",
        "/education/catalog/", "/education/configuration/", "/education/cycles/",
    ),
    # Structure de l'établissement (lecture seule ; Q4 : écritures refusées).
    **_routes(
        Policy.INDEPENDENT, "GET",
        "/levels/", "/subjects/", "/departments/", "/faculties/", "/campuses/",
        "/terms/", "/academic-years/", "/semesters/", "/teaching-units/",
    ),
    # --- Lot B2b : élèves, classes, inscriptions ----------------------------
    # Structure en lecture, sans donnée d'élève ni effectif.
    **_routes(
        Policy.INDEPENDENT, "GET",
        "/search/types/", "/infrastructure/programs/", "/infrastructure/rooms/",
        "/infrastructure/rooms/count/", "/infrastructure/all-subject-levels/",
        "/rooms/", "/rooms/count/",
    ),
    # Espace de l'élève connecté : filtré sur son propre user_id (un compte du
    # personnel n'y obtient que son éventuelle propre fiche élève, sinon 403/liste vide).
    **_routes(Policy.INDEPENDENT, "GET", "/students/me/", "/students/me/reenrollment/", "/students/messaging-recipients/"),
    **_routes(Policy.INDEPENDENT, "POST", "/students/me/reenroll/"),
    # Lectures filtrées par le périmètre (le handler restreint ou répond 404).
    **_routes(
        Policy.FILTERED, "GET",
        "/students/", "/students/{student_id}/", "/students/{student_id}/enrollment/",
        "/classrooms/", "/infrastructure/classrooms/",
        "/infrastructure/classrooms/{class_id}/subjects/", "/infrastructure/classrooms/{class_id}/departments/",
        "/infrastructure/classroom-departments/",
        "/enrollments/", "/enrollments/counts/",
        "/infrastructure/enrollments/", "/infrastructure/enrollments/counts/",
        "/student-parents/", "/student-subjects/", "/search/",
    ),
    # Écritures : chaque identifiant reçu est vérifié (404) AVANT toute écriture.
    **_routes(Policy.FILTERED, "PUT PATCH DELETE", "/students/{student_id}/"),
    **_routes(Policy.FILTERED, "POST", "/enrollments/", "/infrastructure/enrollments/", "/enrollments/{enrollment_id}/transfer/"),
    **_routes(Policy.FILTERED, "DELETE", "/enrollments/{enrollment_id}/"),
    **_routes(Policy.FILTERED, "POST DELETE", "/student-parents/"),
    **_routes(Policy.FILTERED, "POST", "/student-subjects/"),
    **_routes(Policy.FILTERED, "DELETE", "/student-subjects/{subject_id}/"),
    # --- Lot B2c-1 : évaluations, notes, présences, devoirs, relevés ---------
    # Donnée d'une classe (évaluation, devoir, séance) : la classe doit être dans le périmètre.
    # Donnée d'un élève (note, présence, rendu, relevé, moyenne, historique) : l'élève doit y
    # être (l'historique suit l'élève). Écritures : élève ET classe vérifiés (404) avant toute
    # écriture, lot refusé en entier si un seul élément est hors périmètre.
    **_routes(Policy.FILTERED, "GET POST", "/assessments/", "/attendance/", "/grades/", "/homework/"),
    **_routes(Policy.FILTERED, "GET PUT DELETE", "/assessments/{id}/", "/grades/{grade_id}/", "/homework/{homework_id}/"),
    **_routes(Policy.FILTERED, "POST", "/attendance/bulk/", "/grades/bulk", "/homework/{homework_id}/submit/",
              "/homework/submissions/{submission_id}/grade/"),
    **_routes(Policy.FILTERED, "GET", "/attendance/stats/", "/grades/history/", "/grade-history/",
              "/grades/student/{student_id}/average/", "/transcripts/{student_id}/",
              "/homework/submissions/{student_id}/", "/homework-submissions/", "/student-check-ins/",
              "/class-sessions/", "/class-sessions/active/"),
    **_routes(Policy.FILTERED, "PATCH DELETE", "/attendance/{attendance_id}/"),
    **_routes(Policy.FILTERED, "PUT", "/homework/{homework_id}/submissions/{submission_id}/",
              "/homework-submissions/{submission_id}"),
    # Sessions d'examen LMD : rattachées à un semestre (structure), pas à une classe. Lecture
    # filtrée (le nombre d'évaluations ne compte que les classes du compte) ; création et
    # modification restent DENY (Q4 : écritures de structure réservées aux comptes non restreints).
    **_routes(Policy.FILTERED, "GET", "/exam-sessions/"),
    # Présence en ligne : le compte ne peut écrire que la sienne (un autre utilisateur exige
    # TENANT_ADMIN/SUPER_ADMIN, jamais restreints) ; aucune donnée d'élève ni de classe.
    **_routes(Policy.INDEPENDENT, "PUT", "/presence/"),
    # --- Lot B2c-2 : vie scolaire, bulletins, incidents, alertes, badges, rendez-vous ----------
    # Jumelles /school-life/... des routes B2c-1 : mêmes règles (élève ET classe/évaluation vérifiés
    # avant toute écriture, 404 uniforme).
    **_routes(Policy.FILTERED, "GET POST", "/school-life/assessments/", "/school-life/attendance/",
              "/school-life/grades/"),
    **_routes(Policy.FILTERED, "PUT DELETE", "/school-life/assessments/{assessment_id}/",
              "/school-life/attendance/{attendance_id}/", "/school-life/grades/{grade_id}/"),
    # Pointages (donnée d'élève), séances de pointage (donnée de classe), cartes, badges, élèves sans badge.
    **_routes(Policy.FILTERED, "GET POST", "/school-life/check-ins/", "/school-life/check-ins/sessions/"),
    **_routes(Policy.FILTERED, "GET", "/school-life/check-ins/assignments/", "/school-life/check-ins/badges/",
              "/school-life/badges/", "/school-life/students-without-badges/", "/school-life/student-cards/"),
    **_routes(Policy.FILTERED, "POST", "/school-life/check-ins/sessions/start/", "/school-life/student-cards/issue/"),
    **_routes(Policy.FILTERED, "PATCH", "/school-life/check-ins/sessions/{session_id}/end/"),
    **_routes(Policy.FILTERED, "DELETE", "/school-life/student-cards/{student_id}/"),
    **_routes(Policy.FILTERED, "GET POST", "/student-badges/"),
    **_routes(Policy.FILTERED, "DELETE", "/student-badges/{badge_id}/"),
    # Bulletins et attestations : élève ET classe vérifiés AVANT la mise en file ARQ (le worker n'a pas
    # d'utilisateur) ; une tâche n'est lisible que par son créateur restreint.
    **_routes(Policy.FILTERED, "POST", "/school-life/generate-certificate/pdf/",
              "/school-life/generate-report-card/pdf/", "/school-life/generate-report-card/v2/",
              "/school-life/generate-report-cards/batch/"),
    **_routes(Policy.FILTERED, "GET", "/school-life/jobs/{job_id}/", "/school-life/report-cards/class-summary/"),
    # Alertes précoces (suivent l'élève) ; le résumé n'agrège que les alertes des élèves du périmètre.
    **_routes(Policy.FILTERED, "GET POST", "/school-life/early-warnings/"),
    **_routes(Policy.FILTERED, "GET", "/school-life/early-warnings/paginated/", "/school-life/early-warnings/summary/"),
    **_routes(Policy.FILTERED, "PUT", "/school-life/early-warnings/{warning_id}/"),
    # Incidents : visibles seulement si leur élève est dans le périmètre.
    **_routes(Policy.FILTERED, "GET POST", "/incidents/"),
    **_routes(Policy.FILTERED, "PUT", "/incidents/{incident_id}/", "/incidents/{incident_id}/assign/",
              "/incidents/{incident_id}/resolve/"),
    # Rendez-vous parents-enseignants : un rendez-vous d'élève hors périmètre est masqué (404).
    **_routes(Policy.FILTERED, "GET", "/school-life/appointment-slots/appointments/"),
    **_routes(Policy.FILTERED, "PATCH", "/school-life/appointment-slots/appointments/{appointment_id}/"),
    **_routes(Policy.FILTERED, "DELETE", "/school-life/appointment-slots/{slot_id}/"),
    # Créneaux : lecture sans donnée d'élève ni de classe (INDEPENDENT) ; création et lot FILTERED :
    # un compte restreint ne crée que ses propres créneaux (404 sinon, lot tout ou rien).
    **_routes(Policy.INDEPENDENT, "GET", "/school-life/appointment-slots/"),
    **_routes(Policy.FILTERED, "POST", "/school-life/appointment-slots/", "/school-life/appointment-slots/bulk/"),
    **_routes(Policy.FILTERED, "GET POST", "/school-life/event-registrations/"),
    # Calendrier, ressources réservables, réservations : lecture sans donnée d'élève (vérifié dans le
    # code) ; les écritures restent DENY (données d'établissement, Q4). gamification/stats reste DENY.
    **_routes(Policy.INDEPENDENT, "GET", "/school-life/events/", "/school-life/events/export.ics",
              "/school-life/bookable-resources/", "/school-life/bookings/"),
    # --- Lot B2d : finances ------------------------------------------------------------------
    # Une donnée financière suit son élève (facture, paiement via son élève, échéancier via la
    # facture) : visible ssi l'élève est dans le périmètre. Écritures : chaque identifiant reçu ou
    # résolu (facture, paiement, échéancier, élève) vérifié AVANT toute écriture, envoi ou mise en
    # file ; relances en lot tout ou rien ; 404 identique inexistant / hors périmètre. Les agrégats
    # (totaux, aperçu, indicateurs) sont calculés sur le seul périmètre.
    **_routes(Policy.FILTERED, "GET POST", "/payments/invoices/", "/invoices/"),
    **_routes(Policy.FILTERED, "PUT DELETE", "/payments/invoices/{invoice_id}/", "/invoices/{invoice_id}/"),
    **_routes(Policy.FILTERED, "GET", "/payments/payments/", "/payments/export/", "/payments/overview/",
              "/payments/{payment_id}/receipt/"),
    **_routes(Policy.FILTERED, "POST", "/payments/register/", "/payments/{payment_id}/reverse/",
              "/payments/intent/", "/payments/send-invoice-email/", "/payments/send-reminders/"),
    **_routes(Policy.FILTERED, "GET POST DELETE", "/payment-schedules/"),
    **_routes(Policy.FILTERED, "GET PUT DELETE", "/payment-schedules/{schedule_id}"),
    **_routes(Policy.FILTERED, "GET", "/analytics/financial-kpis/", "/analytics/revenue-trend/",
              "/analytics/revenue-by-category/", "/analytics/debt-aging/"),
    # Tarifs (aucune donnée d'élève), compteur de référence (jeton aléatoire), catalogue d'offres
    # de la plateforme : lecture seule. Écritures des frais, abonnement : DENY (Q4 / hors périmètre).
    **_routes(Policy.INDEPENDENT, "GET", "/payments/fees/", "/payments/sequence/", "/billing/plans/"),
    # --- Lot B2e-1 : indicateurs académiques et tableau de bord ---------------------------------
    # Agrégats, moyennes, taux et listes calculés sur les seuls élèves du périmètre (notes, présences,
    # inscriptions, factures, scores de risque) ; classes et enseignants comptés dans les classes du
    # périmètre. cash-flow-forecast (projection fictive), ministry-* et elearning restent DENY.
    **_routes(Policy.FILTERED, "GET", "/analytics/academic-kpis/", "/analytics/academic-stats/",
              "/analytics/students-at-risk/", "/analytics/operational-kpis/",
              "/analytics/attendance-trend/", "/analytics/grades-distribution/",
              "/analytics/dashboard-kpis/", "/analytics/risk-scores/summary/",
              "/analytics/risk-scores/"),
}

# Familles refusées d'office (préfixes). Toute route qui n'est pas dans
# ROUTE_POLICIES est de toute façon refusée : ces préfixes servent à
# documenter le choix et à ne forcer la classification explicite que pour
# les nouvelles familles de routes (auth, mfa, push-subscriptions et
# trusted-devices n'ont volontairement aucun préfixe : tout y est listé). Q6 : hr, communication, users (hors
# /me), rgpd, inventory, library, surveys, clubs, alumni, elearning, audit
# et ai sont refusés ; les données d'élèves, de finances et les agrégats le
# restent jusqu'aux lots B2b à B2e.
DENY_PREFIXES: tuple[str, ...] = tuple(
    f"{_V1}/{family}/"
    for family in (
        "academic-years", "achievement-definitions", "admissions", "ai", "alumni", "analytics",
        "assessments", "attendance", "audit", "billing", "campuses", "class-sessions",
        "classrooms", "clubs", "communication", "consent", "course-discussions", "courses",
        "department-portal", "departments", "education", "enrollments", "exam-sessions",
        "faculties", "gamification", "grade-history", "grades", "homework", "homework-submissions",
        "hr", "import", "incidents", "infrastructure", "inventory", "invoices", "kiosk", "levels",
        "library", "me", "ministry", "notifications", "parents", "payment-schedules",
        "payments", "platform", "point-transactions", "presence", "public-pages", "quiz-questions",
        "rgpd", "rooms", "schedule", "schedule-slots", "school-events", "school-life", "search",
        "semesters", "shared-note-comments", "shared-note-likes", "shared-notes", "storage",
        "student-achievements", "student-badges", "student-check-ins", "student-parents",
        "student-subjects", "students", "subject-preferred-rooms", "subjects", "surveys",
        "teachers", "teaching-units", "tenants", "terms", "transcripts", "users", "webhooks",
    )
)


def is_classified(method: str, path_format: str) -> bool:
    """Vrai si la route a une classification explicite (entrée exacte ou
    préfixe ``DENY``). Utilisé par le test de classification."""
    return (method.upper(), path_format) in ROUTE_POLICIES or path_format.startswith(DENY_PREFIXES)


def policy_for(method: str, path_format: Optional[str]) -> Policy:
    """Politique d'une route. Défaut : ``DENY`` (route inconnue ou non résolue)."""
    if not path_format:
        return Policy.DENY
    return ROUTE_POLICIES.get((method.upper(), path_format), Policy.DENY)


def resolve_route_template(request: Request) -> Optional[str]:
    """Gabarit complet de la route appelée (ex. ``/api/v1/students/{student_id}/``).

    Depuis FastAPI 0.139, ``scope["route"]`` désigne la route *d'origine*, sans
    le préfixe du ``include_router`` (``/me/`` au lieu de ``/api/v1/users/me/``) :
    inutilisable seul. Le gabarit complet vient du contexte de route effectif
    (``scope["fastapi"]["effective_route_context"]``). Si rien de fiable n'est
    disponible, on renvoie ``None`` : l'appelant refuse (jamais de passage par
    défaut). Le test ``test_cycle_scope_gate`` vérifie ce comportement sur de
    vraies requêtes ; la version de FastAPI est épinglée (<0.140).
    """
    scope = request.scope
    fastapi_scope = scope.get("fastapi")
    if isinstance(fastapi_scope, dict):
        context = fastapi_scope.get("effective_route_context")
        template = getattr(context, "path_format", None)
        if isinstance(template, str) and template:
            return template
    # Repli : ancien comportement de FastAPI/Starlette, où la route porte le
    # chemin complet. Accepté seulement s'il commence par le préfixe de l'API.
    template = getattr(scope.get("route"), "path_format", None)
    if isinstance(template, str) and template.startswith(f"{_V1}/"):
        return template
    return None
