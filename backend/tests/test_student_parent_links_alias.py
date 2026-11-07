"""GET /student-parents/: tenant and family ownership regression tests."""
import uuid
from datetime import date
from unittest.mock import patch

import pytest
from sqlalchemy.exc import SQLAlchemyError
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal
from app.core.security import create_access_token, get_current_user
from app.main import app
from app.models.tenant import Tenant
from app.models.user import User
from app.models.student import Student, Gender
from app.models.parent_student import ParentStudent


@pytest.fixture
def links_ctx():
    keys = ["tenant", "other_tenant", "parent", "other_parent", "admin",
            "child", "other_child", "foreign_child", "link", "other_link", "foreign_link"]
    x = {key: str(uuid.uuid4()) for key in keys}
    with SessionLocal() as db:
        db.add(Tenant(id=x["tenant"], name="École Liens", slug=f"links-{x['tenant']}",
                      type="primary", country="GN", settings={}))
        db.add(Tenant(id=x["other_tenant"], name="Autre École", slug=f"links-{x['other_tenant']}",
                      type="primary", country="GN", settings={}))
        db.flush()
        for key, tenant in [("parent", "tenant"), ("other_parent", "tenant"), ("admin", "tenant")]:
            db.add(User(id=x[key], tenant_id=x[tenant], email=f"{x[key]}@example.com",
                        username=x[key], is_active=True))
        for key, tenant, first in [
            ("child", "tenant", "Awa"),
            ("other_child", "tenant", "Mamadou"),
            ("foreign_child", "other_tenant", "Fatou"),
        ]:
            db.add(Student(id=x[key], tenant_id=x[tenant], registration_number=f"REG-{x[key]}",
                           first_name=first, last_name="Bah", date_of_birth=date(2012, 1, 1),
                           gender=Gender.FEMALE))
        db.flush()
        db.add(ParentStudent(id=x["link"], tenant_id=x["tenant"], parent_id=x["parent"],
                             student_id=x["child"], is_primary=True, relation_type="MOTHER"))
        db.add(ParentStudent(id=x["other_link"], tenant_id=x["tenant"], parent_id=x["other_parent"],
                             student_id=x["other_child"], relation_type="FATHER"))
        db.add(ParentStudent(id=x["foreign_link"], tenant_id=x["other_tenant"],
                             parent_id=x["parent"], student_id=x["foreign_child"]))
        db.commit()

    x["user"] = {"id": x["parent"], "tenant_id": x["tenant"], "roles": ["PARENT"]}
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_current_user] = lambda: x["user"]
    yield x
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)


def _headers(x):
    return {"Authorization": "Bearer " + create_access_token({
        "sub": x["user"]["id"], "tenant_id": x["user"]["tenant_id"], "roles": x["user"]["roles"],
    })}


def _get(x, **params):
    return client.get("/api/v1/student-parents/", params=params, headers=_headers(x))


def test_parent_reads_only_own_links_with_nested_student(links_ctx):
    response = _get(links_ctx, parent_id=links_ctx["parent"])
    assert response.status_code == 200, response.text
    assert [row["id"] for row in response.json()] == [links_ctx["link"]]
    assert response.json()[0]["student"]["first_name"] == "Awa"


def test_parent_cannot_request_another_parents_links(links_ctx):
    assert _get(links_ctx, parent_id=links_ctx["other_parent"]).status_code == 403


def test_parent_student_filter_cannot_escape_family_scope(links_ctx):
    response = _get(links_ctx, parent_id=links_ctx["parent"], student_id=links_ctx["other_child"])
    assert response.status_code == 200
    assert response.json() == []


def test_tenant_admin_can_filter_links_but_not_cross_tenant(links_ctx):
    links_ctx["user"].update({"id": links_ctx["admin"], "roles": ["TENANT_ADMIN"]})
    response = _get(links_ctx, student_id=links_ctx["other_child"])
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [links_ctx["other_link"]]
    assert _get(links_ctx, student_id=links_ctx["foreign_child"]).json() == []


def test_unfiltered_listing_is_refused(links_ctx):
    assert _get(links_ctx).status_code == 422


def test_student_role_cannot_enumerate_family_links(links_ctx):
    links_ctx["user"]["roles"] = ["STUDENT"]
    assert _get(links_ctx, parent_id=links_ctx["parent"]).status_code == 403


def test_database_failure_is_not_reported_as_an_empty_family(links_ctx):
    with patch("sqlalchemy.orm.Session.query", side_effect=SQLAlchemyError("outage")):
        assert _get(links_ctx, parent_id=links_ctx["parent"]).status_code == 503


def test_authentication_is_required(links_ctx):
    assert client.get("/api/v1/student-parents/", params={"parent_id": links_ctx["parent"]}).status_code == 401
