"""Tests des métriques métier Prometheus (Phase 3 — observabilité)."""
import re

import pytest

from conftest import get_test_client

client = get_test_client()

pytestmark = pytest.mark.skipif(
    client.get("/metrics/").status_code != 200,
    reason="prometheus_client non installé — endpoint /metrics indisponible",
)


def _metric_value(metrics_text: str, name: str, labels: dict) -> float:
    """Extrait la valeur d'un compteur depuis l'exposition Prometheus."""
    for line in metrics_text.splitlines():
        if not line.startswith(name + "{"):
            continue
        if all(f'{k}="{v}"' in line for k, v in labels.items()):
            return float(line.rsplit(" ", 1)[1])
    return 0.0


def _scrape() -> str:
    response = client.get("/metrics/")
    assert response.status_code == 200
    return response.text


def test_metrics_endpoint_exposes_http_counters():
    """L'endpoint /metrics doit exposer les compteurs HTTP de base."""
    text = _scrape()
    assert "http_requests_total" in text
    assert "http_request_duration_seconds" in text


def test_failed_login_increments_business_counter():
    """Un login échoué doit incrémenter business_events_total{event=login,outcome=failure}."""
    labels = {"event": "login", "outcome": "failure"}
    before = _metric_value(_scrape(), "business_events_total", labels)

    # 429 (rate limit) reste un échec de login du point de vue métier :
    # le compteur doit s'incrémenter dans les deux cas.
    response = client.post(
        "/api/v1/auth/login/",
        data={"username": "no-such-user@test.local", "password": "wrong-password"},
    )
    assert response.status_code in (401, 429)

    after = _metric_value(_scrape(), "business_events_total", labels)
    assert after == before + 1


def test_forbidden_request_increments_authz_denied_counter():
    """Une réponse 403 doit incrémenter authz_denied_total pour l'endpoint concerné."""
    endpoint = "/api/v1/auth/login-diagnostics/"
    labels = {"method": "GET", "endpoint": endpoint}
    before = _metric_value(_scrape(), "authz_denied_total", labels)

    response = client.get(endpoint, params={"secret": "invalid-secret"})
    assert response.status_code == 403

    after = _metric_value(_scrape(), "authz_denied_total", labels)
    assert after == before + 1


def test_student_creation_route_is_mapped_as_business_event():
    """Un POST /students refusé doit compter comme student_created en échec."""
    labels = {"event": "student_created", "outcome": "failure"}
    before = _metric_value(_scrape(), "business_events_total", labels)

    # Sans authentification la création est rejetée : l'événement doit quand
    # même être comptabilisé avec outcome=failure.
    response = client.post("/api/v1/students/", json={})
    assert response.status_code in (401, 403, 422)

    after = _metric_value(_scrape(), "business_events_total", labels)
    assert after == before + 1


def test_normalised_payment_reversal_path_matches_mapping():
    """Le chemin normalisé d'une annulation de paiement doit matcher le mapping."""
    from app.middlewares.metrics import _BUSINESS_EVENTS, _normalise_path

    raw = "/api/v1/payments/123e4567-e89b-12d3-a456-426614174000/reverse/"
    normalised = _normalise_path(raw).rstrip("/")
    assert ("POST", normalised) in _BUSINESS_EVENTS
