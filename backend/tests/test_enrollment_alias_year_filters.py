"""Regression: enrollment aliases must honor school-year and class filters."""
import uuid
import pytest
from conftest import get_test_client
from app.core.database import SessionLocal
from app.core.security import get_current_user
from app.main import app
from app.models.enrollment import Enrollment
from test_infrastructure_enrollments import _make_fixture, _as

client = get_test_client()


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("url", [
    "/api/v1/enrollments/",
    "/api/v1/infrastructure/enrollments/",
])
def test_class_and_year_filters_are_applied_on_server(url):
    tenant_id, class_a, class_b, _ = _make_fixture()
    with SessionLocal() as db:
        school_year_id = str(db.query(Enrollment).filter(
            Enrollment.tenant_id == tenant_id,
            Enrollment.class_id == class_a,
        ).first().academic_year_id)

    result = client.get(url, params={
        "class_id": class_a,
        "academic_year_id": school_year_id,
        "status": "ACTIVE",
    }, headers=_as(tenant_id))
    assert result.status_code == 200, result.text
    rows = result.json()
    assert len(rows) == 1
    assert rows[0]["class_id"] == class_a
    assert rows[0]["academic_year_id"] == school_year_id
    assert rows[0]["status"] == "ACTIVE"

    wrong_year = client.get(url, params={
        "class_id": class_a,
        "academic_year_id": str(uuid.uuid4()),
    }, headers=_as(tenant_id))
    assert wrong_year.status_code == 200, wrong_year.text
    assert wrong_year.json() == []


def test_root_alias_rejects_bad_year_id_instead_of_ignoring_it():
    tenant_id, _, _, _ = _make_fixture()
    result = client.get("/api/v1/enrollments/", params={
        "academic_year_id": "not-a-uuid",
    }, headers=_as(tenant_id))
    assert result.status_code == 422
