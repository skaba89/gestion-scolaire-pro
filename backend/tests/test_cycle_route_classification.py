"""Chaque route authentifiée doit être classée pour le périmètre par cycle.

Le refus par défaut protège déjà un compte restreint, mais ce test force
l'auteur d'une nouvelle route à choisir sa politique en connaissance de cause
(voir ``app/core/cycle_routes.py``).
"""
from conftest import get_test_client

get_test_client()

from fastapi.routing import APIRoute, APIWebSocketRoute, iter_route_contexts  # noqa: E402

from app.core.cycle_routes import ROUTE_POLICIES, Policy, is_classified, policy_for  # noqa: E402
from app.core.security import get_current_user, verify_token  # noqa: E402
from app.main import app  # noqa: E402


def _uses_current_user(dependant) -> bool:
    return any(d.call is get_current_user or _uses_current_user(d) for d in dependant.dependencies)


def _authenticated_routes() -> set[tuple[str, str]]:
    pairs = set()
    for context in iter_route_contexts(app.routes):
        if not isinstance(context.original_route, APIRoute) or context.dependant is None:
            continue
        if _uses_current_user(context.dependant):
            for method in context.methods - {"HEAD", "OPTIONS"}:
                pairs.add((method, context.path_format))
    return pairs


def test_every_authenticated_route_is_classified():
    routes = _authenticated_routes()
    assert len(routes) > 100, "l'énumération des routes ne fonctionne plus"
    unclassified = sorted(pair for pair in routes if not is_classified(*pair))
    assert not unclassified, (
        "Routes authentifiées sans classification de périmètre par cycle :\n  "
        + "\n  ".join(f"{m} {p}" for m, p in unclassified)
        + "\nClassez-les dans backend/app/core/cycle_routes.py : entrée exacte INDEPENDENT "
        "(la réponse ne dépend d'aucun élève ni d'aucune classe) ou FILTERED (la route filtre "
        "par user['_cycle_ids']), sinon ajoutez la famille aux DENY_PREFIXES (refus par défaut)."
    )


def test_no_registry_entry_is_orphan():
    routes = _authenticated_routes()
    orphans = sorted(key for key in ROUTE_POLICIES if key not in routes)
    assert not orphans, f"Entrées du registre sans route correspondante : {orphans}"


def test_default_is_deny():
    assert policy_for("GET", "/api/v1/une-route-inconnue/") is Policy.DENY
    assert policy_for("GET", None) is Policy.DENY


# Briques de ``cycle_scope`` dont l'appel prouve qu'un handler FILTERED applique le périmètre.
SCOPE_HELPERS = (
    "scoped_class_ids", "is_cycle_restricted", "require_student_in_scope", "require_class_in_scope",
    "require_enrollment_in_scope", "student_scope_clause", "class_scope_clause", "allowed_class_ids",
    # Lot B2c-1 : briques par lot, par objet, fragments SQL et enveloppes locales aux handlers.
    "require_students_in_scope", "require_classes_in_scope", "require_assessments_in_scope",
    "require_assessment_in_scope", "require_homework_in_scope", "require_submission_in_scope",
    "student_scope_sql", "class_scope_sql", "_require_grade_write_in_scope",
    "_require_attendance_write_in_scope", "_require_existing_attendance_in_scope", "_class_sessions_scope",
    # Lot B2c-2 : enveloppes locales aux handlers de la vie scolaire.
    "_require_attendance_record_in_scope", "_require_check_in_session_in_scope",
    "_require_report_card_in_scope", "_require_slot_without_out_of_scope_appointment",
    "_require_incident_in_scope", "_early_warning_scope", "_require_own_slot_in_scope",
    # Lot B2d : finances.
    "student_scope_and", "require_invoice_in_scope", "require_invoices_in_scope",
    "require_payment_in_scope", "require_schedule_in_scope",
    # Lot B2e-1 : indicateurs ventilés par classe et nombre d'enseignants du périmètre.
    "class_scope_and", "_teacher_count_sql",
    # Lot B2e-3 : données rattachées à un niveau (candidatures).
    "level_scope_and",
    # CYCLE-PORTAL-GAP-01 : portail de département (point unique d'intersection).
    "_get_department_classroom_ids", "_validate_exam_fks", "_require_exam_writable",
    "_require_alert_classes_in_scope",
    # Messagerie : destinataires et fils WhatsApp du périmètre.
    "_recipient_scope_sql", "_require_thread_in_scope",
    # Emploi du temps et enseignants.
    "_require_slot_in_scope", "_require_assignment_class_in_scope", "_require_existing_assignment_in_scope",
)


# Alias qui délèguent entièrement à une route canonique FILTERED : c'est le code
# de la route canonique qui doit appeler une brique de périmètre.
DELEGATING_ALIASES = {
    # GRADE-HISTORY-LEAK-01 (#568) : l'alias délègue à list_grade_history.
    ("GET", "/api/v1/grade-history/"): ("GET", "/api/v1/grades/history/"),
    # B2d : l'alias de suppression délègue au verrou et au périmètre de la route canonique ; les
    # autres méthodes de /invoices/ portent leurs propres contrôles (pas de délégation).
    ("DELETE", "/api/v1/invoices/{invoice_id}/"): ("DELETE", "/api/v1/payments/invoices/{invoice_id}/"),
}


