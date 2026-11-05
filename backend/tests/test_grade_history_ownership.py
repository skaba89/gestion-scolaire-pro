"""Regression: parents and students may only inspect their own grade history.

These tests exercise the endpoint SQL boundary, so no data owned by another
student can enter the result even with a crafted grade_id or no filter.
"""
from unittest.mock import MagicMock

import pytest
from app.api.v1.endpoints.academic import grades


@pytest.fixture
def db(monkeypatch):
    fake_db = MagicMock()
    fake_db.execute.return_value.mappings.return_value.all.return_value = []
    monkeypatch.setattr(grades, "resolve_current_tenant_id", lambda *_: "tenant-1")
    return fake_db


def _run(db, **kwargs):
    return grades.list_grade_history(
        request=object(), db=db, current_user={"id": "viewer", "roles": ["PARENT"]},
        **kwargs,
    )


def test_parent_without_children_cannot_read_tenant_history(db, monkeypatch):
    monkeypatch.setattr(grades, "_allowed_student_ids_for_caller", lambda **_: set())
    assert _run(db) == []
    db.execute.assert_not_called()


def test_parent_cannot_query_other_students_history(db, monkeypatch):
    monkeypatch.setattr(grades, "_allowed_student_ids_for_caller", lambda **_: {"child-1"})
    assert _run(db, student_id="other-student") == []
    db.execute.assert_not_called()


def test_grade_id_filter_is_still_scoped_to_owned_students(db, monkeypatch):
    monkeypatch.setattr(grades, "_allowed_student_ids_for_caller", lambda **_: {"child-1", "child-2"})
    assert _run(db, grade_id="foreign-grade") == []
    statement, params = db.execute.call_args.args
    query = str(statement)
    assert "gh.tenant_id = :tenant_id" in query
    assert "gh.grade_id = :grade_id" in query
    assert "gh.student_id IN (:allowed_sid_0, :allowed_sid_1)" in query
    assert set([params["allowed_sid_0"], params["allowed_sid_1"]]) == {"child-1", "child-2"}
    assert params["grade_id"] == "foreign-grade"


def test_student_history_is_restricted_to_own_student_id(db, monkeypatch):
    monkeypatch.setattr(grades, "_allowed_student_ids_for_caller", lambda **_: {"own-student"})
    grades.list_grade_history(
        request=object(), db=db, current_user={"id": "student-user", "roles": ["STUDENT"]},
    )
    statement, params = db.execute.call_args.args
    assert "gh.student_id IN (:allowed_sid_0)" in str(statement)
    assert params["allowed_sid_0"] == "own-student"


def test_staff_with_unrestricted_read_retains_tenant_scoped_history(db, monkeypatch):
    monkeypatch.setattr(grades, "_allowed_student_ids_for_caller", lambda **_: None)
    grades.list_grade_history(
        request=object(), db=db, current_user={"id": "admin", "roles": ["TENANT_ADMIN"]},
    )
    statement, params = db.execute.call_args.args
    assert "gh.tenant_id = :tenant_id" in str(statement)
    assert "gh.student_id IN" not in str(statement)
    assert params["tenant_id"] == "tenant-1"
