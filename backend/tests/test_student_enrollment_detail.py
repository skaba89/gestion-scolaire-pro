"""Inscription individuelle : contrat frontend, isolation famille/élève et tenant."""
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
from app.models.academic_year import AcademicYear
from app.models.level import Level
from app.models.classroom import Classroom
from app.models.enrollment import Enrollment


@pytest.fixture
def enrollment_ctx():
    keys = ["tid", "parent", "student_user", "child", "other", "current_year", "old_year",
            "level", "current_class", "old_class", "current_enrollment", "old_enrollment"]
    x = {key: str(uuid.uuid4()) for key in keys}
    with SessionLocal() as db:
        db.add(Tenant(id=x["tid"], name="École Inscription", slug=f"enrollment-{x['tid']}",
                      type="primary", country="GN", settings={}))
        db.flush()
        db.add(User(id=x["parent"], tenant_id=x["tid"], email=f"{x['parent']}@example.com",
                    username=x["parent"], is_active=True))
        db.add(User(id=x["student_user"], tenant_id=x["tid"], email=f"{x['student_user']}@example.com",
                    username=x["student_user"], is_active=True))
        for key, first, user_id in [("child", "Awa", x["student_user"]), ("other", "Mamadou", None)]:
            db.add(Student(id=x[key], tenant_id=x["tid"], user_id=user_id,
                           registration_number=f"REG-{x[key]}", first_name=first, last_name="Bah",
                           date_of_birth=date(2012, 1, 1), gender=Gender.FEMALE))
        db.add(AcademicYear(id=x["old_year"], tenant_id=x["tid"], name="2025-2026", code="2025",
                            start_date=date(2025, 9, 1), end_date=date(2026, 6, 30), is_current=False))
        db.add(AcademicYear(id=x["current_year"], tenant_id=x["tid"], name="2026-2027", code="2026",
                            start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True))
        db.add(Level(id=x["level"], tenant_id=x["tid"], name="CM2", code="CM2"))
        db.flush()
        db.add(Classroom(id=x["old_class"], tenant_id=x["tid"], academic_year_id=x["old_year"],
                         level_id=x["level"], name="CM1 A"))
        db.add(Classroom(id=x["current_class"], tenant_id=x["tid"], academic_year_id=x["current_year"],
                         level_id=x["level"], name="CM2 A"))
        db.flush()
        db.add(ParentStudent(id=str(uuid.uuid4()), tenant_id=x["tid"], parent_id=x["parent"],
                             student_id=x["child"]))
        db.add(Enrollment(id=x["old_enrollment"], tenant_id=x["tid"], student_id=x["child"],
                          class_id=x["old_class"], academic_year_id=x["old_year"],
                          enrollment_date=date(2025, 9, 2), status="WITHDRAWN"))
        db.add(Enrollment(id=x["current_enrollment"], tenant_id=x["tid"], student_id=x["child"],
                          class_id=x["current_class"], academic_year_id=x["current_year"],
                          enrollment_date=date(2026, 9, 2), status="ACTIVE"))
        db.commit()
    x["user"] = {"id": x["parent"], "tenant_id": x["tid"], "roles": ["PARENT"]}
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_current_user] = lambda: x["user"]
    yield x
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)


def _headers(x):
    return {"Authorization": "Bearer " + create_access_token({
        "sub": x["user"]["id"], "tenant_id": x["user"]["tenant_id"], "roles": x["user"]["roles"],
    })}


def _get(x, student="child", status="active"):
    return client.get(f"/api/v1/students/{x[student]}/enrollment/", params={"status": status}, headers=_headers(x))


def test_parent_reads_current_child_enrollment_with_server_relations(enrollment_ctx):
    response = _get(enrollment_ctx)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["id"] == enrollment_ctx["current_enrollment"]
    assert data["status"] == "ACTIVE"
    assert data["classrooms"] == {"id": enrollment_ctx["current_class"], "name": "CM2 A",
                                   "level_id": enrollment_ctx["level"],
                                   "academic_year_id": enrollment_ctx["current_year"]}
    assert data["levels"]["name"] == "CM2"
    assert data["academic_years"]["name"] == "2026-2027"


def test_status_filter_can_return_historical_withdrawn_enrollment(enrollment_ctx):
    response = _get(enrollment_ctx, status="withdrawn")
    assert response.status_code == 200
    assert response.json()["id"] == enrollment_ctx["old_enrollment"]


def test_current_year_wins_if_historical_data_contains_two_active_rows(enrollment_ctx):
    with SessionLocal() as db:
        db.query(Enrollment).filter(Enrollment.id == enrollment_ctx["old_enrollment"]).update({"status": "ACTIVE"})
        db.commit()
    assert _get(enrollment_ctx).json()["id"] == enrollment_ctx["current_enrollment"]


def test_enrollment_rejects_a_classroom_from_another_academic_year(enrollment_ctx):
    with SessionLocal() as db:
        db.query(Classroom).filter(Classroom.id == enrollment_ctx["current_class"]).update(
            {"academic_year_id": enrollment_ctx["old_year"]}
        )
        db.commit()
    assert _get(enrollment_ctx).status_code == 404


def test_parent_cannot_read_unlinked_student_enrollment(enrollment_ctx):
    assert _get(enrollment_ctx, student="other").status_code == 404


def test_student_can_read_self_but_not_another_student(enrollment_ctx):
    enrollment_ctx["user"].update({"id": enrollment_ctx["student_user"], "roles": ["STUDENT"]})
    assert _get(enrollment_ctx).status_code == 200
    assert _get(enrollment_ctx, student="other").status_code == 404


def test_staff_with_permission_can_read_tenant_student(enrollment_ctx):
    enrollment_ctx["user"]["roles"] = ["TENANT_ADMIN"]
    assert _get(enrollment_ctx).status_code == 200


def test_missing_enrollment_is_a_real_404(enrollment_ctx):
    with SessionLocal() as db:
        db.query(Enrollment).filter(Enrollment.student_id == enrollment_ctx["child"]).delete()
        db.commit()
    assert _get(enrollment_ctx).status_code == 404


def test_other_tenant_cannot_read_enrollment(enrollment_ctx):
    enrollment_ctx["user"]["tenant_id"] = str(uuid.uuid4())
    assert _get(enrollment_ctx).status_code in (403, 404)


def test_database_failure_is_reported_as_unavailable_not_not_found(enrollment_ctx):
    with patch("sqlalchemy.orm.Session.query", side_effect=SQLAlchemyError("outage")):
        assert _get(enrollment_ctx).status_code == 503


def test_authentication_and_permission_are_required(enrollment_ctx):
    url = f"/api/v1/students/{enrollment_ctx['child']}/enrollment/"
    assert client.get(url).status_code == 401
    enrollment_ctx["user"]["roles"] = []
    assert _get(enrollment_ctx).status_code == 403

