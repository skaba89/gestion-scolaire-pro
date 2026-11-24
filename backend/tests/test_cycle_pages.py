"""Lot B3 (2026-11-23) : écrans de l'administration selon le périmètre par cycle.

- chaque écran du routeur et du menu d'administration est rattaché à ses routes
  (``app/core/cycle_pages.py``) et chaque route citée existe dans l'API ;
- l'accès d'un écran se déduit du classement serveur des routes (pas de seconde liste) ;
- ``GET /education/my-scope/`` : rien à masquer pour un compte non restreint ; pour un compte
  restreint, ses cycles et l'accès écran par écran.
"""
import re
from pathlib import Path

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.cycle_pages import ADMIN_PAGE_ROUTES, page_policies  # noqa: E402
from app.core.cycle_routes import Policy, policy_for  # noqa: E402
from app.core.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from test_cycle_scope_gate import school  # noqa: E402,F401

REPO = Path(__file__).resolve().parents[2]
needs_postgres = pytest.mark.skipif(engine.dialect.name == "sqlite", reason="périmètre par cycle : PostgreSQL")


def _router_pages() -> set[str]:
    source = (REPO / "src/routes/AdminRoutes.tsx").read_text(encoding="utf-8")
    return {p for p in re.findall(r'<Route path="([^"]+)"', source) if ":" not in p}


def _menu_pages() -> set[str]:
    source = (REPO / "src/components/layouts/AdminLayout.tsx").read_text(encoding="utf-8")
    return {p.strip("/") for p in re.findall(r'getTenantUrl\("/admin(/[^"?#]*)?', source)}


def test_every_admin_screen_and_menu_entry_is_mapped():
    missing = (_router_pages() | _menu_pages()) - set(ADMIN_PAGE_ROUTES)
    assert not missing, f"Écrans d'administration sans rattachement dans cycle_pages.py : {sorted(missing)}"


def test_every_mapped_route_exists_in_the_api():
    paths = app.openapi()["paths"]
    unknown = sorted(
        (page, route) for page, routes in ADMIN_PAGE_ROUTES.items() for route in routes
        if "get" not in paths.get(f"/api/v1{route}", {})
    )
    assert not unknown, f"Routes GET inexistantes citées dans cycle_pages.py : {unknown}"


def test_screen_access_is_derived_from_the_route_classification():
    policies = page_policies()
    for page, routes in ADMIN_PAGE_ROUTES.items():
        expected = all(policy_for("GET", f"/api/v1{r}") is not Policy.DENY for r in routes)
        assert policies[page] is expected, page
    # Repères : écrans adaptés ouverts, modules encore refusés masqués, aide toujours visible.
    assert policies["students"] and policies["finances"] and policies["grades"] and policies[""]
    assert not policies["users"] and not policies["hr"] and not policies["admissions"]
    # Messagerie ouverte aux comptes restreints (Q-B3-2) ; annonces en lecture seule.
    assert policies["messages"] and policies["announcements"]
    assert policies["documentation"] and policies["profile"]


def test_my_scope_route_is_independent():
    assert policy_for("GET", "/api/v1/education/my-scope/") is Policy.INDEPENDENT


def test_layout_wide_messaging_badge_never_fails_for_a_restricted_account():
    """La mise en page interroge ces routes sur chaque écran (parcours E2E 23)."""
    for route in ("/api/v1/communication/messaging/poll/", "/api/v1/communication/messaging/unread-count/"):
        assert policy_for("GET", route) is Policy.INDEPENDENT, route


@needs_postgres
def test_my_scope_hides_nothing_for_an_unrestricted_account(school):
    response = client.get("/api/v1/education/my-scope/", headers=school["headers"]("secretary_free"))
    assert response.status_code == 200, response.text
    assert response.json() == {"restricted": False, "cycles": [], "pages": None, "cycle_policy_available": True}


@needs_postgres
def test_my_scope_lists_the_cycles_and_screens_of_a_restricted_account(school):
    response = client.get("/api/v1/education/my-scope/", headers=school["headers"]("secretary"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["restricted"] is True and body["cycle_policy_available"] is True
    assert [c["name"] for c in body["cycles"]] == ["primaire"]
    assert body["pages"] == page_policies()
    assert body["pages"]["students"] is True and body["pages"]["users"] is False


@needs_postgres
def test_a_cycle_of_another_school_is_never_listed(school):
    """``foreign_assigned`` n'a d'affectation que dans un autre établissement : non restreint ici."""
    body = client.get("/api/v1/education/my-scope/", headers=school["headers"]("foreign_assigned")).json()
    assert body["restricted"] is False and body["cycles"] == []
