"""Bulletins, classement et relevés doivent distinguer les UE homonymes."""
import uuid
from unittest.mock import patch

import pytest

from app.services.grading import compute_weighted_average


def _row(subject_id, score, coefficient=1, name="Projet", max_score=20):
    return dict(subject_id=subject_id, subject_name=name, score=score,
                coefficient=coefficient, max_score=max_score, ects=6)


def test_same_named_subjects_keep_their_own_coefficients():
    rows = [_row("ue-a", 10, 3), _row("ue-b", 20, 1)]
    assert compute_weighted_average(rows) == pytest.approx(12.5)


def test_multiple_assessments_are_averaged_per_id_before_weighting():
    rows = [_row("ue-a", 8, 3), _row("ue-a", 12, 3), _row("ue-b", 20, 1)]
    assert compute_weighted_average(rows) == pytest.approx(12.5)


def test_same_id_with_changed_display_name_stays_one_subject():
    rows = [_row("ue-a", 8, 3, "Ancien nom"),
            _row("ue-a", 12, 3, "Nouveau nom"), _row("ue-b", 20, 1)]
    assert compute_weighted_average(rows) == pytest.approx(12.5)


def test_uuid_object_and_string_identify_the_same_subject():
    sid = uuid.uuid4()
    rows = [_row(sid, 8, 3), _row(str(sid), 12, 3), _row("ue-b", 20, 1)]
    assert compute_weighted_average(rows) == pytest.approx(12.5)


def test_missing_ids_preserve_legacy_name_grouping():
    rows = [_row(None, 8, 3, "Maths"), _row(None, 12, 3, "Maths"),
            _row(None, 20, 1, "Sport")]
    assert compute_weighted_average(rows) == pytest.approx(12.5)


def test_subject_name_cannot_collide_with_an_identified_subject_key():
    rows = [_row("ue-a", 10, 3), _row(None, 20, 1, "ue-a")]
    assert compute_weighted_average(rows) == pytest.approx(12.5)


def test_same_named_ungraded_subject_does_not_change_denominator():
    assert compute_weighted_average([_row("ue-a", 10, 3), _row("ue-b", None)]) == 10


def test_same_named_subjects_normalize_different_scales():
    rows = [_row("ue-a", 5, 3, max_score=10), _row("ue-b", 20, 1)]
    assert compute_weighted_average(rows) == pytest.approx(12.5)


def test_bulletin_and_transcript_share_unrounded_average():
    from app.api.v1.endpoints.academic.transcripts import _compute_term_average_from_grades
    from app.api.v1.endpoints.operational.school_life import _compute_average

    rows = [_row("ue-a", 9.991, 3), _row("ue-b", 9.996, 1)]
    expected = (9.991 * 3 + 9.996) / 4
    assert _compute_average(rows) == pytest.approx(expected)
    assert _compute_term_average_from_grades(rows, round_result=False) == pytest.approx(expected)


def test_same_named_subjects_do_not_reverse_class_ranking():
    from app.api.v1.endpoints.operational.school_life import _rank_batch_from_bulletin_grades

    ranks = _rank_batch_from_bulletin_grades(
        ["student-a", "student-b"],
        {"student-a": [_row("ue-a", 10, 3), _row("ue-b", 20, 1)],
         "student-b": [_row("ue-a", 14, 3), _row("ue-b", 14, 1)]},
    )
    assert ranks == {"student-a": (2, 2), "student-b": (1, 2)}


@pytest.fixture
def academic_subjects():
    # Réutilise un jeu ORM réel (deux matières, coefficients 3 et 1,
    # notes 10 et 20). PostgreSQL impose uq_subjects_tenant_name : les cas
    # homonymes restent des entrées du calcul pur, sans violer le schéma.
    from test_crud_grade import _make_tenant, _make_two_subject_fixture
    from app.core.database import SessionLocal
    from app.models.classroom import Classroom
    from app.models.enrollment import Enrollment

    tid = _make_tenant()
    ctx = _make_two_subject_fixture(tid)
    ctx.update(tenant_id=tid, classroom_id=str(uuid.uuid4()))
    with SessionLocal() as db:
        db.add(Classroom(id=ctx["classroom_id"], tenant_id=tid, name="Classe test",
                         academic_year_id=ctx["year_id"]))
        db.flush()
        db.add(Enrollment(id=str(uuid.uuid4()), tenant_id=tid,
                          student_id=ctx["student_id"], class_id=ctx["classroom_id"],
                          academic_year_id=ctx["year_id"], status="ACTIVE"))
        db.commit()
    return ctx


@pytest.mark.parametrize("source", ["student-average", "bulletin", "batch-bulletin"])
def test_database_paths_preserve_subject_identity(academic_subjects, source):
    from app.core.database import SessionLocal
    from app.crud.grade import get_student_average
    from app.api.v1.endpoints.operational.school_life import (
        _compute_average, _fetch_grades_for_term, _fetch_grades_for_term_batch,
    )

    ctx = academic_subjects
    with SessionLocal() as db:
        if source == "student-average":
            with patch("app.services.grading.compute_weighted_average", wraps=compute_weighted_average) as compute:
                result = get_student_average(db, ctx["student_id"], ctx["tenant_id"],
                                             academic_year=ctx["year_id"], semester=1)
            assert result == {"average": 12.5, "count": 2}
            rows = compute.call_args.args[0]
        else:
            if source == "bulletin":
                rows = _fetch_grades_for_term(db, ctx["student_id"], ctx["term_id"], ctx["tenant_id"])
            else:
                groups = _fetch_grades_for_term_batch(db, ctx["classroom_id"], ctx["term_id"], ctx["tenant_id"])
                rows = next(iter(groups.values()))
        assert len(rows) == 2
        assert all(row["subject_id"] is not None for row in rows)
        assert len({str(row["subject_id"]) for row in rows}) == 2
        assert _compute_average(rows) == pytest.approx(12.5)


def test_another_tenant_gets_no_grades(academic_subjects):
    from app.core.database import SessionLocal
    from app.crud.grade import get_student_average
    from app.api.v1.endpoints.operational.school_life import (
        _fetch_grades_for_term, _fetch_grades_for_term_batch,
    )

    ctx = academic_subjects
    other_tenant = str(uuid.uuid4())
    with SessionLocal() as db:
        assert get_student_average(db, ctx["student_id"], other_tenant) == {"average": 0.0, "count": 0}
        assert _fetch_grades_for_term(db, ctx["student_id"], ctx["term_id"], other_tenant) == []
        assert _fetch_grades_for_term_batch(db, ctx["classroom_id"], ctx["term_id"], other_tenant) == {}
