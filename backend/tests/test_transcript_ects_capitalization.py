"""ECTS are capitalized once per stable UE identity across retakes."""
from app.api.v1.endpoints.academic.transcripts import _capitalized_ects


def _period(term_id, *subjects):
    return {"term_id": term_id, "subjects": list(subjects)}


def _subject(sid, ects, passed, name="UE"):
    return {"subject_id": sid, "subject_name": name,
            "ects": ects, "passed": passed}


def test_same_ue_passed_twice_earns_credits_once():
    periods = [
        _period("term-1", _subject("ue-1", 6, True)),
        _period("term-2", _subject("ue-1", 6, True)),
    ]
    assert _capitalized_ects(periods) == (6.0, 6.0)


def test_retake_failed_then_passed_earns_credits_once():
    periods = [
        _period("term-1", _subject("ue-1", 6, False)),
        _period("term-2", _subject("ue-1", 6, True)),
    ]
    assert _capitalized_ects(periods) == (6.0, 6.0)


def test_failed_retake_does_not_remove_previously_earned_credits():
    periods = [
        _period("term-1", _subject("ue-1", 6, True)),
        _period("term-2", _subject("ue-1", 6, False)),
    ]
    assert _capitalized_ects(periods) == (6.0, 6.0)


def test_two_distinct_ues_with_same_name_both_count():
    periods = [
        _period("term-1", _subject("ue-1", 5, True, "Projet")),
        _period("term-2", _subject("ue-2", 3, False, "Projet")),
    ]
    assert _capitalized_ects(periods) == (5.0, 8.0)


def test_undefined_subject_identity_is_not_deduplicated_by_title():
    periods = [
        _period("term-1", _subject(None, 2, True, "Projet")),
        _period("term-2", _subject(None, 3, True, "Projet")),
    ]
    assert _capitalized_ects(periods) == (5.0, 5.0)


def test_empty_or_zero_credit_ue_cannot_add_earned_credits():
    periods = [
        _period("term-1", _subject("ue-1", 0, True)),
        _period("term-2", _subject("ue-2", 4, False)),
    ]
    assert _capitalized_ects(periods) == (0.0, 4.0)


def test_no_periods_has_no_credits():
    assert _capitalized_ects([]) == (0, 0)
