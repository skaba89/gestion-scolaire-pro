"""PUT/DELETE /infrastructure/classrooms/{id}/ regression tests."""
import uuid
from datetime import date
from unittest.mock import patch

import pytest
from sqlalchemy.exc import SQLAlchemyError

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import AcademicYear, Classroom, Department, Enrollment, Level, Student, Tenant  # noqa: E402
from app.models.associations import classroom_departments  # noqa: E402
from app.models.student import Gender  # noqa: E402


HEADERS = {"Authorization": "Bearer mock-token"}
URL = "/api/v1/infrastructure/classrooms/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(tenant_id: str, roles=None):
    user = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "roles": roles or ["TENANT_ADMIN"],
    }
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _fixture():
    ids = {key: str(uuid.uuid4()) for key in (
        "tenant", "other_tenant", "classroom", "department", "other_level"
    )}
    with SessionLocal() as db:
        db.add_all([
            Tenant(id=ids["tenant"], name="École Classes", slug=f"class-{ids['tenant']}",
                   type="primary", country="GN", settings={}),
            Tenant(id=ids["other_tenant"], name="Autre École", slug=f"class-{ids['other_tenant']}",
                   type="primary", country="GN", settings={}),
        ])
        db.flush()
        db.add(Classroom(id=ids["classroom"], tenant_id=ids["tenant"], name="CM2 A", capacity=25))
        db.add(Department(id=ids["department"], tenant_id=ids["tenant"], name="Primaire"))
        db.add(Level(id=ids["other_level"], tenant_id=ids["other_tenant"], name="Niveau étranger"))
        db.commit()
    return ids


def test_updates_classroom_and_replaces_department_links():
    ids = _fixture()
    response = client.put(
        f"{URL}{ids['classroom']}/",
        json={
            "name": "CM2 B",
            "capacity": 32,
            "department_ids": [ids["department"], ids["department"]],
        },
        headers=_as(ids["tenant"]),
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "CM2 B"
    assert response.json()["capacity"] == 32

    with SessionLocal() as db:
        links = db.execute(classroom_departments.select().where(
            classroom_departments.c.class_id == ids["classroom"]
        )).fetchall()
        assert [str(row.department_id) for row in links] == [ids["department"]]


def test_partial_update_preserves_department_links():
    ids = _fixture()
    with SessionLocal() as db:
        db.execute(classroom_departments.insert().values(
            tenant_id=ids["tenant"], class_id=ids["classroom"], department_id=ids["department"]
        ))
        db.commit()

    response = client.put(
        f"{URL}{ids['classroom']}/", json={"capacity": 40}, headers=_as(ids["tenant"])
    )
    assert response.status_code == 200, response.text
    with SessionLocal() as db:
        assert db.execute(classroom_departments.select().where(
            classroom_departments.c.class_id == ids["classroom"]
        )).first() is not None


def test_rejects_foreign_tenant_reference_without_partial_update():
    ids = _fixture()
    response = client.put(
        f"{URL}{ids['classroom']}/",
        json={"name": "Nom piraté", "level_id": ids["other_level"]},
        headers=_as(ids["tenant"]),
    )
    assert response.status_code == 404
    with SessionLocal() as db:
        classroom = db.query(Classroom).filter(Classroom.id == ids["classroom"]).one()
        assert classroom.name == "CM2 A"
        assert classroom.level_id is None


def test_cross_tenant_update_is_hidden():
    ids = _fixture()
    response = client.put(
        f"{URL}{ids['classroom']}/", json={"name": "Piraté"}, headers=_as(ids["other_tenant"])
    )
    assert response.status_code == 404


def test_student_cannot_update_or_delete_classroom():
    ids = _fixture()
    headers = _as(ids["tenant"], ["STUDENT"])
    assert client.put(f"{URL}{ids['classroom']}/", json={"name": "X"}, headers=headers).status_code == 403
    assert client.delete(f"{URL}{ids['classroom']}/", headers=headers).status_code == 403


def test_deletes_only_an_unused_classroom():
    ids = _fixture()
    response = client.delete(f"{URL}{ids['classroom']}/", headers=_as(ids["tenant"]))
    assert response.status_code == 204, response.text
    with SessionLocal() as db:
        assert db.query(Classroom).filter(Classroom.id == ids["classroom"]).first() is None


def test_cross_tenant_delete_is_hidden():
    ids = _fixture()
    response = client.delete(f"{URL}{ids['classroom']}/", headers=_as(ids["other_tenant"]))
    assert response.status_code == 404
    with SessionLocal() as db:
        assert db.query(Classroom).filter(Classroom.id == ids["classroom"]).first() is not None


def test_refuses_to_delete_classroom_with_enrollment_history():
    ids = _fixture()
    student_id, year_id, enrollment_id = (str(uuid.uuid4()) for _ in range(3))
    with SessionLocal() as db:
        db.add(AcademicYear(
            id=year_id, tenant_id=ids["tenant"], name="2026-2027", code="AY-2026",
            start_date=date(2026, 9, 1), end_date=date(2027, 7, 31), is_current=True,
        ))
        db.add(Student(
            id=student_id, tenant_id=ids["tenant"], registration_number=f"REG-{student_id}",
            first_name="Awa", last_name="Bah", date_of_birth=date(2012, 1, 1), gender=Gender.FEMALE,
        ))
        db.flush()
        db.add(Enrollment(
            id=enrollment_id, tenant_id=ids["tenant"], student_id=student_id,
            class_id=ids["classroom"], academic_year_id=year_id, status="ACTIVE",
        ))
        db.commit()

    response = client.delete(f"{URL}{ids['classroom']}/", headers=_as(ids["tenant"]))
    assert response.status_code == 409, response.text
    with SessionLocal() as db:
        assert db.query(Classroom).filter(Classroom.id == ids["classroom"]).first() is not None
        assert db.query(Enrollment).filter(Enrollment.id == enrollment_id).first() is not None


def test_database_failure_is_not_reported_as_not_found():
    ids = _fixture()
    with patch("sqlalchemy.orm.Session.query", side_effect=SQLAlchemyError("outage")):
        response = client.put(
            f"{URL}{ids['classroom']}/", json={"name": "X"}, headers=_as(ids["tenant"])
        )
    assert response.status_code == 503
