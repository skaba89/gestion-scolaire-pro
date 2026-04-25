"""Tests for academic grading endpoints — auth guards + endpoint existence."""
from conftest import get_test_client

client = get_test_client()


class TestGradesAuthGuards:
    """All grading endpoints must require authentication."""

    def test_grades_list_requires_auth(self):
        resp = client.get("/api/v1/academic/grades/")
        assert resp.status_code in (401, 403)

    def test_grade_create_requires_auth(self):
        resp = client.post("/api/v1/academic/grades/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_grade_detail_requires_auth(self):
        resp = client.get("/api/v1/academic/grades/nonexistent-id/")
        assert resp.status_code in (401, 403, 404)

    def test_assessments_list_requires_auth(self):
        resp = client.get("/api/v1/academic/assessments/")
        assert resp.status_code in (401, 403)

    def test_assessment_create_requires_auth(self):
        resp = client.post("/api/v1/academic/assessments/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_subjects_list_requires_auth(self):
        resp = client.get("/api/v1/academic/subjects/")
        assert resp.status_code in (401, 403)

    def test_subject_create_requires_auth(self):
        resp = client.post("/api/v1/academic/subjects/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_terms_list_requires_auth(self):
        resp = client.get("/api/v1/academic/terms/")
        assert resp.status_code in (401, 403)

    def test_term_create_requires_auth(self):
        resp = client.post("/api/v1/academic/terms/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_grade_stats_requires_auth(self):
        resp = client.get("/api/v1/academic/grades/stats/")
        assert resp.status_code in (401, 403, 404)


class TestGradesEndpointExistence:
    """Academic endpoints must be registered in the router."""

    def test_grades_endpoint_exists(self):
        resp = client.get("/api/v1/academic/grades/")
        assert resp.status_code != 404, "GET /academic/grades/ must exist"

    def test_assessments_endpoint_exists(self):
        resp = client.get("/api/v1/academic/assessments/")
        assert resp.status_code != 404, "GET /academic/assessments/ must exist"

    def test_subjects_endpoint_exists(self):
        resp = client.get("/api/v1/academic/subjects/")
        assert resp.status_code != 404, "GET /academic/subjects/ must exist"

    def test_terms_endpoint_exists(self):
        resp = client.get("/api/v1/academic/terms/")
        assert resp.status_code != 404, "GET /academic/terms/ must exist"


class TestGradesTenantIsolation:
    """Requêtes sans contexte tenant bloquées."""

    def test_grades_without_tenant_blocked(self):
        resp = client.get("/api/v1/academic/grades/")
        assert resp.status_code in (401, 403)

    def test_assessments_without_tenant_blocked(self):
        resp = client.get("/api/v1/academic/assessments/")
        assert resp.status_code in (401, 403)

    def test_subjects_without_tenant_blocked(self):
        resp = client.get("/api/v1/academic/subjects/")
        assert resp.status_code in (401, 403)

    def test_terms_without_tenant_blocked(self):
        resp = client.get("/api/v1/academic/terms/")
        assert resp.status_code in (401, 403)


class TestGradesInputValidation:
    """Payloads invalides doivent retourner 422 (si authentifié) ou 401/403."""

    def test_grade_create_empty_body(self):
        resp = client.post("/api/v1/academic/grades/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_assessment_create_empty_body(self):
        resp = client.post("/api/v1/academic/assessments/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_subject_create_empty_body(self):
        resp = client.post("/api/v1/academic/subjects/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_term_create_empty_body(self):
        resp = client.post("/api/v1/academic/terms/", json={})
        assert resp.status_code in (401, 403, 422)
