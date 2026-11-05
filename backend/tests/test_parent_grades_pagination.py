"""Parent multi-child grade lists must paginate one authorized result set."""
from unittest.mock import MagicMock
from uuid import UUID, uuid4

from app.api.v1.endpoints.academic import grades


def _list(monkeypatch, *, allowed, page=1, page_size=2, student_id=None):
    db = MagicMock()
    calls = []
    monkeypatch.setattr(grades, "resolve_current_tenant_id", lambda *_: "tenant-1")
    monkeypatch.setattr(
        grades, "_allowed_student_ids_for_caller",
        lambda *_args, **_kwargs: allowed,
    )

    def fake_get_grades(**kwargs):
        calls.append(kwargs)
        return [], 5

    monkeypatch.setattr(grades.crud_grade, "get_grades", fake_get_grades)
    result = grades.list_grades(
        request=object(), db=db,
        current_user={"id": "parent", "roles": ["PARENT"]},
        page=page, page_size=page_size, student_id=student_id,
    )
    return result, calls


def test_second_page_queries_one_combined_result_set(monkeypatch):
    a, b = str(uuid4()), str(uuid4())
    result, calls = _list(
        monkeypatch, allowed={a, b}, page=2, page_size=2,
    )
    assert len(calls) == 1
    assert calls[0]["skip"] == 2
    assert calls[0]["limit"] == 2
    assert calls[0]["student_ids"] == {UUID(a), UUID(b)}
    assert "student_id" not in calls[0]
    assert result.page == 2
    assert result.pages == 3
    assert result.total == 5


def test_parent_cannot_filter_on_unrelated_student(monkeypatch):
    a, b, outsider = str(uuid4()), str(uuid4()), uuid4()
    result, calls = _list(
        monkeypatch, allowed={a, b}, student_id=outsider,
    )
    assert calls == []
    assert result.items == []
    assert result.total == 0


def test_parent_with_no_child_gets_no_grades(monkeypatch):
    result, calls = _list(monkeypatch, allowed=set())
    assert calls == []
    assert result.items == []


def test_single_child_preserves_existing_student_filter(monkeypatch):
    child = str(uuid4())
    result, calls = _list(monkeypatch, allowed={child})
    assert len(calls) == 1
    assert calls[0]["student_id"] == UUID(child)
    assert "student_ids" not in calls[0]
    assert result.pages == 3