def test_every_filtered_route_handler_calls_a_scope_helper():
    """Heuristique : une route FILTERED dont le code n'appelle aucune brique de
    périmètre est un trou (la garde l'a laissée passer sans filtrage)."""
    import inspect

    handlers = {}
    for context in iter_route_contexts(app.routes):
        if isinstance(context.original_route, APIRoute):
            for method in context.methods:
                handlers[(method, context.path_format)] = context.original_route.endpoint
    filtered = sorted(key for key, policy in ROUTE_POLICIES.items() if policy is Policy.FILTERED)
    assert len(filtered) >= 60
    for alias, canonical in DELEGATING_ALIASES.items():
        assert ROUTE_POLICIES.get(canonical) is Policy.FILTERED, canonical
        assert handlers[canonical].__name__ in inspect.getsource(handlers[alias]), alias
    missing = [
        key for key in filtered
        if not any(
            helper in inspect.getsource(handlers[DELEGATING_ALIASES.get(key, key)])
            for helper in SCOPE_HELPERS
        )
    ]
    assert not missing, f"Routes FILTERED sans appel à une brique de périmètre : {missing}"


def test_b2b_routes_kept_deny():
    for method, path in (
        ("POST", "/api/v1/students/"), ("GET", "/api/v1/students/dashboard/"),
        ("POST", "/api/v1/classrooms/"), ("POST", "/api/v1/infrastructure/classrooms/"),
        ("PUT", "/api/v1/infrastructure/classrooms/{class_id}/"),
        ("DELETE", "/api/v1/infrastructure/classrooms/{class_id}/"),
        ("POST", "/api/v1/infrastructure/classrooms/{class_id}/subjects/{subject_id}/"),
        ("DELETE", "/api/v1/infrastructure/classrooms/{class_id}/subjects/{subject_id}/"),
        ("POST", "/api/v1/infrastructure/programs/"), ("POST", "/api/v1/infrastructure/rooms/"),
    ):
        assert policy_for(method, path) is Policy.DENY, (method, path)


def test_exact_entries_do_not_leak_to_other_methods_or_paths():
    assert policy_for("GET", "/api/v1/levels/") is Policy.INDEPENDENT
    assert policy_for("POST", "/api/v1/levels/") is Policy.DENY
    assert policy_for("GET", "/api/v1/students/") is Policy.FILTERED
    assert policy_for("POST", "/api/v1/students/") is Policy.DENY
    assert policy_for("GET", "/api/v1/students/{student_id}/grades/") is Policy.DENY
    # GET /users/ est FILTERED (comptes du personnel) ; la gestion des comptes reste refusée.
    assert policy_for("GET", "/api/v1/users/") is Policy.FILTERED
    assert policy_for("POST", "/api/v1/users/") is Policy.DENY
    assert policy_for("GET", "/api/v1/users/pending/") is Policy.DENY
    assert policy_for("GET", "/api/v1/users/{user_id}/") is Policy.DENY


# Routes authentifiées SANS get_current_user : la garde centrale ne les voit
# pas, elles doivent appliquer elles-mêmes le périmètre par cycle. Toute
# nouvelle socket ou route authentifiée hors get_current_user doit être
# ajoutée ici avec sa justification (et le test qui prouve la garde propre).
SELF_GUARDED_ROUTES = {
    "/api/v1/realtime/ws/{tenant_id}/{user_id}": (
        "WebSocket à JWT maison : refuse (4003) tout compte restreint par cycle, "
        "voir test_cycle_scope_gate.py::test_websocket_*"
    ),
}


def _dependency_calls(dependant):
    for dep in dependant.dependencies:
        yield dep.call
        yield from _dependency_calls(dep)


def _routes_outside_current_user() -> set[str]:
    found = set()
    for context in iter_route_contexts(app.routes):
        original = context.original_route
        if isinstance(original, APIWebSocketRoute):
            # Pour une WebSocket, le chemin complet est sur la route Starlette effective.
            found.add(context._effective_route.starlette_route.path)
        elif isinstance(original, APIRoute) and context.dependant is not None:
            calls = list(_dependency_calls(context.dependant))
            if verify_token in calls and get_current_user not in calls:
                found.add(context.path_format)
    return found


def test_routes_authenticated_outside_get_current_user_are_listed_with_justification():
    found = _routes_outside_current_user()
    unlisted = sorted(found - set(SELF_GUARDED_ROUTES))
    assert not unlisted, (
        "Routes authentifiées hors get_current_user (WebSocket, verify_token seul) : la garde de "
        f"périmètre par cycle ne s'applique pas. Appliquez-la dans la route puis listez-la dans "
        f"SELF_GUARDED_ROUTES avec sa justification : {unlisted}"
    )
    assert not (set(SELF_GUARDED_ROUTES) - found), "Entrée SELF_GUARDED_ROUTES orpheline"
