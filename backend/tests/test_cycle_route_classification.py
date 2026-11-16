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


def test_default_is_deny_and_b2a_has_no_filtered_route():
    assert policy_for("GET", "/api/v1/une-route-inconnue/") is Policy.DENY
    assert policy_for("GET", None) is Policy.DENY
    assert Policy.FILTERED not in set(ROUTE_POLICIES.values())


def test_exact_entries_do_not_leak_to_other_methods_or_paths():
    assert policy_for("GET", "/api/v1/levels/") is Policy.INDEPENDENT
    assert policy_for("POST", "/api/v1/levels/") is Policy.DENY
    assert policy_for("GET", "/api/v1/students/") is Policy.DENY
    assert policy_for("GET", "/api/v1/users/") is Policy.DENY


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
