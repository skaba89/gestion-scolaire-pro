"""The departments dashboard must receive only enrollments of selected classes."""
import uuid
import pytest
from conftest import get_test_client
from app.core.database import SessionLocal
from app.core.security import get_current_user
from app.main import app
from app.models.enrollment import Enrollment
from test_infrastructure_enrollments import _make_fixture, _as

client = get_test_client()
URL = "/api/v1/enrollments/"


@pytest.fixture(autouse=True)
def cleanup_auth():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def test_class_ids_filters_active_enrollments_in_sql():
    tenant, classroom_a, classroom_b, _ = _make_fixture()
    response = client.get(URL, params={
        "class_ids": classroom_a,
        "status": "active",
    }, headers=_as(tenant))
    assert response.status_code == 200, response.text
    assert len(response.json()) == 1
    assert {row["class_id"] for row in response.json()} == {classroom_a}

    both = client.get(URL, params={
        "class_ids": f"{classroom_a},{classroom_b}",
        "status": "ACTIVE",
    }, headers=_as(tenant))
    assert both.status_code == 200, both.text
    assert len(both.json()) == 2
    assert {row["class_id"] for row in both.json()} == {classroom_a, classroom_b}


def test_class_ids_does_not_expose_other_tenant_rows():
    tenant_a, classroom_a, _, _ = _make_fixture()
    tenant_b, classroom_b, _, _ = _make_fixture()
    response = client.get(URL, params={
        "class_ids": f"{classroom_a},{classroom_b}",
        "status": "active",
    }, headers=_as(tenant_a))
    assert response.status_code == 200, response.text
    assert {row["class_id"] for row in response.json()} == {classroom_a}
    assert all(row["tenant_id"] == tenant_a for row in response.json())


@pytest.mark.parametrize("class_ids", [
    "", "invalid-uuid", ",", str(uuid.uuid4()) + ",",
    ",".join([str(uuid.uuid4())] * 101),
])
def test_class_ids_rejects_malformed_requests(class_ids):
    tenant, _, _, _ = _make_fixture()
    response = client.get(URL, params={"class_ids": class_ids}, headers=_as(tenant))
    assert response.status_code == 422, response.text


def test_existing_class_id_filter_is_preserved():
    tenant, classroom_a, classroom_b, _ = _make_fixture()
    response = client.get(URL, params={
        "class_id": classroom_a,
        "class_ids": classroom_b,
    }, headers=_as(tenant))
    assert response.status_code == 200, response.text
    assert response.json() == []
