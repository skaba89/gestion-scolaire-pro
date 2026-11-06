"""Regression for FastAPI/Starlette route priority of clear-read notifications.

The parameterized DELETE /{notification_id}/ must not intercept the literal
DELETE /clear-read/ or the request fails UUID validation with HTTP 422.
"""
from starlette.routing import Match
from app.api.v1.endpoints.core.notifications import router


def test_clear_read_delete_matches_literal_route_before_uuid_route():
    scope = {
        "type": "http",
        "method": "DELETE",
        "path": "/clear-read/",
        "root_path": "",
    }
    matches = [
        route for route in router.routes
        if "DELETE" in getattr(route, "methods", set())
        and route.matches(scope)[0] == Match.FULL
    ]
    assert matches, "Missing DELETE /clear-read/ route"
    assert matches[0].path == "/clear-read/"
    assert matches[0].endpoint.__name__ == "clear_read_notifications"


def test_individual_notification_delete_still_matches_uuid_path():
    scope = {
        "type": "http",
        "method": "DELETE",
        "path": "/00000000-0000-4000-8000-000000000001/",
        "root_path": "",
    }
    matches = [
        route for route in router.routes
        if "DELETE" in getattr(route, "methods", set())
        and route.matches(scope)[0] == Match.FULL
    ]
    assert matches
    assert matches[0].endpoint.__name__ == "delete_notification"
