"""ANALYTICS-ZERO-01 (2026-11-23) : un indicateur qui ne peut pas être calculé répond 503.

Auparavant chaque route de ``/analytics/`` renvoyait des zéros (ou des listes vides) sur toute
erreur de base : un tableau de bord en panne affichait « 0 élève, 0 GNF, 0 % de présence »,
indiscernable d'un établissement vide. L'export ministériel écrivait même le texte de l'erreur
(SQL compris) dans le fichier remis à l'administration.

Les pannes sont simulées en faisant échouer la requête SQL propre à chaque indicateur.
"""
import logging
import uuid
from unittest.mock import patch

import pytest
from conftest import get_test_client
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
SECRET_SQL = "SELECT secret_column FROM grades"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def admin_headers():
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name="École Indicateurs", slug=f"kpi-{tenant_id[:8]}",
                      type="primary", country="GN", is_active=True, settings={}))
        db.commit()
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id, "_cycle_ids": None}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _failing_on(marker: str):
    """Fait échouer toute requête dont le SQL contient ``marker`` (panne de base simulée)."""
    real_execute = Session.execute

    def execute(self, statement, *args, **kwargs):
        if marker in str(statement):
            raise OperationalError(SECRET_SQL, {}, Exception("connexion perdue"))
        return real_execute(self, statement, *args, **kwargs)

    return patch.object(Session, "execute", execute)


@pytest.mark.parametrize("route, marker", [
    ("/api/v1/analytics/academic-kpis/", "FROM grades"),
    ("/api/v1/analytics/academic-stats/", "FROM grades"),
    ("/api/v1/analytics/students-at-risk/", "FROM grades"),
    ("/api/v1/analytics/grades-distribution/", "FROM grades"),
    ("/api/v1/analytics/attendance-trend/", "FROM attendance"),
    ("/api/v1/analytics/operational-kpis/", "FROM attendance"),
    ("/api/v1/analytics/financial-kpis/", "FROM invoices"),
    ("/api/v1/analytics/revenue-trend/", "FROM invoices"),
    ("/api/v1/analytics/debt-aging/", "FROM invoices"),
    ("/api/v1/analytics/revenue-by-category/", "FROM invoices"),
    ("/api/v1/analytics/dashboard-kpis/", "FROM students"),
    ("/api/v1/analytics/ministry-kpis/", "FROM students"),
    ("/api/v1/analytics/ministry-stats/levels/", "FROM students"),
])
def test_an_indicator_that_cannot_be_computed_answers_503_not_zero(admin_headers, route, marker, caplog):
    with caplog.at_level(logging.ERROR), _failing_on(marker):
        response = client.get(route, headers=admin_headers)

    assert response.status_code == 503, (route, response.text)
    assert "indisponible" in response.json()["detail"].lower()
    # Aucun détail technique renvoyé au client ; la panne est journalisée côté serveur.
    assert "secret_column" not in response.text and "OperationalError" not in response.text
    assert any("indisponible" in record.getMessage() for record in caplog.records)


def test_ministry_export_never_writes_the_database_error_into_the_report(admin_headers):
    with _failing_on("FROM students"):
        response = client.get("/api/v1/analytics/ministry-export/csv/", headers=admin_headers)

    assert response.status_code == 503, response.text
    assert "secret_column" not in response.text and "connexion perdue" not in response.text


def test_indicators_still_answer_normally_without_failure(admin_headers):
    for route in ("/api/v1/analytics/academic-kpis/", "/api/v1/analytics/students-at-risk/"):
        assert client.get(route, headers=admin_headers).status_code == 200, route
