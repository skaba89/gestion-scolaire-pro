"""Pure unit tests for app/services/grading.py's weighted-average helpers.

No DB/HTTP needed — these are the two shared algorithms behind bulletins
(compute_weighted_average, by coefficient) and university transcripts
(compute_ects_weighted_average, by ECTS credit — module université,
2026-09). Both must independently stay correct and never silently
re-diverge, per this module's own docstring rationale.
"""
from app.services.grading import compute_weighted_average, compute_ects_weighted_average


class TestComputeEctsWeightedAverage:
    def test_single_subject_average_equals_ects_weighted_average(self):
        rows = [
            {"subject_name": "Algorithmique", "ects": 6.0, "score": 14, "max_score": 20},
        ]
        assert compute_ects_weighted_average(rows) == 14.0

    def test_weights_by_ects_not_by_number_of_grades(self):
        # Algorithmique (6 ECTS) averages 10/20; Sport (1 ECTS) averages
        # 20/20 — a naive unweighted mean would land at 15, but ECTS
        # weighting should pull the result close to Algorithmique's 10.
        rows = [
            {"subject_name": "Algorithmique", "ects": 6.0, "score": 10, "max_score": 20},
            {"subject_name": "Sport", "ects": 1.0, "score": 20, "max_score": 20},
        ]
        result = compute_ects_weighted_average(rows)
        expected = (10.0 * 6.0 + 20.0 * 1.0) / 7.0
        assert result == expected

    def test_subject_with_zero_ects_is_excluded(self):
        """A subject carrying no credit weight must not silently corrupt an
        LMD-style average — unlike compute_weighted_average, which defaults
        a missing coefficient to 1."""
        rows = [
            {"subject_name": "Algorithmique", "ects": 6.0, "score": 10, "max_score": 20},
            {"subject_name": "Club optionnel", "ects": 0, "score": 20, "max_score": 20},
        ]
        assert compute_ects_weighted_average(rows) == 10.0

    def test_normalizes_scores_to_out_of_20(self):
        rows = [{"subject_name": "Algorithmique", "ects": 6.0, "score": 8, "max_score": 10}]
        assert compute_ects_weighted_average(rows) == 16.0

    def test_returns_none_when_no_gradable_rows(self):
        assert compute_ects_weighted_average([]) is None
        assert compute_ects_weighted_average([{"subject_name": "Algo", "ects": 6.0, "score": None, "max_score": 20}]) is None

    def test_averages_multiple_grades_within_same_subject_first(self):
        rows = [
            {"subject_name": "Algorithmique", "ects": 6.0, "score": 10, "max_score": 20},
            {"subject_name": "Algorithmique", "ects": 6.0, "score": 20, "max_score": 20},
        ]
        # Subject average = (10 + 20) / 2 = 15, weighted by its single ECTS weight.
        assert compute_ects_weighted_average(rows) == 15.0

    def test_differs_from_coefficient_weighted_average_when_weights_diverge(self):
        """The whole point of the ECTS-weighted calc: it must be able to
        disagree with the coefficient-weighted one when a subject's
        coefficient and ECTS value aren't proportional."""
        rows = [
            {"subject_name": "Algorithmique", "coefficient": 1, "ects": 6.0, "score": 8, "max_score": 20},
            {"subject_name": "Sport", "coefficient": 3, "ects": 1.0, "score": 18, "max_score": 20},
        ]
        coeff_weighted = compute_weighted_average(rows)
        ects_weighted = compute_ects_weighted_average(rows)
        assert coeff_weighted != ects_weighted
        # Coefficient-weighted skews toward Sport (coeff 3 vs 1) -> high average.
        # ECTS-weighted skews toward Algorithmique (6 ECTS vs 1) -> low average.
        assert ects_weighted < coeff_weighted
