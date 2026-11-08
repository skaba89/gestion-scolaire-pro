"""Report-card subject rows must agree with the shared weighted average."""
from uuid import uuid4

from app.api.v1.endpoints.operational import school_life as api


def _grade(subject_id, score, *, name="Sciences", coeff=1):
    return {
        "subject_id": subject_id, "subject_name": name,
        "score": score, "max_score": 20, "coefficient": coeff,
    }


def test_distinct_subjects_with_same_name_render_as_distinct_rows():
    first_id, second_id = str(uuid4()), str(uuid4())
    rows = [
        _grade(first_id, 8, coeff=2),
        _grade(second_id, 16, coeff=1),
    ]
    html = api._build_bulletin_v2(
        school_name="École témoin", student_name="Aminata Bah",
        grades=rows, general_average=api._compute_average(rows),
    )
    assert html.count("<td class=\"td-left\">Sciences</td>") == 2
    assert "8.00" in html
    assert "16.00" in html


def test_repeated_grades_same_subject_stay_in_one_row():
    subject_id = str(uuid4())
    rows = [_grade(subject_id, 10), _grade(subject_id, 14)]
    html = api._build_bulletin_v2(
        school_name="École témoin", student_name="Aminata Bah",
        grades=rows, general_average=api._compute_average(rows),
    )
    assert html.count("<td class=\"td-left\">Sciences</td>") == 1
    assert "12.00" in html


def test_legacy_subject_without_id_groups_by_name():
    rows = [_grade(None, 10), _grade(None, 14)]
    html = api._build_bulletin_v2(
        school_name="École témoin", student_name="Aminata Bah",
        grades=rows, general_average=api._compute_average(rows),
    )
    assert html.count("<td class=\"td-left\">Sciences</td>") == 1
