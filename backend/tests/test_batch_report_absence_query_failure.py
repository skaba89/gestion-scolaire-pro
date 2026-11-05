"""Batch bulletins must distinguish zero absences from an absent-data query failure."""
from datetime import date
from unittest.mock import MagicMock
from uuid import UUID

import pytest

from app.api.v1.endpoints.operational.school_life import _fetch_absences_batch


CID = "bf72cd2e-1b55-459c-81d7-4bb848de02e6"
TID = "67a2bbea-3650-4b0f-88d9-3f773d0888ed"
SD = date(2026, 9, 1)
ED = date(2026, 12, 31)


def _call(db):
    return _fetch_absences_batch(db, CID, SD, ED, TID)


def test_database_error_is_not_misreported_as_zero_absences():
    db = MagicMock()
    db.execute.side_effect = RuntimeError("attendance database unavailable")
    with pytest.raises(RuntimeError, match="attendance database unavailable"):
        _call(db)
    db.execute.assert_called_once()


def test_successful_empty_attendance_query_is_still_valid():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    assert _call(db) == {}


def test_batch_attendance_counts_are_kept_per_student():
    db = MagicMock()
    sid_a = UUID("ea584ecd-0f20-4a9a-90fe-b4bc75dba318")
    sid_b = UUID("bb1a1758-cdbc-49c5-b238-ae4d7a98be4f")
    db.execute.return_value.mappings.return_value.all.return_value = [
        {"student_id": sid_a, "excused": 2, "absent": 3, "late": 1},
        {"student_id": sid_b, "excused": 0, "absent": 0, "late": 0},
    ]
    result = _call(db)
    assert result[str(sid_a)] == {"excused": 2, "absent": 3, "late": 1}
    assert result[str(sid_b)] == {"excused": 0, "absent": 0, "late": 0}
    assert len(result) == 2
